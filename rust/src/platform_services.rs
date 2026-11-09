use std::cell::RefCell;
use std::time::Duration;

use serde_json::{Value, json};

#[derive(serde::Deserialize)]
struct PlatformCall {
    id: u64,
    op: String,
    #[serde(default)]
    args: Value,
}

pub fn test_mode() -> bool {
    std::env::var_os("RNGPUI_TEST_MODE").is_some()
}

pub fn env_nonempty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

pub fn handle(json: &str) {
    let call = match serde_json::from_str::<PlatformCall>(json) {
        Ok(call) => call,
        Err(error) => {
            eprintln!("[platform] bad call json: {error}");
            return;
        }
    };
    let spawned = std::thread::Builder::new()
        .name(format!("rngpui-{}", call.op))
        .spawn(move || {
            let result = dispatch(&call.op, call.args);
            reply(call.id, result);
        });
    if let Err(error) = spawned {
        eprintln!("[platform] cannot start a worker thread: {error}");
    }
}

fn dispatch(op: &str, args: Value) -> Result<Value, String> {
    match op {
        "notifications.show" => crate::notifications::show(args).map(Value::Bool),
        "sound.play" => crate::sound::play(args).map(|()| Value::Null),
        "processes.findRunning" => crate::processes::find_running(args).map(|names| json!(names)),
        "storage.flush" => crate::storage::flush().map(|()| Value::Null),
        "clipboard.read" => read_clipboard(),
        other => Err(format!("unknown platform call {other}")),
    }
}

fn read_clipboard() -> Result<Value, String> {
    let (reply, answer) = flume::bounded(1);
    if !crate::send_incoming(crate::Incoming::ClipboardRead { reply }) {
        return Err("the service is shutting down".into());
    }
    match answer.recv_timeout(Duration::from_secs(5)) {
        Ok(text) => Ok(Value::String(text.unwrap_or_default())),
        Err(_) => Err("timed out reading the clipboard".into()),
    }
}

fn reply(id: u64, result: Result<Value, String>) {
    let payload = match result {
        Ok(value) => json!({ "id": id, "ok": true, "value": value }),
        Err(error) => json!({ "id": id, "ok": false, "error": error }),
    };
    crate::jsc::post("__rngpui_platformDone", payload.to_string());
}

pub fn run_with_timeout<T: Send + 'static>(
    timeout: Duration,
    work: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    let (sender, receiver) = flume::bounded(1);
    std::thread::Builder::new()
        .name("rngpui-platform-timeout".into())
        .spawn(move || {
            let _ = sender.send(work());
        })
        .ok()?;
    receiver.recv_timeout(timeout).ok()
}

const RANDOM_POOL_BYTES: usize = 4096;

struct RandomPool {
    bytes: [u8; RANDOM_POOL_BYTES],
    used: usize,
}

thread_local! {
    static RANDOM_POOL: RefCell<RandomPool> = const {
        RefCell::new(RandomPool {
            bytes: [0; RANDOM_POOL_BYTES],
            used: RANDOM_POOL_BYTES,
        })
    };
}

pub fn random_u32() -> u32 {
    RANDOM_POOL.with(|pool| {
        let mut pool = pool.borrow_mut();
        if pool.used + 4 > RANDOM_POOL_BYTES {
            if let Err(error) = getrandom::getrandom(&mut pool.bytes) {
                eprintln!("[platform] the OS random number generator failed: {error}");
                std::process::abort();
            }
            pool.used = 0;
        }
        let start = pool.used;
        pool.used += 4;
        u32::from_le_bytes([
            pool.bytes[start],
            pool.bytes[start + 1],
            pool.bytes[start + 2],
            pool.bytes[start + 3],
        ])
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_words_cover_the_whole_range() {
        let words: Vec<u32> = (0..4096).map(|_| random_u32()).collect();
        let mut distinct = words.clone();
        distinct.sort_unstable();
        distinct.dedup();
        assert!(
            distinct.len() > 4000,
            "only {} distinct words",
            distinct.len()
        );
        let high_bits = words.iter().filter(|word| **word >= 1 << 31).count();
        assert!(
            (1700..2400).contains(&high_bits),
            "{high_bits} of 4096 had the top bit"
        );
    }

    #[test]
    fn timeout_returns_none_for_stuck_work() {
        let finished = run_with_timeout(Duration::from_millis(20), || {
            std::thread::sleep(Duration::from_millis(500));
            1
        });
        assert_eq!(finished, None);
        assert_eq!(run_with_timeout(Duration::from_secs(5), || 7), Some(7));
    }

    #[test]
    fn unknown_ops_are_rejected() {
        assert!(dispatch("nope", Value::Null).is_err());
    }
}
