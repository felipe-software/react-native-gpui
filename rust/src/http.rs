use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::anyhow;
use futures::AsyncReadExt;
use futures::future::BoxFuture;
use gpui::http_client::http::request::Parts;
use gpui::http_client::{
    AsyncBody, HttpClient, RedirectPolicy, Request, Response, StatusCode, Url, http,
};
use tokio::sync::Semaphore;

use crate::http_cache::{self, Entry, HttpCache, Stored};

const FOLLOW_ALL_LIMIT: usize = 32;
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const HTTP2_STREAMS_PER_HOST: usize = 128;
const HTTP1_CONNECTIONS_PER_HOST: usize = 6;
const HTTP2_STREAM_WINDOW: u32 = 6 * 1024 * 1024;
const HTTP2_CONNECTION_WINDOW: u32 = 15 * 1024 * 1024;
const USER_AGENT: &str = concat!("react-native-gpui/", env!("CARGO_PKG_VERSION"));

type Job = Box<dyn FnOnce() + Send + 'static>;

pub struct AppHttpClient;

struct Fetched {
    status: StatusCode,
    headers: http::HeaderMap,
    final_url: String,
    body: Vec<u8>,
}

struct HostGate {
    permits: Arc<Semaphore>,
    protocol_known: AtomicBool,
}

impl HttpClient for AppHttpClient {
    fn type_name(&self) -> &'static str {
        "AppHttpClient"
    }

    fn user_agent(&self) -> Option<&http::HeaderValue> {
        None
    }

    fn proxy(&self) -> Option<&Url> {
        None
    }

    fn send(
        &self,
        request: Request<AsyncBody>,
    ) -> BoxFuture<'static, anyhow::Result<Response<AsyncBody>>> {
        Box::pin(async move {
            let started = wall_ms();
            let (parts, mut body) = request.into_parts();
            let mut payload = Vec::new();
            body.read_to_end(&mut payload).await?;
            let url = parts.uri.to_string();
            let cache = if is_cacheable(&parts, &payload) {
                http_cache::shared()
            } else {
                None
            };
            if let Some(cache) = cache
                && let Some(entry) = cache.get(&url)
            {
                trace(&url, "cache", entry.meta.status, started, entry.body.len());
                if !entry.is_fresh() {
                    revalidate_in_background(cache, parts, entry.clone());
                }
                return response_from_entry(entry);
            }
            let fetched = send_on_runtime(parts, payload).await?;
            trace(
                &url,
                "network",
                fetched.status.as_u16(),
                started,
                fetched.body.len(),
            );
            if let Some(cache) = cache
                && fetched.status == StatusCode::OK
            {
                store_in_background(cache, url, &fetched);
            }
            response_from_fetched(fetched)
        })
    }
}

fn is_cacheable(parts: &Parts, payload: &[u8]) -> bool {
    let personal = ["authorization", "cookie", "range"]
        .iter()
        .any(|name| parts.headers.contains_key(*name));
    parts.method == http::Method::GET && payload.is_empty() && !personal
}

fn wall_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn trace(url: &str, source: &str, status: u16, started: u64, bytes: usize) {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    let enabled = *ENABLED.get_or_init(|| std::env::var_os("RNGPUI_HTTP_TRACE").is_some());
    if enabled {
        let line = serde_json::json!({
            "url": url,
            "source": source,
            "status": status,
            "startMs": started,
            "endMs": wall_ms(),
            "bytes": bytes,
        });
        eprintln!("[rngpui-http] {line}");
    }
}

fn runtime() -> &'static tokio::runtime::Handle {
    static HANDLE: OnceLock<tokio::runtime::Handle> = OnceLock::new();
    HANDLE.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel();
        thread::Builder::new()
            .name("rngpui-net".into())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("build the network runtime");
                let _ = tx.send(runtime.handle().clone());
                runtime.block_on(std::future::pending::<()>());
            })
            .expect("spawn rngpui-net");
        rx.recv().expect("network runtime handle")
    })
}

fn background(job: Job) {
    static WORKER: OnceLock<flume::Sender<Job>> = OnceLock::new();
    let worker = WORKER.get_or_init(|| {
        let (tx, rx) = flume::unbounded::<Job>();
        thread::Builder::new()
            .name("rngpui-http-cache".into())
            .spawn(move || {
                while let Ok(job) = rx.recv() {
                    job();
                }
            })
            .expect("spawn rngpui-http-cache");
        tx
    });
    let _ = worker.send(job);
}

