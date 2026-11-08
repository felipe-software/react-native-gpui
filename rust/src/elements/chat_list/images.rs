use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::FutureExt as _;
use gpui::{App, ImgResourceLoader, RenderImage, Resource, SharedString, SharedUri, Window};

const MIN_FRAME_DELAY_MS: u64 = 20;
const SHORT_FRAME_DELAY_MS: u64 = 100;
const WAKE_SLACK: Duration = Duration::from_millis(2);
const EVICT_AFTER: Duration = Duration::from_secs(300);
const EVICT_SWEEP_EVERY: Duration = Duration::from_secs(30);

pub struct LoadedImage {
    pub data: Arc<RenderImage>,
    frame_ends_ms: Vec<u64>,
    total_ms: u64,
}

impl LoadedImage {
    fn new(data: Arc<RenderImage>) -> Self {
        let mut frame_ends_ms = Vec::with_capacity(data.frame_count());
        let mut total_ms = 0u64;
        if data.frame_count() > 1 {
            for frame in 0..data.frame_count() {
                total_ms += normalized_delay_ms(Duration::from(data.delay(frame)));
                frame_ends_ms.push(total_ms);
            }
        }
        Self {
            data,
            frame_ends_ms,
            total_ms,
        }
    }

    pub fn is_animated(&self) -> bool {
        self.total_ms > 0
    }

    pub fn frame_at(&self, now: Instant, animate: bool) -> (usize, Option<Instant>) {
        if !animate || !self.is_animated() {
            return (0, None);
        }
        let elapsed_ms = now.saturating_duration_since(epoch()).as_millis() as u64;
        let phase = elapsed_ms % self.total_ms;
        let frame = self.frame_ends_ms.partition_point(|end| *end <= phase);
        let frame = frame.min(self.frame_ends_ms.len() - 1);
        let remaining = self.frame_ends_ms[frame] - phase;
        (frame, Some(now + Duration::from_millis(remaining.max(1))))
    }
}

fn normalized_delay_ms(delay: Duration) -> u64 {
    let millis = delay.as_millis() as u64;
    if millis <= 10 {
        SHORT_FRAME_DELAY_MS
    } else {
        millis.max(MIN_FRAME_DELAY_MS)
    }
}

enum Slot {
    Loading,
    Ready(Arc<LoadedImage>),
    Failed,
}

struct Entry {
    slot: Slot,
    last_used: Instant,
}

thread_local! {
    static EPOCH: Instant = Instant::now();
    static IMAGES: RefCell<HashMap<SharedString, Entry>> = RefCell::new(HashMap::new());
    static WAKE: Cell<Option<Instant>> = const { Cell::new(None) };
    static LAST_SWEEP: Cell<Option<Instant>> = const { Cell::new(None) };
    static WAKES_SCHEDULED: Cell<u64> = const { Cell::new(0) };
}

fn epoch() -> Instant {
    EPOCH.with(|epoch| *epoch)
}

fn resource_for(url: &str) -> Resource {
    let is_remote = url.starts_with("http://") || url.starts_with("https://");
    if is_remote {
        Resource::Uri(SharedUri::from(url.to_string()))
    } else {
        Resource::Path(std::path::Path::new(url).into())
    }
}

pub fn image(
    url: &SharedString,
    now: Instant,
    window: &mut Window,
    cx: &mut App,
) -> Option<Arc<LoadedImage>> {
    if url.is_empty() {
        return None;
    }
    let known = IMAGES.with_borrow_mut(|images| {
        images.get_mut(url).map(|entry| {
            entry.last_used = now;
            match &entry.slot {
                Slot::Ready(image) => Some(Some(image.clone())),
                Slot::Loading | Slot::Failed => Some(None),
            }
        })
    });
    if let Some(Some(result)) = known {
        return result;
    }
    if known.is_some() {
        return None;
    }
    start_loading(url.clone(), now, window, cx)
}

