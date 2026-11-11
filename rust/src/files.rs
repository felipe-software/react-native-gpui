use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::storage::{
    DATA_DIR_CONVENTION, DataDirConvention, EnvLookup, lookup, platform_data_dir,
};

const MAX_TEXT_BYTES: u64 = 32 * 1024 * 1024;

fn home(env: EnvLookup) -> Option<PathBuf> {
    lookup(env, "HOME").map(PathBuf::from)
}

pub(crate) fn expand_path(env: EnvLookup, raw: &str) -> Result<PathBuf, String> {
    let expanded = match raw.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => {
            let home = home(env).ok_or("HOME is not set")?;
            home.join(rest.trim_start_matches('/'))
        }
        _ => PathBuf::from(raw),
    };
    if !expanded.is_absolute() {
        return Err(format!("Files needs an absolute path, got {raw:?}"));
    }
    Ok(expanded)
}

fn read_path(path: &Path) -> Result<Value, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(error) => return Err(format!("cannot read {}: {error}", path.display())),
    };
    if !metadata.is_file() {
        return Ok(Value::Null);
    }
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "{} is larger than {MAX_TEXT_BYTES} bytes",
            path.display()
        ));
    }
    let bytes =
        std::fs::read(path).map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    String::from_utf8(bytes)
        .map(Value::String)
        .map_err(|_| format!("{} is not UTF-8 text", path.display()))
}

pub fn read_text(args: Value) -> Result<Value, String> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or("files.readText needs a path")?;
    let path = expand_path(&|name| std::env::var(name).ok(), raw)?;
    read_path(&path)
}

fn config_dir(env: EnvLookup, convention: DataDirConvention) -> Option<PathBuf> {
    match convention {
        DataDirConvention::MacOs => platform_data_dir(env, convention),
        DataDirConvention::Xdg => lookup(env, "XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| home(env).map(|home| home.join(".config"))),
    }
}

fn dirs_with(env: EnvLookup, convention: DataDirConvention) -> Value {
    let text = |path: Option<PathBuf>| path.map(|path| path.to_string_lossy().into_owned());
    json!({
        "home": text(home(env)),
        "data": text(platform_data_dir(env, convention)),
        "config": text(config_dir(env, convention)),
    })
}

pub fn dirs() -> Value {
    dirs_with(&|name| std::env::var(name).ok(), DATA_DIR_CONVENTION)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_of(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        }
    }

    #[test]
    fn tilde_expands_to_home_and_relative_paths_are_refused() {
        let env = env_of(&[("HOME", "/home/me")]);
        assert_eq!(
            expand_path(&env, "~/a/b.json").unwrap(),
            PathBuf::from("/home/me/a/b.json")
        );
        assert_eq!(expand_path(&env, "~").unwrap(), PathBuf::from("/home/me"));
        assert_eq!(
            expand_path(&env, "/etc/x").unwrap(),
            PathBuf::from("/etc/x")
        );
        assert!(expand_path(&env, "relative/x").is_err());
        assert!(expand_path(&env, "~other/x").is_err());
        assert!(expand_path(&env_of(&[]), "~/x").is_err());
    }

    #[test]
    fn dirs_follow_xdg_and_macos_conventions() {
        let xdg = env_of(&[("HOME", "/home/me"), ("XDG_CONFIG_HOME", "/cfg")]);
        let value = dirs_with(&xdg, DataDirConvention::Xdg);
        assert_eq!(value["home"], "/home/me");
        assert_eq!(value["data"], "/home/me/.local/share");
        assert_eq!(value["config"], "/cfg");
        let mac = env_of(&[("HOME", "/Users/me")]);
        let value = dirs_with(&mac, DataDirConvention::MacOs);
        assert_eq!(value["data"], "/Users/me/Library/Application Support");
        assert_eq!(value["config"], "/Users/me/Library/Application Support");
    }

    #[test]
    fn missing_files_read_as_null_and_text_round_trips() {
        let dir = std::env::temp_dir().join(format!("rngpui-files-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"a\":1}").unwrap();
        assert_eq!(read_path(&file).unwrap(), Value::String("{\"a\":1}".into()));
        assert_eq!(read_path(&dir.join("missing.json")).unwrap(), Value::Null);
        assert_eq!(read_path(&dir).unwrap(), Value::Null);
        std::fs::write(&file, [0xff, 0xfe]).unwrap();
        assert!(read_path(&file).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
