use std::path::PathBuf;

const BACKEND_ENV: &str = "RNGPUI_LINUX_BACKEND";

pub fn select_backend() {
    let requested = std::env::var(BACKEND_ENV)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let wayland = non_empty_env("WAYLAND_DISPLAY");
    let x11 = non_empty_env("DISPLAY");

    match requested.as_str() {
        "x11" | "xorg" => {
            if x11.is_none() {
                fail("RNGPUI_LINUX_BACKEND=x11, but DISPLAY is not set");
            }
            hide_wayland();
        }
        "wayland" => {
            let Some(display) = wayland else {
                fail("RNGPUI_LINUX_BACKEND=wayland, but WAYLAND_DISPLAY is not set");
            };
            if let Err(error) = probe_wayland(&display) {
                fail(&format!(
                    "cannot connect to Wayland display {display}: {error}"
                ));
            }
        }
        "" | "auto" => match (wayland, x11) {
            (Some(display), x11) => {
                if let Err(error) = probe_wayland(&display) {
                    if x11.is_some() {
                        eprintln!(
                            "[rngpui] Wayland display {display} is unreachable ({error}); using X11"
                        );
                        hide_wayland();
                    } else {
                        fail(&format!(
                            "cannot connect to Wayland display {display}: {error}"
                        ));
                    }
                }
            }
            (None, Some(_)) => {}
            (None, None) => fail(
                "no display server found: neither WAYLAND_DISPLAY nor DISPLAY is set. \
                 Run inside a graphical session",
            ),
        },
        other => fail(&format!(
            "unknown {BACKEND_ENV}={other:?}; use \"wayland\", \"x11\" or \"auto\""
        )),
    }
}

pub fn expects_client_decorations(requested: Option<gpui::WindowDecorations>) -> bool {
    let client_requested = requested == Some(gpui::WindowDecorations::Client);
    match backend_name() {
        "wayland" => client_requested || !wayland_offers_server_decorations(),
        _ => client_requested,
    }
}

fn wayland_offers_server_decorations() -> bool {
    use wayland_client::protocol::wl_registry;

    struct Globals {
        server_decorations: bool,
    }

    impl wayland_client::Dispatch<wl_registry::WlRegistry, ()> for Globals {
        fn event(
            state: &mut Self,
            _: &wl_registry::WlRegistry,
            event: wl_registry::Event,
            _: &(),
            _: &wayland_client::Connection,
            _: &wayland_client::QueueHandle<Self>,
        ) {
            if let wl_registry::Event::Global { interface, .. } = event
                && interface == "zxdg_decoration_manager_v1"
            {
                state.server_decorations = true;
            }
        }
    }

    let Ok(connection) = wayland_client::Connection::connect_to_env() else {
        return false;
    };
    let mut queue = connection.new_event_queue();
    let _registry = connection.display().get_registry(&queue.handle(), ());
    let mut globals = Globals {
        server_decorations: false,
    };
    queue.roundtrip(&mut globals).is_ok() && globals.server_decorations
}

pub fn backend_name() -> &'static str {
    match gpui::guess_compositor() {
        "Wayland" => "wayland",
        "X11" => "x11",
        _ => "headless",
    }
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn hide_wayland() {
    unsafe { std::env::remove_var("WAYLAND_DISPLAY") };
}

fn probe_wayland(display: &str) -> std::io::Result<()> {
    let socket = if display.starts_with('/') {
        PathBuf::from(display)
    } else {
        let runtime_dir = non_empty_env("XDG_RUNTIME_DIR").ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "XDG_RUNTIME_DIR is not set")
        })?;
        PathBuf::from(runtime_dir).join(display)
    };
    std::os::unix::net::UnixStream::connect(socket).map(drop)
}

fn fail(message: &str) -> ! {
    eprintln!("[rngpui] {message}");
    std::process::exit(1);
}