fn start_loading(
    url: SharedString,
    now: Instant,
    window: &mut Window,
    cx: &mut App,
) -> Option<Arc<LoadedImage>> {
    let resource = resource_for(&url);
    let (task, _) = cx.fetch_asset::<ImgResourceLoader>(&resource);
    if let Some(result) = task.clone().now_or_never() {
        let slot = slot_for(result);
        let ready = match &slot {
            Slot::Ready(image) => Some(image.clone()),
            _ => None,
        };
        IMAGES.with_borrow_mut(|images| {
            images.insert(
                url,
                Entry {
                    slot,
                    last_used: now,
                },
            )
        });
        return ready;
    }
    IMAGES.with_borrow_mut(|images| {
        images.insert(
            url.clone(),
            Entry {
                slot: Slot::Loading,
                last_used: now,
            },
        )
    });
    window
        .spawn(cx, async move |cx| {
            let result = task.await;
            let slot = slot_for(result);
            IMAGES.with_borrow_mut(|images| {
                if let Some(entry) = images.get_mut(&url) {
                    entry.slot = slot;
                }
            });
            let _ = cx.update(|window, _cx| {
                crate::anim_overlay::arm_paint_only_frame();
                window.refresh();
            });
        })
        .detach();
    None
}

fn slot_for(result: Result<Arc<RenderImage>, gpui::ImageCacheError>) -> Slot {
    match result {
        Ok(data) => Slot::Ready(Arc::new(LoadedImage::new(data))),
        Err(error) => {
            if std::env::var_os("RNGPUI_CHAT_LIST_DEBUG").is_some() {
                eprintln!("[chat-list] image failed: {error}");
            }
            Slot::Failed
        }
    }
}

pub fn request_wake(deadline: Instant, window: &mut Window, cx: &mut App) {
    if let Some(existing) = WAKE.get()
        && existing <= deadline + WAKE_SLACK
    {
        return;
    }
    WAKE.set(Some(deadline));
    WAKES_SCHEDULED.set(WAKES_SCHEDULED.get() + 1);
    let delay = deadline.saturating_duration_since(Instant::now());
    window
        .spawn(cx, async move |cx| {
            cx.background_executor().timer(delay).await;
            let _ = cx.update(|window, _cx| {
                if WAKE.get() != Some(deadline) {
                    return;
                }
                WAKE.set(None);
                crate::anim_overlay::arm_paint_only_frame();
                window.refresh();
            });
        })
        .detach();
}

pub fn wakes_scheduled() -> u64 {
    WAKES_SCHEDULED.get()
}

pub fn loaded_count() -> (usize, usize, usize) {
    IMAGES.with_borrow(|images| {
        let mut ready = 0;
        let mut loading = 0;
        let mut failed = 0;
        for entry in images.values() {
            match entry.slot {
                Slot::Ready(_) => ready += 1,
                Slot::Loading => loading += 1,
                Slot::Failed => failed += 1,
            }
        }
        (ready, loading, failed)
    })
}

pub fn sweep(now: Instant, window: &mut Window, cx: &mut App) {
    let due = LAST_SWEEP
        .get()
        .is_none_or(|last| now.saturating_duration_since(last) >= EVICT_SWEEP_EVERY);
    if !due {
        return;
    }
    LAST_SWEEP.set(Some(now));
    let stale: Vec<(SharedString, Option<Arc<LoadedImage>>)> = IMAGES.with_borrow_mut(|images| {
        let keys: Vec<SharedString> = images
            .iter()
            .filter(|(_, entry)| {
                let idle = now.saturating_duration_since(entry.last_used) >= EVICT_AFTER;
                idle && !matches!(entry.slot, Slot::Loading)
            })
            .map(|(url, _)| url.clone())
            .collect();
        keys.into_iter()
            .filter_map(|url| {
                let entry = images.remove(&url)?;
                let image = match entry.slot {
                    Slot::Ready(image) => Some(image),
                    _ => None,
                };
                Some((url, image))
            })
            .collect()
    });
    for (url, image) in stale {
        cx.remove_asset::<ImgResourceLoader>(&resource_for(&url));
        if let Some(image) = image {
            let _ = window.drop_image(image.data.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalized_delay_ms;
    use std::time::Duration;

    #[test]
    fn tiny_gif_delays_play_at_browser_speed() {
        assert_eq!(normalized_delay_ms(Duration::from_millis(0)), 100);
        assert_eq!(normalized_delay_ms(Duration::from_millis(10)), 100);
        assert_eq!(normalized_delay_ms(Duration::from_millis(15)), 20);
        assert_eq!(normalized_delay_ms(Duration::from_millis(40)), 40);
    }
}
