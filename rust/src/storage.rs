use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const FILE_NAME: &str = "local-storage.json";
const LOCK_NAME: &str = "local-storage.json.lock";
const DEFAULT_APP_ID: &str = "react-native-gpui";
const DEBOUNCE: Duration = Duration::from_millis(250);
const MAX_DELAY: Duration = Duration::from_secs(2);

pub type Entries = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StorageOp {
    Set(String, String),
    Remove(String),
    Clear,
}

impl StorageOp {
    pub fn parse(json: &str) -> Result<Self, String> {
        let parts: Vec<String> =
            serde_json::from_str(json).map_err(|error| format!("bad storage op: {error}"))?;
        let mut parts = parts.into_iter();
        let op = parts.next().unwrap_or_default();
        let key = parts.next();
        let value = parts.next();
        match (op.as_str(), key, value) {
            ("set", Some(key), Some(value)) => Ok(Self::Set(key, value)),
            ("remove", Some(key), None) => Ok(Self::Remove(key)),
            ("clear", None, None) => Ok(Self::Clear),
            _ => Err(format!("bad storage op: {json}")),
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Pending {
    cleared: bool,
    changes: BTreeMap<String, Option<String>>,
}

impl Pending {
    pub fn apply(&mut self, op: StorageOp) {
        match op {
            StorageOp::Set(key, value) => {
                self.changes.insert(key, Some(value));
            }
            StorageOp::Remove(key) => {
                self.changes.insert(key, None);
            }
            StorageOp::Clear => {
                self.cleared = true;
                self.changes.clear();
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        !self.cleared && self.changes.is_empty()
    }

    fn then(mut self, newer: Pending) -> Pending {
        if newer.cleared {
            return newer;
        }
        self.changes.extend(newer.changes);
        self
    }

    pub fn merge_into(self, base: Entries) -> Entries {
        let mut merged = if self.cleared { Entries::new() } else { base };
        for (key, change) in self.changes {
            match change {
                Some(value) => {
                    merged.insert(key, value);
                }
                None => {
                    merged.remove(&key);
                }
            }
        }
        merged
    }
}

pub struct Snapshot {
    pub path: Option<PathBuf>,
    pub entries: Entries,
}

impl Snapshot {
    pub fn to_js_global(&self) -> String {
        let path = self.path.as_ref().map(|path| path.display().to_string());
        let value = serde_json::json!({ "path": path, "data": self.entries });
        format!("globalThis.__rngpuiStorage={value};")
    }
}

struct Store {
    path: PathBuf,
    pending: Mutex<Pending>,
    flushing: Mutex<()>,
    wake: flume::Sender<()>,
}

static STORE: OnceLock<Store> = OnceLock::new();

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn app_dir_name(raw: Option<&str>) -> String {
    let cleaned: String = raw
        .unwrap_or(DEFAULT_APP_ID)
        .trim()
        .chars()
        .map(|c| {
            let unsafe_char = c == '/' || c == '\\' || c.is_control();
            if unsafe_char { '_' } else { c }
        })
        .collect();
    let reserved = cleaned.is_empty() || cleaned == "." || cleaned == "..";
    if reserved {
        DEFAULT_APP_ID.to_string()
    } else {
        cleaned
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DataDirConvention {
    MacOs,
    Xdg,
}

pub(crate) const DATA_DIR_CONVENTION: DataDirConvention = if cfg!(target_os = "macos") {
    DataDirConvention::MacOs
} else {
    DataDirConvention::Xdg
};

pub(crate) type EnvLookup<'a> = &'a dyn Fn(&str) -> Option<String>;

pub(crate) fn lookup(env: EnvLookup, name: &str) -> Option<String> {
    env(name).filter(|value| !value.trim().is_empty())
}

fn platform_data_dir(env: EnvLookup, convention: DataDirConvention) -> Option<PathBuf> {
    let home = lookup(env, "HOME").map(PathBuf::from);
    match convention {
        DataDirConvention::MacOs => {
            home.map(|home| home.join("Library").join("Application Support"))
        }
        DataDirConvention::Xdg => lookup(env, "XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| home.map(|home| home.join(".local").join("share"))),
    }
}

pub fn resolve_dir_with(
    env: EnvLookup,
    cwd: &Path,
    convention: DataDirConvention,
) -> Option<PathBuf> {
    if let Some(dir) = lookup(env, "RNGPUI_STORAGE_DIR") {
        return Some(cwd.join(dir));
    }
    if env("RNGPUI_TEST_MODE").is_some() {
        return None;
    }
    let app_id = lookup(env, "RNGPUI_APP_ID").or_else(|| lookup(env, "RNGPUI_APP_NAME"));
    platform_data_dir(env, convention).map(|base| base.join(app_dir_name(app_id.as_deref())))
}

pub fn resolve_dir() -> Option<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_default();
    resolve_dir_with(&|name| std::env::var(name).ok(), &cwd, DATA_DIR_CONVENTION)
}

fn parse_entries(bytes: &[u8]) -> Result<Entries, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    let serde_json::Value::Object(object) = value else {
        return Err("top-level value is not an object".to_string());
    };
    Ok(object
        .into_iter()
        .map(|(key, value)| {
            let text = match value {
                serde_json::Value::String(text) => text,
                other => other.to_string(),
            };
            (key, text)
        })
        .collect())
}

fn quarantine(path: &Path, reason: &str) {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    let aside = path.with_file_name(format!("{FILE_NAME}.corrupt-{stamp}"));
    match fs::rename(path, &aside) {
        Ok(()) => eprintln!(
            "[storage] {} is unreadable ({reason}); moved it to {} and started empty",
            path.display(),
            aside.display()
        ),
        Err(error) => eprintln!(
            "[storage] {} is unreadable ({reason}) and could not be moved aside: {error}",
            path.display()
        ),
    }
}

pub fn read_entries(path: &Path) -> Result<Entries, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Entries::new()),
        Err(error) => return Err(format!("cannot read {}: {error}", path.display())),
    };
    match parse_entries(&bytes) {
        Ok(entries) => Ok(entries),
        Err(reason) => {
            quarantine(path, &reason);
            Ok(Entries::new())
        }
    }
}

fn create_private_dir(dir: &Path) -> Result<(), String> {
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .map_err(|error| format!("cannot create {}: {error}", dir.display()))
}

struct FileLock(File);

impl FileLock {
    fn acquire(path: &Path) -> Result<Self, String> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| format!("cannot open {}: {error}", path.display()))?;
        let status = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX) };
        if status != 0 {
            return Err(format!(
                "cannot lock {}: {}",
                path.display(),
                std::io::Error::last_os_error()
            ));
        }
        Ok(Self(file))
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        unsafe { libc::flock(self.0.as_raw_fd(), libc::LOCK_UN) };
    }
}

fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let staging = path.with_file_name(format!("{FILE_NAME}.{}.tmp", std::process::id()));
    let written = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&staging)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&staging, path)?;
        if let Some(dir) = path.parent()
            && let Ok(dir) = File::open(dir)
        {
            let _ = dir.sync_all();
        }
        Ok(())
    })();
    written.map_err(|error| {
        let _ = fs::remove_file(&staging);
        format!("cannot write {}: {error}", path.display())
    })
}

pub fn commit(path: &Path, pending: Pending) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    create_private_dir(dir)?;
    let _lock = FileLock::acquire(&dir.join(LOCK_NAME))?;
    let base = if pending.cleared {
        Entries::new()
    } else {
        read_entries(path)?
    };
    let merged = pending.merge_into(base);
    let bytes = serde_json::to_vec(&merged).map_err(|error| error.to_string())?;
    write_atomically(path, &bytes)
}

pub fn init() -> Snapshot {
    let Some(dir) = resolve_dir() else {
        return Snapshot {
            path: None,
            entries: Entries::new(),
        };
    };
    let path = dir.join(FILE_NAME);
    let entries = read_entries(&path).unwrap_or_else(|error| {
        eprintln!("[storage] {error}; localStorage starts empty");
        Entries::new()
    });
    let (wake, wakes) = flume::bounded::<()>(1);
    let store = Store {
        path: path.clone(),
        pending: Mutex::new(Pending::default()),
        flushing: Mutex::new(()),
        wake,
    };
    if STORE.set(store).is_err() {
        eprintln!("[storage] already initialized; keeping the first store");
    } else {
        std::thread::Builder::new()
            .name("rngpui-storage".into())
            .spawn(move || writer_loop(wakes))
            .expect("spawn localStorage writer thread");
        unsafe { libc::atexit(flush_at_exit) };
        install_signal_flush();
    }
    Snapshot {
        path: Some(path),
        entries,
    }
}

