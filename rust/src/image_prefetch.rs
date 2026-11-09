use std::cell::RefCell;
use std::collections::HashMap;
use std::time::{Duration, Instant};

use gpui::{App, ImgResourceLoader, Resource, SharedString, SharedUri};

const FORGET_AFTER: Duration = Duration::from_secs(300);

thread_local! {
    static PREFETCHED: RefCell<HashMap<SharedString, Instant>> = RefCell::new(HashMap::new());
}

pub fn resource_for(url: &str) -> Resource {
    let is_remote = url.starts_with("http://") || url.starts_with("https://");
    if is_remote {
        Resource::Uri(SharedUri::from(url.to_string()))
    } else {
        Resource::Path(std::path::Path::new(url).into())
    }
}

pub fn prefetch(urls: Vec<String>, request_id: Option<u64>, cx: &mut App) {
    let now = Instant::now();
    let mut tasks = Vec::with_capacity(urls.len());
    for url in urls {
        if url.is_empty() {
            continue;
        }
        let (task, _) = cx.fetch_asset::<ImgResourceLoader>(&resource_for(&url));
        tasks.push(task);
        if crate::elements::chat_list::tracks_image(&url) {
            continue;
        }
        PREFETCHED.with_borrow_mut(|prefetched| {
            prefetched.entry(SharedString::from(url)).or_insert(now);
        });
    }
    let Some(request_id) = request_id else {
        return;
    };
    cx.spawn(async move |_cx| {
        let results = futures::future::join_all(tasks).await;
        let loaded = results.iter().all(|result| result.is_ok());
        crate::bridge::image_prefetched(request_id, loaded);
    })
    .detach();
}

pub fn adopt(url: &str) {
    PREFETCHED.with_borrow_mut(|prefetched| {
        prefetched.remove(url);
    });
}

pub fn sweep(now: Instant, cx: &mut App) {
    let stale: Vec<SharedString> = PREFETCHED.with_borrow_mut(|prefetched| {
        let stale: Vec<SharedString> = prefetched
            .iter()
            .filter(|(_, at)| now.saturating_duration_since(**at) >= FORGET_AFTER)
            .map(|(url, _)| url.clone())
            .collect();
        for url in &stale {
            prefetched.remove(url);
        }
        stale
    });
    for url in stale {
        cx.remove_asset::<ImgResourceLoader>(&resource_for(&url));
    }
}
