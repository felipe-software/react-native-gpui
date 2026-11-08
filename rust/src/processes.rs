use serde_json::Value;

const LINUX_COMM_BYTES: usize = 15;

#[derive(serde::Deserialize)]
struct FindRequest {
    names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessName {
    comm: String,
    executable: String,
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

impl ProcessName {
    pub fn new(comm: &str, argv0: &str) -> Self {
        Self {
            comm: comm.trim().to_lowercase(),
            executable: basename(argv0.trim()).to_lowercase(),
        }
    }

    fn matches(&self, wanted: &str) -> bool {
        let truncated_comm = self.comm.len() == LINUX_COMM_BYTES
            && wanted.len() > LINUX_COMM_BYTES
            && wanted.starts_with(self.comm.as_str());
        self.comm == wanted || self.executable == wanted || truncated_comm
    }
}

pub fn find_running(args: Value) -> Result<Vec<String>, String> {
    let request: FindRequest = serde_json::from_value(args)
        .map_err(|error| format!("findRunning expects a list of process names: {error}"))?;
    let wanted = unique_names(request.names);
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let running = running_processes()?;
    Ok(matching(&wanted, &running))
}

fn unique_names(names: Vec<String>) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for name in names {
        let blank = name.trim().is_empty();
        if !blank && !unique.contains(&name) {
            unique.push(name);
        }
    }
    unique
}

pub fn matching(wanted: &[String], running: &[ProcessName]) -> Vec<String> {
    wanted
        .iter()
        .filter(|name| {
            let lowered = name.trim().to_lowercase();
            running.iter().any(|process| process.matches(&lowered))
        })
        .cloned()
        .collect()
}

#[cfg(target_os = "linux")]
fn running_processes() -> Result<Vec<ProcessName>, String> {
    let entries =
        std::fs::read_dir("/proc").map_err(|error| format!("cannot list /proc: {error}"))?;
    let mut processes = Vec::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let is_pid = file_name
            .to_str()
            .is_some_and(|name| !name.is_empty() && name.bytes().all(|byte| byte.is_ascii_digit()));
        if !is_pid {
            continue;
        }
        let dir = entry.path();
        let comm = std::fs::read(dir.join("comm"))
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
            .unwrap_or_default();
        let cmdline = std::fs::read(dir.join("cmdline")).unwrap_or_default();
        let argv0 = cmdline
            .split(|byte| *byte == 0)
            .next()
            .map(|arg| String::from_utf8_lossy(arg).into_owned())
            .unwrap_or_default();
        let unnamed = comm.trim().is_empty() && argv0.is_empty();
        if !unnamed {
            processes.push(ProcessName::new(&comm, &argv0));
        }
    }
    Ok(processes)
}

#[cfg(target_os = "macos")]
fn running_processes() -> Result<Vec<ProcessName>, String> {
    let output = std::process::Command::new("/bin/ps")
        .args(["-A", "-o", "comm="])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .map_err(|error| format!("cannot run ps: {error}"))?;
    if !output.status.success() {
        return Err(format!("ps exited with {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| ProcessName::new(basename(line), line))
        .collect())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn running_processes() -> Result<Vec<ProcessName>, String> {
    Err("process lookup is not supported on this platform".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn matches_comm_executable_and_case_insensitively() {
        let running = vec![
            ProcessName::new("obs\n", "/usr/bin/obs"),
            ProcessName::new("streamlabs-obs-", "/opt/Streamlabs/streamlabs-obs-desktop"),
            ProcessName::new("python3", "/usr/bin/python3"),
        ];
        let wanted = names(&[
            "OBS",
            "streamlabs-obs-desktop",
            "xsplit",
            "python3",
            "Python3",
        ]);
        assert_eq!(
            matching(&wanted, &running),
            names(&["OBS", "streamlabs-obs-desktop", "python3", "Python3"])
        );
    }

    #[test]
    fn a_truncated_comm_only_matches_longer_names_it_prefixes() {
        let running = vec![ProcessName::new("very-long-proce", "")];
        assert_eq!(
            matching(
                &names(&[
                    "very-long-process-name",
                    "very-long-proc",
                    "other-long-process"
                ]),
                &running
            ),
            names(&["very-long-process-name"])
        );
    }

    #[test]
    fn requests_are_deduplicated_and_blank_names_ignored() {
        assert_eq!(
            unique_names(names(&["obs", "", "  ", "obs", "vlc"])),
            names(&["obs", "vlc"])
        );
        assert!(
            find_running(serde_json::json!({ "names": [] }))
                .unwrap()
                .is_empty()
        );
        assert!(find_running(serde_json::json!({ "names": "obs" })).is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn finds_a_live_process_by_its_long_executable_name() {
        let dir = std::env::temp_dir().join(format!("rngpui-process-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let executable = dir.join("rngpui-process-probe-long-name");
        std::fs::copy("/bin/sleep", &executable).unwrap();
        let text_file_busy = 26;
        let mut attempts = 0;
        let mut child = loop {
            match std::process::Command::new(&executable).arg("30").spawn() {
                Ok(child) => break child,
                Err(error) if error.raw_os_error() == Some(text_file_busy) && attempts < 50 => {
                    attempts += 1;
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(error) => panic!("cannot start the probe process: {error}"),
            }
        };
        let mut found = Vec::new();
        for _ in 0..50 {
            found = find_running(serde_json::json!({
                "names": ["RNGPUI-PROCESS-PROBE-LONG-NAME", "rngpui-no-such-process-xyz"]
            }))
            .unwrap();
            if !found.is_empty() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let _ = child.kill();
        let _ = child.wait();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(found, names(&["RNGPUI-PROCESS-PROBE-LONG-NAME"]));
    }
}