pub fn is_persistent() -> bool {
    STORE.get().is_some()
}

pub fn apply(op: StorageOp) {
    let Some(store) = STORE.get() else {
        return;
    };
    lock(&store.pending).apply(op);
    let _ = store.wake.try_send(());
}

pub fn flush() -> Result<(), String> {
    let Some(store) = STORE.get() else {
        return Ok(());
    };
    let _serial = lock(&store.flushing);
    let pending = std::mem::take(&mut *lock(&store.pending));
    if pending.is_empty() {
        return Ok(());
    }
    commit(&store.path, pending.clone()).inspect_err(|_| {
        let mut current = lock(&store.pending);
        let newer = std::mem::take(&mut *current);
        *current = pending.then(newer);
    })
}

pub fn flush_logged(reason: &str) {
    if let Err(error) = flush() {
        eprintln!("[storage] flush on {reason} failed: {error}");
    }
}

fn writer_loop(wakes: flume::Receiver<()>) {
    while wakes.recv().is_ok() {
        let first_change = Instant::now();
        loop {
            let waited = first_change.elapsed();
            if waited >= MAX_DELAY {
                break;
            }
            match wakes.recv_timeout(DEBOUNCE.min(MAX_DELAY - waited)) {
                Ok(()) => continue,
                Err(_) => break,
            }
        }
        if let Err(error) = flush() {
            eprintln!("[storage] write failed, will retry on the next change: {error}");
        }
    }
}

extern "C" fn flush_at_exit() {
    flush_logged("exit");
}

static SIGNAL_PIPE_WRITE: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(-1);
const FLUSHED_SIGNALS: [libc::c_int; 3] = [libc::SIGTERM, libc::SIGINT, libc::SIGHUP];

extern "C" fn on_terminating_signal(signal: libc::c_int) {
    let fd = SIGNAL_PIPE_WRITE.load(std::sync::atomic::Ordering::Relaxed);
    if fd >= 0 {
        let byte = signal as u8;
        unsafe { libc::write(fd, (&byte as *const u8).cast(), 1) };
    }
}