fn client(redirects: usize) -> anyhow::Result<reqwest::Client> {
    static CLIENTS: OnceLock<Mutex<HashMap<usize, reqwest::Client>>> = OnceLock::new();
    let clients = CLIENTS.get_or_init(Default::default);
    let mut clients = clients.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(client) = clients.get(&redirects) {
        return Ok(client.clone());
    }
    let policy = if redirects == 0 {
        reqwest::redirect::Policy::none()
    } else {
        reqwest::redirect::Policy::limited(redirects)
    };
    let builder = reqwest::Client::builder()
        .redirect_policy(policy)
        .user_agent(USER_AGENT)
        .pool_idle_timeout(POOL_IDLE_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .tcp_nodelay(true)
        .http2_initial_stream_window_size(HTTP2_STREAM_WINDOW)
        .http2_initial_connection_window_size(HTTP2_CONNECTION_WINDOW);
    let client = builder.build()?;
    clients.insert(redirects, client.clone());
    Ok(client)
}

fn host_gate(url: &reqwest::Url) -> Arc<HostGate> {
    static GATES: OnceLock<Mutex<HashMap<String, Arc<HostGate>>>> = OnceLock::new();
    let origin = format!(
        "{}://{}:{}",
        url.scheme(),
        url.host_str().unwrap_or_default(),
        url.port_or_known_default().unwrap_or_default()
    );
    let gates = GATES.get_or_init(Default::default);
    let mut gates = gates.lock().unwrap_or_else(|error| error.into_inner());
    gates
        .entry(origin)
        .or_insert_with(|| {
            Arc::new(HostGate {
                permits: Arc::new(Semaphore::new(HTTP1_CONNECTIONS_PER_HOST)),
                protocol_known: AtomicBool::new(false),
            })
        })
        .clone()
}

fn redirect_limit(parts: &Parts) -> usize {
    match parts.extensions.get::<RedirectPolicy>() {
        Some(RedirectPolicy::FollowLimit(limit)) => *limit as usize,
        Some(RedirectPolicy::FollowAll) => FOLLOW_ALL_LIMIT,
        None | Some(RedirectPolicy::NoFollow) => 0,
    }
}

async fn execute(
    method: http::Method,
    url: String,
    headers: http::HeaderMap,
    redirects: usize,
    payload: Vec<u8>,
) -> anyhow::Result<Fetched> {
    let url = reqwest::Url::parse(&url)?;
    let gate = host_gate(&url);
    let permit = gate.permits.clone().acquire_owned().await?;
    let mut request = client(redirects)?.request(method, url).headers(headers);
    if !payload.is_empty() {
        request = request.body(payload);
    }
    let response = request.send().await?;
    learn_protocol(&gate, &response);
    let status = response.status();
    let headers = response.headers().clone();
    let final_url = response.url().to_string();
    let body = response.bytes().await?.to_vec();
    drop(permit);
    Ok(Fetched {
        status,
        headers,
        final_url,
        body,
    })
}

fn learn_protocol(gate: &HostGate, response: &reqwest::Response) {
    if gate.protocol_known.swap(true, Ordering::AcqRel) {
        return;
    }
    if response.version() == http::Version::HTTP_2 {
        gate.permits
            .add_permits(HTTP2_STREAMS_PER_HOST - HTTP1_CONNECTIONS_PER_HOST);
    }
}

async fn send_on_runtime(parts: Parts, payload: Vec<u8>) -> anyhow::Result<Fetched> {
    let (tx, rx) = flume::bounded(1);
    let redirects = redirect_limit(&parts);
    let url = parts.uri.to_string();
    runtime().spawn(async move {
        let _ = tx.send(execute(parts.method, url, parts.headers, redirects, payload).await);
    });
    rx.recv_async()
        .await
        .map_err(|_| anyhow!("the network runtime dropped the request"))?
}

fn header_pairs(headers: &http::HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect()
}

fn store_in_background(cache: &'static HttpCache, url: String, fetched: &Fetched) {
    let headers = header_pairs(&fetched.headers);
    let final_url = fetched.final_url.clone();
    let status = fetched.status;
    let body = fetched.body.clone();
    background(Box::new(move || {
        cache.put(
            &url,
            &Stored {
                final_url: &final_url,
                status: status.as_u16(),
                status_text: status.canonical_reason().unwrap_or(""),
                headers: &headers,
                body: &body,
            },
        );
    }));
}

fn revalidate_in_background(cache: &'static HttpCache, parts: Parts, entry: Entry) {
    let url = parts.uri.to_string();
    let redirects = redirect_limit(&parts);
    let mut headers = parts.headers.clone();
    for (name, value) in entry.validators() {
        if let Ok(value) = http::HeaderValue::from_str(&value) {
            headers.insert(name, value);
        }
    }
    runtime().spawn(async move {
        let started = wall_ms();
        let Ok(fetched) = execute(
            http::Method::GET,
            url.clone(),
            headers,
            redirects,
            Vec::new(),
        )
        .await
        else {
            return;
        };
        trace(
            &url,
            "revalidate",
            fetched.status.as_u16(),
            started,
            fetched.body.len(),
        );
        if fetched.status == StatusCode::NOT_MODIFIED {
            let revalidated = header_pairs(&fetched.headers);
            background(Box::new(move || {
                cache.refresh(&url, &entry, &revalidated);
            }));
        } else if fetched.status == StatusCode::OK {
            store_in_background(cache, url, &fetched);
        }
    });
}

pub fn preconnect(origins: Vec<String>) {
    for origin in origins {
        let Ok(url) = reqwest::Url::parse(&origin) else {
            continue;
        };
        runtime().spawn(async move {
            let gate = host_gate(&url);
            let Ok(client) = client(FOLLOW_ALL_LIMIT) else {
                return;
            };
            if let Ok(response) = client.head(url).send().await {
                learn_protocol(&gate, &response);
            }
        });
    }
}

fn response_from_entry(entry: Entry) -> anyhow::Result<Response<AsyncBody>> {
    let mut builder = Response::builder().status(StatusCode::from_u16(entry.meta.status)?);
    for (name, value) in &entry.meta.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    Ok(builder.body(AsyncBody::from(entry.body))?)
}

fn response_from_fetched(fetched: Fetched) -> anyhow::Result<Response<AsyncBody>> {
    let mut builder = Response::builder().status(fetched.status);
    for (name, value) in fetched.headers.iter() {
        builder = builder.header(name, value);
    }
    Ok(builder.body(AsyncBody::from(fetched.body))?)
}
