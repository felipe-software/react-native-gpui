use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::storage::{DATA_DIR_CONVENTION, DataDirConvention, EnvLookup, app_dir_name, lookup};

const MAGIC: &[u8; 8] = b"RNGHTTP1";
const DEFAULT_MAX_MB: u64 = 256;
const FIRST_SCAN_DELAY: Duration = Duration::from_secs(20);
const TOUCH_AFTER: Duration = Duration::from_secs(3600);
const STALE_TEMP_AFTER: Duration = Duration::from_secs(3600);
const DEFAULT_FRESHNESS: Duration = Duration::from_secs(3600);
const MAX_HEURISTIC_FRESHNESS: Duration = Duration::from_secs(7 * 24 * 3600);
const EVICT_TO_PERCENT: u64 = 80;
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub url: String,
    pub final_url: String,
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub stored_ms: u64,
    pub fresh_until_ms: u64,
    pub body_len: u64,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub meta: Meta,
    pub body: Vec<u8>,
}

impl Entry {
    pub fn is_fresh(&self) -> bool {
        now_ms() < self.meta.fresh_until_ms
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        header_value(&self.meta.headers, name)
    }

    pub fn validators(&self) -> Vec<(&'static str, String)> {
        let mut validators = Vec::new();
        if let Some(etag) = self.header("etag") {
            validators.push(("If-None-Match", etag.to_string()));
        }
        if let Some(modified) = self.header("last-modified") {
            validators.push(("If-Modified-Since", modified.to_string()));
        }
        validators
    }
}

pub struct Stored<'a> {
    pub final_url: &'a str,
    pub status: u16,
    pub status_text: &'a str,
    pub headers: &'a [(String, String)],
    pub body: &'a [u8],
}

pub struct HttpCache {
    dir: PathBuf,
    max_bytes: u64,
    written: AtomicU64,
    scanning: AtomicBool,
    sequence: AtomicU64,
}

static SHARED: OnceLock<Option<HttpCache>> = OnceLock::new();
static FIRST_SCAN: std::sync::Once = std::sync::Once::new();

pub fn shared() -> Option<&'static HttpCache> {
    let cache = SHARED
        .get_or_init(|| {
            let dir = resolve_dir()?;
            Some(HttpCache::new(dir, max_bytes_from_env()))
        })
        .as_ref()?;
    FIRST_SCAN.call_once(|| cache.spawn_scan(FIRST_SCAN_DELAY));
    Some(cache)
}

fn max_bytes_from_env() -> u64 {
    std::env::var("RNGPUI_HTTP_CACHE_MAX_MB")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|megabytes| *megabytes > 0)
        .unwrap_or(DEFAULT_MAX_MB)
        * 1024
        * 1024
}

