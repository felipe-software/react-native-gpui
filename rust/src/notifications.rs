use std::io::Write;
use std::time::Duration;

use serde_json::Value;

use crate::platform_services::{env_nonempty, run_with_timeout, test_mode};

const SHOW_TIMEOUT: Duration = Duration::from_secs(8);
const DEFAULT_APP_NAME: &str = "react-native-gpui";

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct Notification {
    pub title: String,
    #[serde(default)]
    pub body: String,
}

pub fn show(args: Value) -> Result<bool, String> {
    let notification: Notification =
        serde_json::from_value(args).map_err(|error| format!("invalid notification: {error}"))?;
    if notification.title.trim().is_empty() {
        return Err("a notification needs a non-empty title".to_string());
    }
    if let Some(path) = env_nonempty("RNGPUI_FAKE_NOTIFICATIONS") {
        record(&path, &notification)?;
        return Ok(true);
    }
    if test_mode() {
        eprintln!(
            "[notifications] RNGPUI_TEST_MODE: not posting {:?}",
            notification.title
        );
        return Ok(false);
    }
    let shown = run_with_timeout(SHOW_TIMEOUT, move || platform::show(&notification));
    Ok(shown.unwrap_or_else(|| {
        eprintln!("[notifications] the notification service did not answer in time");
        false
    }))
}

pub fn app_name() -> String {
    ["RNGPUI_APP_NAME", "RNGPUI_WINDOW_TITLE", "RNGPUI_APP_ID"]
        .iter()
        .find_map(|name| env_nonempty(name))
        .unwrap_or_else(|| DEFAULT_APP_NAME.to_string())
}

fn record(path: &str, notification: &Notification) -> Result<(), String> {
    let line = serde_json::json!({
        "title": notification.title,
        "body": notification.body,
        "appName": app_name(),
    });
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("cannot open {path}: {error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("cannot write {path}: {error}"))
}

pub fn escape_markup(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            other => escaped.push(other),
        }
    }
    escaped
}

#[cfg(target_os = "linux")]
pub mod platform {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use zbus::zvariant::Value as DbusValue;

    use super::{Notification, app_name, escape_markup};
    use crate::platform_services::env_nonempty;

    const DESTINATION: &str = "org.freedesktop.Notifications";
    const PATH: &str = "/org/freedesktop/Notifications";
    const INTERFACE: &str = "org.freedesktop.Notifications";
    const URGENCY_NORMAL: u8 = 1;

    static SESSION: Mutex<Option<zbus::Connection>> = Mutex::new(None);

    fn cached_session() -> Option<zbus::Connection> {
        SESSION
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn remember_session(connection: Option<zbus::Connection>) {
        *SESSION
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = connection;
    }

    async fn session() -> zbus::Result<zbus::Connection> {
        if let Some(connection) = cached_session() {
            return Ok(connection);
        }
        let connection = zbus::Connection::session().await?;
        remember_session(Some(connection.clone()));
        Ok(connection)
    }

    pub fn show(notification: &Notification) -> bool {
        let desktop_entry = env_nonempty("RNGPUI_APP_ID");
        let sent = futures::executor::block_on(async {
            let connection = session().await?;
            let sent = notify(
                &connection,
                &app_name(),
                desktop_entry.as_deref(),
                notification,
            )
            .await;
            if sent.is_err() {
                remember_session(None);
            }
            sent
        });
        match sent {
            Ok(_) => true,
            Err(error) => {
                eprintln!("[notifications] org.freedesktop.Notifications failed: {error}");
                false
            }
        }
    }

    async fn supports_body_markup(connection: &zbus::Connection) -> bool {
        let reply = connection
            .call_method(
                Some(DESTINATION),
                PATH,
                Some(INTERFACE),
                "GetCapabilities",
                &(),
            )
            .await;
        let capabilities = reply.and_then(|message| message.body().deserialize::<Vec<String>>());
        capabilities
            .map(|list| list.iter().any(|capability| capability == "body-markup"))
            .unwrap_or(false)
    }

    pub async fn notify(
        connection: &zbus::Connection,
        app_name: &str,
        desktop_entry: Option<&str>,
        notification: &Notification,
    ) -> zbus::Result<u32> {
        let body = if supports_body_markup(connection).await {
            escape_markup(&notification.body)
        } else {
            notification.body.clone()
        };
        let mut hints: HashMap<&str, DbusValue<'_>> = HashMap::new();
        hints.insert("urgency", DbusValue::U8(URGENCY_NORMAL));
        if let Some(entry) = desktop_entry {
            hints.insert("desktop-entry", DbusValue::from(entry));
        }
        let actions: Vec<&str> = Vec::new();
        let replaces_id = 0u32;
        let server_default_timeout = -1i32;
        let reply = connection
            .call_method(
                Some(DESTINATION),
                PATH,
                Some(INTERFACE),
                "Notify",
                &(
                    app_name,
                    replaces_id,
                    "",
                    notification.title.as_str(),
                    body.as_str(),
                    actions,
                    hints,
                    server_default_timeout,
                ),
            )
            .await?;
        reply.body().deserialize::<u32>()
    }
}

#[cfg(target_os = "macos")]
pub mod platform {
    use std::process::{Command, Stdio};