fn install_signal_flush() {
    let mut fds = [0i32; 2];
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
        eprintln!("[storage] signal pipe failed; a SIGTERM may drop the last 2s of writes");
        return;
    }
    SIGNAL_PIPE_WRITE.store(fds[1], std::sync::atomic::Ordering::Relaxed);
    let read_fd = fds[0];
    let spawned = std::thread::Builder::new()
        .name("rngpui-storage-signal".into())
        .spawn(move || {
            let mut byte = [0u8; 1];
            loop {
                let read = unsafe { libc::read(read_fd, byte.as_mut_ptr().cast(), 1) };
                if read == 1 {
                    break;
                }
                let interrupted =
                    read < 0 && std::io::Error::last_os_error().kind() == ErrorKind::Interrupted;
                if !interrupted {
                    return;
                }
            }
            let signal = byte[0] as libc::c_int;
            flush_logged("signal");
            unsafe {
                libc::signal(signal, libc::SIG_DFL);
                libc::kill(libc::getpid(), signal);
            }
        });
    if spawned.is_err() {
        eprintln!("[storage] signal thread failed; a SIGTERM may drop the last 2s of writes");
        return;
    }
    for signal in FLUSHED_SIGNALS {
        unsafe {
            let mut action: libc::sigaction = std::mem::zeroed();
            libc::sigaction(signal, std::ptr::null(), &mut action);
            if action.sa_sigaction != libc::SIG_DFL {
                continue;
            }
            action.sa_sigaction = on_terminating_signal as *const () as usize;
            action.sa_flags = libc::SA_RESTART;
            libc::sigemptyset(&mut action.sa_mask);
            libc::sigaction(signal, &action, std::ptr::null_mut());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "rngpui-storage-test-{label}-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn entries(pairs: &[(&str, &str)]) -> Entries {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn ops_parse_from_the_preamble_wire_shape() {
        assert_eq!(
            StorageOp::parse(r#"["set","k","v"]"#).unwrap(),
            StorageOp::Set("k".into(), "v".into())
        );
        assert_eq!(
            StorageOp::parse(r#"["remove","k"]"#).unwrap(),
            StorageOp::Remove("k".into())
        );
        assert_eq!(StorageOp::parse(r#"["clear"]"#).unwrap(), StorageOp::Clear);
        assert!(StorageOp::parse(r#"["set","k"]"#).is_err());
        assert!(StorageOp::parse(r#"["drop","k"]"#).is_err());
        assert!(StorageOp::parse("{}").is_err());
    }

    #[test]
    fn pending_changes_merge_over_what_another_process_wrote() {
        let mut pending = Pending::default();
        pending.apply(StorageOp::Set("mine".into(), "1".into()));
        pending.apply(StorageOp::Set("mine".into(), "2".into()));
        pending.apply(StorageOp::Remove("stale".into()));
        let disk = entries(&[("theirs", "x"), ("stale", "y")]);
        assert_eq!(
            pending.merge_into(disk),
            entries(&[("mine", "2"), ("theirs", "x")])
        );
    }

    #[test]
    fn clear_drops_earlier_changes_and_the_disk_state() {
        let mut pending = Pending::default();
        pending.apply(StorageOp::Set("before".into(), "1".into()));
        pending.apply(StorageOp::Clear);
        pending.apply(StorageOp::Set("after".into(), "2".into()));
        let disk = entries(&[("theirs", "x")]);
        assert_eq!(pending.merge_into(disk), entries(&[("after", "2")]));
    }

    #[test]
    fn a_failed_write_keeps_its_changes_under_newer_ones() {
        let mut older = Pending::default();
        older.apply(StorageOp::Set("a".into(), "old".into()));
        older.apply(StorageOp::Set("b".into(), "kept".into()));
        let mut newer = Pending::default();
        newer.apply(StorageOp::Set("a".into(), "new".into()));
        let merged = older.then(newer).merge_into(Entries::new());
        assert_eq!(merged, entries(&[("a", "new"), ("b", "kept")]));

        let mut cleared = Pending::default();
        cleared.apply(StorageOp::Clear);
        let mut stale = Pending::default();
        stale.apply(StorageOp::Set("gone".into(), "1".into()));
        assert_eq!(
            stale.then(cleared).merge_into(entries(&[("disk", "1")])),
            Entries::new()
        );
    }

    #[test]
    fn commit_writes_a_private_file_atomically_and_merges() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("commit").join("nested");
        let path = dir.join(FILE_NAME);
        let mut first = Pending::default();
        first.apply(StorageOp::Set("token".into(), "secret".into()));
        commit(&path, first).unwrap();
        fs::write(&path, r#"{"token":"secret","other":"from-elsewhere"}"#).unwrap();
        let mut second = Pending::default();
        second.apply(StorageOp::Set("theme".into(), "dark".into()));
        commit(&path, second).unwrap();

        assert_eq!(
            read_entries(&path).unwrap(),
            entries(&[
                ("other", "from-elsewhere"),
                ("theme", "dark"),
                ("token", "secret")
            ])
        );
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let dir_mode = fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(dir_mode, 0o700);
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "staging files left behind: {leftovers:?}"
        );
        fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_corrupt_file_is_moved_aside_instead_of_overwritten() {
        let dir = temp_dir("corrupt");
        let path = dir.join(FILE_NAME);
        fs::write(&path, b"{not json").unwrap();
        assert_eq!(read_entries(&path).unwrap(), Entries::new());
        assert!(!path.exists());
        let quarantined = fs::read_dir(&dir).unwrap().flatten().any(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.starts_with("local-storage.json.corrupt-")
                && fs::read(entry.path()).unwrap() == b"{not json"
        });
        assert!(quarantined);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn non_string_values_load_as_their_json_text() {
        let parsed = parse_entries(br#"{"n":3,"b":true,"s":"x","o":{"a":1}}"#).unwrap();
        assert_eq!(
            parsed,
            entries(&[("b", "true"), ("n", "3"), ("o", r#"{"a":1}"#), ("s", "x")])
        );
        assert!(parse_entries(b"[1,2]").is_err());
    }

    fn env_of<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        }
    }

    fn resolve(pairs: &[(&str, &str)], convention: DataDirConvention) -> Option<PathBuf> {
        resolve_dir_with(&env_of(pairs), Path::new("/work"), convention)
    }

    #[test]
    fn storage_dir_override_wins_and_relative_paths_use_the_cwd() {
        let xdg = DataDirConvention::Xdg;
        assert_eq!(
            resolve(
                &[("RNGPUI_STORAGE_DIR", "/tmp/s"), ("RNGPUI_TEST_MODE", "1")],
                xdg
            ),
            Some(PathBuf::from("/tmp/s"))
        );
        assert_eq!(
            resolve(&[("RNGPUI_STORAGE_DIR", "state")], xdg),
            Some(PathBuf::from("/work/state"))
        );
    }

    #[test]
    fn test_mode_without_an_override_never_touches_the_data_dir() {
        let env = [
            ("RNGPUI_TEST_MODE", "1"),
            ("HOME", "/home/u"),
            ("XDG_DATA_HOME", "/xdg"),
        ];
        assert_eq!(resolve(&env, DataDirConvention::Xdg), None);
        assert_eq!(resolve(&env, DataDirConvention::MacOs), None);
    }

    #[test]
    fn data_dir_follows_xdg_then_home_with_the_app_id() {
        let xdg = DataDirConvention::Xdg;
        assert_eq!(
            resolve(
                &[
                    ("XDG_DATA_HOME", "/xdg"),
                    ("HOME", "/home/u"),
                    ("RNGPUI_APP_ID", "com.example.Chat"),
                    ("RNGPUI_APP_NAME", "Chat")
                ],
                xdg
            ),
            Some(PathBuf::from("/xdg/com.example.Chat"))
        );
        assert_eq!(
            resolve(
                &[
                    ("XDG_DATA_HOME", "relative"),
                    ("HOME", "/home/u"),
                    ("RNGPUI_APP_NAME", "Chat")
                ],
                xdg
            ),
            Some(PathBuf::from("/home/u/.local/share/Chat"))
        );
        assert_eq!(
            resolve(&[("HOME", "/home/u")], xdg),
            Some(PathBuf::from("/home/u/.local/share/react-native-gpui"))
        );
        assert_eq!(resolve(&[], xdg), None);
    }

    #[test]
    fn macos_data_dir_is_application_support() {
        assert_eq!(
            resolve(
                &[
                    ("HOME", "/Users/u"),
                    ("XDG_DATA_HOME", "/xdg"),
                    ("RNGPUI_APP_ID", "com.example.Chat")
                ],
                DataDirConvention::MacOs
            ),
            Some(PathBuf::from(
                "/Users/u/Library/Application Support/com.example.Chat"
            ))
        );
    }

    #[test]
    fn app_ids_become_one_safe_path_component() {
        assert_eq!(app_dir_name(Some("com.example.Chat")), "com.example.Chat");
        assert_eq!(app_dir_name(Some("Team Machine")), "Team Machine");
        assert_eq!(app_dir_name(Some("../../etc")), ".._.._etc");
        assert_eq!(app_dir_name(Some("a/b\\c")), "a_b_c");
        assert_eq!(app_dir_name(Some("..")), DEFAULT_APP_ID);
        assert_eq!(app_dir_name(Some("  ")), DEFAULT_APP_ID);
        assert_eq!(app_dir_name(None), DEFAULT_APP_ID);
    }

    fn global_value(snapshot: &Snapshot) -> serde_json::Value {
        let script = snapshot.to_js_global();
        let json = script
            .strip_prefix("globalThis.__rngpuiStorage=")
            .and_then(|rest| rest.strip_suffix(';'))
            .unwrap();
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn snapshot_global_is_a_js_assignment_of_json() {
        let snapshot = Snapshot {
            path: Some(PathBuf::from("/tmp/x/local-storage.json")),
            entries: entries(&[("k", "line\u{2028}break \"quoted\"")]),
        };
        let value = global_value(&snapshot);
        assert_eq!(value["path"], "/tmp/x/local-storage.json");
        assert_eq!(value["data"]["k"], "line\u{2028}break \"quoted\"");
        let memory = global_value(&Snapshot {
            path: None,
            entries: Entries::new(),
        });
        assert!(memory["path"].is_null());
        assert_eq!(memory["data"], serde_json::json!({}));
    }
}