fn platform_cache_dir(env: EnvLookup, convention: DataDirConvention) -> Option<PathBuf> {
    let home = lookup(env, "HOME").map(PathBuf::from);
    match convention {
        DataDirConvention::MacOs => home.map(|home| home.join("Library").join("Caches")),
        DataDirConvention::Xdg => lookup(env, "XDG_CACHE_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| home.map(|home| home.join(".cache"))),
    }
}

pub fn resolve_dir_with(
    env: EnvLookup,
    cwd: &Path,
    convention: DataDirConvention,
) -> Option<PathBuf> {
    let disabled = lookup(env, "RNGPUI_HTTP_CACHE")
        .is_some_and(|value| matches!(value.trim(), "0" | "off" | "false"));
    if disabled {
        return None;
    }
    if let Some(dir) = lookup(env, "RNGPUI_CACHE_DIR") {
        return Some(cwd.join(dir).join("http"));
    }
    if env("RNGPUI_TEST_MODE").is_some() {
        return None;
    }
    let app_id = lookup(env, "RNGPUI_APP_ID").or_else(|| lookup(env, "RNGPUI_APP_NAME"));
    platform_cache_dir(env, convention)
        .map(|base| base.join(app_dir_name(app_id.as_deref())).join("http"))
}

pub fn resolve_dir() -> Option<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_default();
    resolve_dir_with(&|name| std::env::var(name).ok(), &cwd, DATA_DIR_CONVENTION)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn key_for(url: &str) -> String {
    let digest = Sha256::digest(url.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn header_value<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month = month as i64;
    let day_of_year =
        (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day as i64 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

pub fn parse_http_date(value: &str) -> Option<SystemTime> {
    let parts: Vec<&str> = value.split_whitespace().collect();
    let [_, day, month, year, clock, zone] = parts.as_slice() else {
        return None;
    };
    if *zone != "GMT" {
        return None;
    }
    let day: u32 = day.parse().ok()?;
    let month = MONTHS.iter().position(|name| name == month)? as u32 + 1;
    let year: i64 = year.parse().ok()?;
    let mut clock = clock.split(':').map(|part| part.parse::<i64>().ok());
    let hours = clock.next()??;
    let minutes = clock.next()??;
    let seconds = clock.next()??;
    let total = days_from_civil(year, month, day) * 86_400 + hours * 3600 + minutes * 60 + seconds;
    u64::try_from(total)
        .ok()
        .map(|seconds| UNIX_EPOCH + Duration::from_secs(seconds))
}

pub fn freshness(headers: &[(String, String)], now: SystemTime) -> Option<Duration> {
    let directives: Vec<String> = headers
        .iter()
        .filter(|(name, _)| name.eq_ignore_ascii_case("cache-control"))
        .flat_map(|(_, value)| value.split(','))
        .map(|directive| directive.trim().to_ascii_lowercase())
        .collect();
    if directives.iter().any(|directive| directive == "no-store") {
        return None;
    }
    if directives.iter().any(|directive| directive == "no-cache") {
        return Some(Duration::ZERO);
    }
    let age = header_value(headers, "age")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let max_age = directives.iter().find_map(|directive| {
        directive
            .strip_prefix("max-age=")
            .and_then(|value| value.trim_matches('"').parse::<u64>().ok())
    });
    if let Some(max_age) = max_age {
        return Some(Duration::from_secs(max_age.saturating_sub(age)));
    }
    let date = header_value(headers, "date")
        .and_then(parse_http_date)
        .unwrap_or(now);
    if let Some(expires) = header_value(headers, "expires") {
        let lifetime = parse_http_date(expires)
            .and_then(|expires| expires.duration_since(date).ok())
            .unwrap_or(Duration::ZERO);
        return Some(lifetime);
    }
    if let Some(modified) = header_value(headers, "last-modified").and_then(parse_http_date) {
        let unchanged_for = date.duration_since(modified).unwrap_or_default();
        return Some((unchanged_for / 10).min(MAX_HEURISTIC_FRESHNESS));
    }
    Some(DEFAULT_FRESHNESS)
}

fn encode(meta: &Meta, body: &[u8]) -> Option<Vec<u8>> {
    let json = serde_json::to_vec(meta).ok()?;
    let json_len = u32::try_from(json.len()).ok()?;
    let mut bytes = Vec::with_capacity(MAGIC.len() + 4 + json.len() + body.len());
    bytes.extend_from_slice(MAGIC);
    bytes.extend_from_slice(&json_len.to_le_bytes());
    bytes.extend_from_slice(&json);
    bytes.extend_from_slice(body);
    Some(bytes)
}

fn decode(bytes: &[u8], url: &str) -> Option<Entry> {
    let rest = bytes.strip_prefix(MAGIC.as_slice())?;
    let (length, rest) = rest.split_at_checked(4)?;
    let json_len = u32::from_le_bytes(length.try_into().ok()?) as usize;
    let (json, body) = rest.split_at_checked(json_len)?;
    let meta: Meta = serde_json::from_slice(json).ok()?;
    let matches = meta.url == url && meta.body_len == body.len() as u64;
    matches.then(|| Entry {
        meta,
        body: body.to_vec(),
    })
}

fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
}

fn touch(file: &File) {
    let due = file
        .metadata()
        .and_then(|metadata| metadata.modified())
        .map(|modified| modified.elapsed().unwrap_or_default() >= TOUCH_AFTER)
        .unwrap_or(false);
    if due {
        let _ = file.set_modified(SystemTime::now());
    }
}

struct ScanLock(File);

impl ScanLock {
    fn try_acquire(path: &Path) -> Option<Self> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .mode(0o600)
            .open(path)
            .ok()?;
        let status = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        (status == 0).then_some(Self(file))
    }
}

impl Drop for ScanLock {
    fn drop(&mut self) {
        unsafe { libc::flock(self.0.as_raw_fd(), libc::LOCK_UN) };
    }
}

struct Candidate {
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

impl HttpCache {
    pub fn new(dir: PathBuf, max_bytes: u64) -> Self {
        Self {
            dir,
            max_bytes,
            written: AtomicU64::new(0),
            scanning: AtomicBool::new(false),
            sequence: AtomicU64::new(0),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn entry_path(&self, key: &str) -> PathBuf {
        self.dir.join(&key[..2]).join(key)
    }

    pub fn get(&self, url: &str) -> Option<Entry> {
        let path = self.entry_path(&key_for(url));
        let mut file = File::open(&path).ok()?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).ok()?;
        match decode(&bytes, url) {
            Some(entry) => {
                touch(&file);
                Some(entry)
            }
            None => {
                let _ = fs::remove_file(&path);
                None
            }
        }
    }

    pub fn put(&'static self, url: &str, response: &Stored) -> bool {
        let stored = self.store(url, response);
        if stored && self.written.load(Ordering::Relaxed) > self.max_bytes / 10 {
            self.spawn_scan(Duration::ZERO);
        }
        stored
    }

    pub fn store(&self, url: &str, response: &Stored) -> bool {
        let Some(lifetime) = freshness(response.headers, SystemTime::now()) else {
            self.remove(url);
            return false;
        };
        if response.body.len() as u64 > self.max_bytes / 8 {
            return false;
        }
        let stored_ms = now_ms();
        let meta = Meta {
            url: url.to_string(),
            final_url: response.final_url.to_string(),
            status: response.status,
            status_text: response.status_text.to_string(),
            headers: response.headers.to_vec(),
            stored_ms,
            fresh_until_ms: stored_ms.saturating_add(lifetime.as_millis() as u64),
            body_len: response.body.len() as u64,
        };
        let Some(bytes) = encode(&meta, response.body) else {
            return false;
        };
        self.write(&key_for(url), &bytes)
    }

    pub fn refresh(&self, url: &str, entry: &Entry, revalidated: &[(String, String)]) -> Entry {
        let is_body_header = |name: &str| {
            ["content-length", "content-encoding", "transfer-encoding"]
                .iter()
                .any(|header| name.eq_ignore_ascii_case(header))
        };
        let updates: Vec<&(String, String)> = revalidated
            .iter()
            .filter(|(name, _)| !is_body_header(name))
            .collect();
        let mut headers: Vec<(String, String)> = entry
            .meta
            .headers
            .iter()
            .filter(|(name, _)| {
                !updates
                    .iter()
                    .any(|(updated, _)| updated.eq_ignore_ascii_case(name))
            })
            .cloned()
            .collect();
        headers.extend(updates.into_iter().cloned());
        let refreshed = Stored {
            final_url: &entry.meta.final_url,
            status: entry.meta.status,
            status_text: &entry.meta.status_text,
            headers: &headers,
            body: &entry.body,
        };
        self.store(url, &refreshed);
        let lifetime = freshness(&headers, SystemTime::now()).unwrap_or(Duration::ZERO);
        let stored_ms = now_ms();
        Entry {
            meta: Meta {
                headers,
                stored_ms,
                fresh_until_ms: stored_ms.saturating_add(lifetime.as_millis() as u64),
                ..entry.meta.clone()
            },
            body: entry.body.clone(),
        }
    }

    pub fn remove(&self, url: &str) {
        let _ = fs::remove_file(self.entry_path(&key_for(url)));
    }

    fn write(&self, key: &str, bytes: &[u8]) -> bool {
        let temp_dir = self.dir.join("tmp");
        if create_private_dir(&temp_dir).is_err() {
            return false;
        }
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let temp = temp_dir.join(format!("{key}.{}.{sequence}", std::process::id()));
        let target = self.entry_path(key);
        let written = (|| -> std::io::Result<()> {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .mode(0o600)
                .open(&temp)?;
            file.write_all(bytes)?;
            if let Some(parent) = target.parent() {
                create_private_dir(parent)?;
            }
            fs::rename(&temp, &target)
        })();
        if written.is_err() {
            let _ = fs::remove_file(&temp);
            return false;
        }
        self.written
            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
        true
    }

    fn spawn_scan(&'static self, delay: Duration) {
        if self.scanning.swap(true, Ordering::AcqRel) {
            return;
        }
        let spawned = std::thread::Builder::new()
            .name("rngpui-http-cache-scan".into())
            .spawn(move || {
                std::thread::sleep(delay);
                self.scan();
                self.scanning.store(false, Ordering::Release);
            });
        if spawned.is_err() {
            self.scanning.store(false, Ordering::Release);
        }
    }

    pub fn scan(&self) {
        if create_private_dir(&self.dir).is_err() {
            return;
        }
        let Some(_lock) = ScanLock::try_acquire(&self.dir.join(".scan.lock")) else {
            return;
        };
        self.written.store(0, Ordering::Relaxed);
        self.remove_stale_temps();
        let mut candidates = self.candidates();
        let mut total: u64 = candidates.iter().map(|candidate| candidate.size).sum();
        if total <= self.max_bytes {
            return;
        }
        let target = self.max_bytes / 100 * EVICT_TO_PERCENT;
        candidates.sort_by_key(|candidate| candidate.modified);
        for candidate in candidates {
            if total <= target {
                break;
            }
            if fs::remove_file(&candidate.path).is_ok() {
                total = total.saturating_sub(candidate.size);
            }
        }
    }

    fn remove_stale_temps(&self) {
        let Ok(temps) = fs::read_dir(self.dir.join("tmp")) else {
            return;
        };
        for temp in temps.flatten() {
            let stale = temp
                .metadata()
                .and_then(|metadata| metadata.modified())
                .map(|modified| modified.elapsed().unwrap_or_default() >= STALE_TEMP_AFTER)
                .unwrap_or(false);
            if stale {
                let _ = fs::remove_file(temp.path());
            }
        }
    }

    fn candidates(&self) -> Vec<Candidate> {
        let Ok(shards) = fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        let mut candidates = Vec::new();
        for shard in shards.flatten() {
            let is_shard = shard.file_name().len() == 2
                && shard.file_type().is_ok_and(|file_type| file_type.is_dir());
            if !is_shard {
                continue;
            }
            let Ok(files) = fs::read_dir(shard.path()) else {
                continue;
            };
            for file in files.flatten() {
                let Ok(metadata) = file.metadata() else {
                    continue;
                };
                if !metadata.is_file() {
                    continue;
                }
                candidates.push(Candidate {
                    path: file.path(),
                    size: metadata.len(),
                    modified: metadata.modified().unwrap_or(UNIX_EPOCH),
                });
            }
        }
        candidates
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rngpui-http-cache-{name}-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn leak(cache: HttpCache) -> &'static HttpCache {
        Box::leak(Box::new(cache))
    }

    fn headers(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect()
    }

    fn stored<'a>(headers: &'a [(String, String)], body: &'a [u8]) -> Stored<'a> {
        Stored {
            final_url: "https://cdn.example/final.webp",
            status: 200,
            status_text: "OK",
            headers,
            body,
        }
    }

    #[test]
    fn stores_and_reads_back_an_entry() {
        let cache = leak(HttpCache::new(temp_dir("roundtrip"), 1 << 20));
        let response_headers = headers(&[
            ("Content-Type", "image/webp"),
            ("Cache-Control", "max-age=60"),
        ]);
        assert!(cache.put(
            "https://cdn.example/a.webp",
            &stored(&response_headers, b"pixels")
        ));
        let entry = cache
            .get("https://cdn.example/a.webp")
            .expect("cached entry");
        assert_eq!(entry.body, b"pixels");
        assert_eq!(entry.meta.status, 200);
        assert_eq!(entry.meta.final_url, "https://cdn.example/final.webp");
        assert_eq!(entry.header("content-type"), Some("image/webp"));
        assert!(entry.is_fresh());
        assert!(cache.get("https://cdn.example/b.webp").is_none());
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn a_truncated_entry_is_a_miss_and_is_deleted() {
        let cache = leak(HttpCache::new(temp_dir("truncated"), 1 << 20));
        let response_headers = headers(&[("Cache-Control", "max-age=60")]);
        let url = "https://cdn.example/t.webp";
        assert!(cache.put(url, &stored(&response_headers, b"0123456789")));
        let path = cache.entry_path(&key_for(url));
        let bytes = fs::read(&path).unwrap();
        fs::write(&path, &bytes[..bytes.len() - 3]).unwrap();
        assert!(cache.get(url).is_none());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn no_store_responses_are_not_cached() {
        let cache = leak(HttpCache::new(temp_dir("no-store"), 1 << 20));
        let response_headers = headers(&[("Cache-Control", "private, no-store")]);
        assert!(!cache.put("https://cdn.example/n", &stored(&response_headers, b"x")));
        assert!(cache.get("https://cdn.example/n").is_none());
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn freshness_follows_cache_headers() {
        let now = UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        let lifetime = |pairs: &[(&str, &str)]| freshness(&headers(pairs), now);
        assert_eq!(
            lifetime(&[("Cache-Control", "public, max-age=600")]),
            Some(Duration::from_secs(600))
        );
        assert_eq!(
            lifetime(&[("Cache-Control", "max-age=600"), ("Age", "100")]),
            Some(Duration::from_secs(500))
        );
        assert_eq!(
            lifetime(&[("cache-control", "no-cache")]),
            Some(Duration::ZERO)
        );
        assert_eq!(lifetime(&[("Cache-Control", "no-store")]), None);
        assert_eq!(
            lifetime(&[
                ("Date", "Tue, 14 Nov 2023 22:13:20 GMT"),
                ("Expires", "Tue, 14 Nov 2023 23:13:20 GMT"),
            ]),
            Some(Duration::from_secs(3600))
        );
        assert_eq!(
            lifetime(&[
                ("Date", "Tue, 14 Nov 2023 22:13:20 GMT"),
                ("Last-Modified", "Sat, 04 Nov 2023 22:13:20 GMT"),
            ]),
            Some(Duration::from_secs(86_400))
        );
        assert_eq!(lifetime(&[]), Some(DEFAULT_FRESHNESS));
    }

    #[test]
    fn parses_imf_fixdate() {
        assert_eq!(
            parse_http_date("Sun, 06 Nov 1994 08:49:37 GMT"),
            Some(UNIX_EPOCH + Duration::from_secs(784_111_777))
        );
        assert_eq!(
            parse_http_date("Tue, 29 Feb 2028 00:00:00 GMT"),
            Some(UNIX_EPOCH + Duration::from_secs(1_835_395_200))
        );
        assert_eq!(parse_http_date("Sunday, 06-Nov-94 08:49:37 GMT"), None);
        assert_eq!(parse_http_date("garbage"), None);
    }

    #[test]
    fn refresh_keeps_the_body_and_takes_new_validators() {
        let cache = leak(HttpCache::new(temp_dir("refresh"), 1 << 20));
        let url = "https://api.example/set.json";
        let original = headers(&[("ETag", "\"v1\""), ("Cache-Control", "no-cache")]);
        assert!(cache.put(url, &stored(&original, b"{\"emotes\":[]}")));
        let entry = cache.get(url).unwrap();
        assert!(!entry.is_fresh());
        assert_eq!(
            entry.validators(),
            vec![("If-None-Match", "\"v1\"".to_string())]
        );
        let refreshed = cache.refresh(
            url,
            &entry,
            &headers(&[("ETag", "\"v2\""), ("Cache-Control", "max-age=60")]),
        );
        assert!(refreshed.is_fresh());
        let reread = cache.get(url).unwrap();
        assert_eq!(reread.body, b"{\"emotes\":[]}");
        assert_eq!(reread.header("etag"), Some("\"v2\""));
        assert!(reread.is_fresh());
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn eviction_drops_the_least_recently_used_entries_first() {
        let cache = leak(HttpCache::new(temp_dir("evict"), 4096));
        let response_headers = headers(&[("Cache-Control", "max-age=600")]);
        let body = vec![7u8; 400];
        let urls: Vec<String> = (0..10)
            .map(|index| format!("https://cdn.example/{index}"))
            .collect();
        for (index, url) in urls.iter().enumerate() {
            assert!(cache.store(url, &stored(&response_headers, &body)));
            let path = cache.entry_path(&key_for(url));
            let file = File::options().write(true).open(&path).unwrap();
            file.set_modified(UNIX_EPOCH + Duration::from_secs(1_000_000 + index as u64))
                .unwrap();
        }
        cache.scan();
        let present: HashMap<&str, bool> = urls
            .iter()
            .map(|url| (url.as_str(), cache.entry_path(&key_for(url)).exists()))
            .collect();
        assert!(!present["https://cdn.example/0"]);
        assert!(!present["https://cdn.example/1"]);
        assert!(present["https://cdn.example/9"]);
        let total: u64 = cache
            .candidates()
            .iter()
            .map(|candidate| candidate.size)
            .sum();
        assert!(total <= 4096 / 100 * EVICT_TO_PERCENT);
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn concurrent_writers_leave_one_whole_entry() {
        let cache = leak(HttpCache::new(temp_dir("concurrent"), 1 << 24));
        let url = "https://cdn.example/race.webp";
        let writers: Vec<_> = (0..8u8)
            .map(|index| {
                std::thread::spawn(move || {
                    let response_headers = headers(&[("Cache-Control", "max-age=60")]);
                    let body = vec![index; 64 * 1024];
                    for _ in 0..20 {
                        cache.store(url, &stored(&response_headers, &body));
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }
        let entry = cache.get(url).expect("a whole entry survives");
        assert_eq!(entry.body.len(), 64 * 1024);
        assert!(entry.body.iter().all(|byte| *byte == entry.body[0]));
        let leftovers = fs::read_dir(cache.dir().join("tmp")).unwrap().count();
        assert_eq!(leftovers, 0);
        let _ = fs::remove_dir_all(cache.dir());
    }

    #[test]
    fn resolves_the_cache_dir_per_platform_and_mode() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| value.to_string())
            }
        };
        let cwd = Path::new("/work");
        let linux = env(&[("HOME", "/home/u"), ("RNGPUI_APP_ID", "com.example.app")]);
        assert_eq!(
            resolve_dir_with(&linux, cwd, DataDirConvention::Xdg),
            Some(PathBuf::from("/home/u/.cache/com.example.app/http"))
        );
        let xdg = env(&[
            ("HOME", "/home/u"),
            ("XDG_CACHE_HOME", "/var/cache/u"),
            ("RNGPUI_APP_NAME", "a/b"),
        ]);
        assert_eq!(
            resolve_dir_with(&xdg, cwd, DataDirConvention::Xdg),
            Some(PathBuf::from("/var/cache/u/a_b/http"))
        );
        let mac = env(&[("HOME", "/Users/u"), ("RNGPUI_APP_ID", "com.example.app")]);
        assert_eq!(
            resolve_dir_with(&mac, cwd, DataDirConvention::MacOs),
            Some(PathBuf::from(
                "/Users/u/Library/Caches/com.example.app/http"
            ))
        );
        let test_mode = env(&[("HOME", "/home/u"), ("RNGPUI_TEST_MODE", "1")]);
        assert_eq!(
            resolve_dir_with(&test_mode, cwd, DataDirConvention::Xdg),
            None
        );
        let explicit = env(&[("RNGPUI_TEST_MODE", "1"), ("RNGPUI_CACHE_DIR", "cache")]);
        assert_eq!(
            resolve_dir_with(&explicit, cwd, DataDirConvention::Xdg),
            Some(PathBuf::from("/work/cache/http"))
        );
        let off = env(&[("HOME", "/home/u"), ("RNGPUI_HTTP_CACHE", "0")]);
        assert_eq!(resolve_dir_with(&off, cwd, DataDirConvention::Xdg), None);
    }
}
