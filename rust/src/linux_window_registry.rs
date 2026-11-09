use std::path::PathBuf;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};

use gpui::Window;

static TITLE: OnceLock<String> = OnceLock::new();
static PUBLISHED: AtomicBool = AtomicBool::new(false);

pub fn directory() -> PathBuf {
    std::env::var_os("XDG_RUNTIME_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("rngpui-windows")
}

fn record_path() -> PathBuf {
    directory().join(format!("{}.json", std::process::id()))
}

pub fn capture_request_path() -> PathBuf {
    directory().join(format!("{}.capture", std::process::id()))
}

pub fn capture_enabled() -> bool {
    [
        "RNGPUI_CAPTURE_PNG",
        "RNGPUI_FRAME_CAPTURE",
        "RNGPUI_TEST_MODE",
    ]
    .iter()
    .any(|name| std::env::var_os(name).is_some())
}

pub fn set_title(title: String) {
    let _ = TITLE.set(title);
}

pub fn publish_first_content(window: &Window) {
    if !PUBLISHED.swap(true, Ordering::AcqRel) {
        write_record(window);
    }
}

pub fn republish(window: &Window) {
    if PUBLISHED.load(Ordering::Acquire) {
        write_record(window);
    }
}

fn owner_name() -> String {
    std::env::var("RNGPUI_APP_NAME")
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "rngpui-service".to_string())
}

fn process_name() -> String {
    std::fs::read_to_string("/proc/self/comm")
        .map(|name| name.trim().to_string())
        .unwrap_or_else(|_| "rngpui-service".to_string())
}

fn write_record(window: &Window) {
    let title = TITLE
        .get()
        .map(String::as_str)
        .unwrap_or("react-native-gpui");
    let bounds = window.bounds();
    let viewport = window.viewport_size();
    let pid = std::process::id();
    let owner = owner_name();
    let record = serde_json::json!({
        "id": pid,
        "window_id": pid,
        "pid": pid,
        "owner": owner,
        "app_name": owner,
        "title": title,
        "layer": 0,
        "x": f32::from(bounds.origin.x),
        "y": f32::from(bounds.origin.y),
        "width": f32::from(viewport.width),
        "height": f32::from(viewport.height),
        "alpha": 1.0,
        "display": crate::linux_display::backend_name(),
        "capture": capture_enabled(),
        "rngpui": true,
        "process": process_name(),
    });
    write_json(record_path(), &record);
}

fn secondary_record_path(window_id: u64) -> PathBuf {
    directory().join(format!("{}.w{window_id}.json", std::process::id()))
}

pub fn secondary_capture_request_path(window_id: u64) -> PathBuf {
    directory().join(format!("{}.w{window_id}.capture", std::process::id()))
}

pub fn publish_secondary(window_id: u64, window: &Window, title: &str, kind: &str) {
    let bounds = window.bounds();
    let viewport = window.viewport_size();
    let pid = std::process::id();
    let owner = owner_name();
    let record = serde_json::json!({
        "id": pid,
        "window_id": pid,
        "windowId": window_id,
        "secondary": true,
        "kind": kind,
        "pid": pid,
        "owner": owner,
        "app_name": owner,
        "title": title,
        "layer": 0,
        "x": f32::from(bounds.origin.x),
        "y": f32::from(bounds.origin.y),
        "width": f32::from(viewport.width),
        "height": f32::from(viewport.height),
        "alpha": 1.0,
        "display": crate::linux_display::backend_name(),
        "capture": capture_enabled(),
        "capture_request": secondary_capture_request_path(window_id),
        "rngpui": true,
        "process": process_name(),
    });
    write_json(secondary_record_path(window_id), &record);
}

pub fn remove_secondary(window_id: u64) {
    let _ = std::fs::remove_file(secondary_record_path(window_id));
    let _ = std::fs::remove_file(secondary_capture_request_path(window_id));
}

fn write_json(path: PathBuf, record: &serde_json::Value) {
    let staging = path.with_extension("json.staging");
    let written = std::fs::create_dir_all(directory())
        .and_then(|()| std::fs::write(&staging, record.to_string()))
        .and_then(|()| std::fs::rename(&staging, &path));
    if let Err(error) = written {
        eprintln!(
            "[rngpui] cannot publish window record {}: {error}",
            path.display()
        );
    }
}

pub fn remove() {
    let _ = std::fs::remove_file(record_path());
    let _ = std::fs::remove_file(capture_request_path());
    let prefix = format!("{}.w", std::process::id());
    if let Ok(entries) = std::fs::read_dir(directory()) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}