    use super::Notification;

    const SCRIPT: [&str; 4] = [
        "on run argv",
        "set argumentCount to count of argv",
        "display notification (item argumentCount of argv) with title (item (argumentCount - 1) of argv)",
        "end run",
    ];

    pub fn show(notification: &Notification) -> bool {
        let mut command = Command::new("/usr/bin/osascript");
        for line in SCRIPT {
            command.arg("-e").arg(line);
        }
        let status = command
            .arg("--")
            .arg(&notification.title)
            .arg(&notification.body)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        match status {
            Ok(status) => status.success(),
            Err(error) => {
                eprintln!("[notifications] osascript failed to start: {error}");
                false
            }
        }
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub mod platform {
    use super::Notification;

    pub fn show(_notification: &Notification) -> bool {
        eprintln!("[notifications] desktop notifications are not supported on this platform");
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markup_escaping_keeps_chat_text_literal() {
        assert_eq!(
            escape_markup("<b>hi</b> & \"bye\""),
            "&lt;b&gt;hi&lt;/b&gt; &amp; \"bye\""
        );
        assert_eq!(escape_markup("PogChamp 🎉"), "PogChamp 🎉");
    }

    #[test]
    fn notifications_require_a_title() {
        assert!(show(serde_json::json!({ "title": "  ", "body": "x" })).is_err());
        assert!(show(serde_json::json!({ "body": "x" })).is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn notify_round_trips_through_a_private_session_bus() {
        use futures::StreamExt;
        use std::collections::HashMap;
        use std::io::{BufRead, BufReader};
        use std::process::{Command, Stdio};
        use zbus::zvariant::OwnedValue;

        let spawned = Command::new("dbus-daemon")
            .args(["--session", "--nofork", "--nopidfile", "--print-address=1"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();
        let Ok(mut daemon) = spawned else {
            eprintln!("skipping: dbus-daemon is not installed");
            return;
        };
        let mut address = String::new();
        BufReader::new(daemon.stdout.take().unwrap())
            .read_line(&mut address)
            .unwrap();
        let address = address.trim().to_string();

        type NotifyArgs = (
            String,
            u32,
            String,
            String,
            String,
            Vec<String>,
            HashMap<String, OwnedValue>,
            i32,
        );
        let (received_tx, received_rx) = flume::bounded::<NotifyArgs>(1);
        let (ready_tx, ready_rx) = flume::bounded::<()>(1);
        let server_address = address.clone();
        let server = std::thread::spawn(move || {
            futures::executor::block_on(async move {
                let connection = zbus::connection::Builder::address(server_address.as_str())
                    .unwrap()
                    .name("org.freedesktop.Notifications")
                    .unwrap()
                    .build()
                    .await
                    .unwrap();
                let mut stream = zbus::MessageStream::from(&connection);
                ready_tx.send(()).unwrap();
                while let Some(Ok(message)) = stream.next().await {
                    let header = message.header();
                    if header.message_type() != zbus::message::Type::MethodCall {
                        continue;
                    }
                    let member = header.member().map(|name| name.to_string());
                    match member.as_deref() {
                        Some("GetCapabilities") => {
                            connection
                                .reply(&header, &(vec!["body", "body-markup"],))
                                .await
                                .unwrap();
                        }
                        Some("Notify") => {
                            let args: NotifyArgs = message.body().deserialize().unwrap();
                            connection.reply(&header, &(42u32,)).await.unwrap();
                            received_tx.send(args).unwrap();
                            break;
                        }
                        _ => {}
                    }
                }
            });
        });
        ready_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("fake notification server started");

        let notification = Notification {
            title: "Mention from forsen".to_string(),
            body: "a < b & c".to_string(),
        };
        let id = futures::executor::block_on(async {
            let client = zbus::connection::Builder::address(address.as_str())
                .unwrap()
                .build()
                .await
                .unwrap();
            platform::notify(
                &client,
                "Chat Test",
                Some("com.example.chat"),
                &notification,
            )
            .await
        })
        .unwrap();
        assert_eq!(id, 42);

        let (app, replaces, icon, title, body, actions, hints, timeout) =
            received_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        server.join().unwrap();
        let _ = daemon.kill();
        let _ = daemon.wait();

        assert_eq!(app, "Chat Test");
        assert_eq!(replaces, 0);
        assert_eq!(icon, "");
        assert_eq!(title, "Mention from forsen");
        assert_eq!(body, "a &lt; b &amp; c");
        assert!(actions.is_empty());
        assert_eq!(timeout, -1);
        let entry: String = hints["desktop-entry"].clone().try_into().unwrap();
        assert_eq!(entry, "com.example.chat");
        let urgency: u8 = hints["urgency"].clone().try_into().unwrap();
        assert_eq!(urgency, 1);
    }
}
