use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

use gpui::{
    AnyWindowHandle, App, AppContext as _, Bounds, Entity, Pixels, Point, Size, TitlebarOptions,
    Window, WindowBounds, WindowHandle, WindowKind, WindowOptions, point, px, size,
};
use serde_json::{Value, json};

use crate::elements::ReactElement;
use crate::{ServiceApp, TreeMetadata};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WindowRole {
    Main,
    Normal,
    Dialog,
    Popup,
}

impl WindowRole {
    fn parse(value: Option<&str>) -> Self {
        match value {
            Some("dialog") => Self::Dialog,
            Some("popup") => Self::Popup,
            _ => Self::Normal,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Normal => "normal",
            Self::Dialog => "dialog",
            Self::Popup => "popup",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum WindowPlacement {
    Center,
    Cursor { dx: f32, dy: f32 },
    Screen { x: f32, y: f32 },
    Parent { x: f32, y: f32 },
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct WindowSpec {
    pub id: u64,
    pub title: String,
    pub width: f32,
    pub height: f32,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
    pub placement: WindowPlacement,
    pub role: WindowRole,
    pub resizable: bool,
    pub always_on_top: bool,
    pub close_on_blur: bool,
    pub close_on_escape: bool,
    pub test_id: Option<String>,
}

fn number(value: &Value, key: &str) -> Option<f32> {
    value
        .get(key)
        .and_then(Value::as_f64)
        .filter(|number| number.is_finite())
        .map(|number| number as f32)
}

fn parse_placement(value: Option<&Value>) -> WindowPlacement {
    let Some(value) = value else {
        return WindowPlacement::Center;
    };
    if let Some(name) = value.as_str() {
        return match name {
            "cursor" => WindowPlacement::Cursor { dx: 0.0, dy: 0.0 },
            _ => WindowPlacement::Center,
        };
    }
    let anchor = value.get("relativeTo").and_then(Value::as_str);
    let x = number(value, "x").unwrap_or(0.0);
    let y = number(value, "y").unwrap_or(0.0);
    match anchor {
        Some("screen") => WindowPlacement::Screen { x, y },
        Some("cursor") => WindowPlacement::Cursor { dx: x, dy: y },
        _ => WindowPlacement::Parent { x, y },
    }
}

pub(crate) fn parse_spec(value: &Value) -> Option<WindowSpec> {
    let id = value.get("windowId").and_then(Value::as_u64)?;
    if id == 0 {
        return None;
    }
    let role = WindowRole::parse(value.get("kind").and_then(Value::as_str));
    let flag =
        |key: &str, default: bool| value.get(key).and_then(Value::as_bool).unwrap_or(default);
    Some(WindowSpec {
        id,
        title: value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        width: number(value, "width").unwrap_or(400.0).max(1.0),
        height: number(value, "height").unwrap_or(300.0).max(1.0),
        min_width: number(value, "minWidth"),
        min_height: number(value, "minHeight"),
        placement: parse_placement(value.get("position")),
        role,
        resizable: flag("resizable", role != WindowRole::Popup),
        always_on_top: flag("alwaysOnTop", false),
        close_on_blur: flag("closeOnBlur", role == WindowRole::Popup),
        close_on_escape: flag("closeOnEscape", role != WindowRole::Normal),
        test_id: value
            .get("testID")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(String::from),
    })
}

#[derive(Clone, Copy, Default)]
pub(crate) struct LaunchConfig {
    pub test_mode: bool,
    pub background: bool,
    pub show_window: bool,
    pub offscreen_test_window: bool,
    pub capture_onscreen: bool,
}

pub(crate) struct SecondaryWindow {
    pub spec: WindowSpec,
    pub handle: WindowHandle<gpui_component::Root>,
    pub app: Entity<ServiceApp>,
    #[cfg(target_os = "linux")]
    frame: Option<Entity<crate::linux_frame::LinuxWindowFrame>>,
    gpui_id: u64,
    view: usize,
}

thread_local! {
    static CONFIG: Cell<LaunchConfig> = Cell::new(LaunchConfig::default());
    static MAIN: RefCell<Option<(WindowHandle<gpui_component::Root>, Entity<ServiceApp>)>> =
        const { RefCell::new(None) };
    static WINDOWS: RefCell<HashMap<u64, SecondaryWindow>> = RefCell::new(HashMap::new());
    static PENDING_TREES: RefCell<HashMap<u64, Arc<ReactElement>>> = RefCell::new(HashMap::new());
    static APPS_BY_GPUI_WINDOW: RefCell<HashMap<u64, (u64, gpui::WeakEntity<ServiceApp>)>> =
        RefCell::new(HashMap::new());
    static ACTIVE: RefCell<HashSet<u64>> = RefCell::new(HashSet::new());
    static APP_ACTIVE: Cell<Option<bool>> = const { Cell::new(None) };
    static APP_STATE_CHECK: Cell<u64> = const { Cell::new(0) };
    static LAST_POINTER: Cell<Option<(u64, Point<Pixels>)>> = const { Cell::new(None) };
}

pub(crate) fn set_launch_config(config: LaunchConfig) {
    CONFIG.set(config);
}

fn gpui_key(handle: impl Into<AnyWindowHandle>) -> u64 {
    handle.into().window_id().as_u64()
}

pub(crate) fn window_key(window: &Window) -> u64 {
    window.window_handle().window_id().as_u64()
}

pub(crate) fn register_main(handle: WindowHandle<gpui_component::Root>, app: &Entity<ServiceApp>) {
    APPS_BY_GPUI_WINDOW.with_borrow_mut(|apps| {
        apps.insert(gpui_key(handle), (0, app.downgrade()));
    });
    MAIN.with_borrow_mut(|main| *main = Some((handle, app.clone())));
}

pub(crate) fn main_window() -> Option<(WindowHandle<gpui_component::Root>, Entity<ServiceApp>)> {
    MAIN.with_borrow(Clone::clone)
}

pub(crate) fn has_secondary() -> bool {
    WINDOWS.with_borrow(|windows| !windows.is_empty())
}

pub(crate) fn get(id: u64) -> Option<(WindowHandle<gpui_component::Root>, Entity<ServiceApp>)> {
    if id == 0 {
        return main_window();
    }
    WINDOWS.with_borrow(|windows| {
        windows
            .get(&id)
            .map(|window| (window.handle, window.app.clone()))
    })
}

fn secondary_apps() -> Vec<(u64, WindowHandle<gpui_component::Root>, Entity<ServiceApp>)> {
    WINDOWS.with_borrow(|windows| {
        windows
            .values()
            .map(|window| (window.spec.id, window.handle, window.app.clone()))
            .collect()
    })
}

pub(crate) fn app_for(window: &Window) -> Option<(u64, Entity<ServiceApp>)> {
    APPS_BY_GPUI_WINDOW.with_borrow(|apps| {
        apps.get(&window_key(window))
            .and_then(|(id, app)| app.upgrade().map(|app| (*id, app)))
    })
}

pub(crate) fn note_pointer(window: &Window, position: Point<Pixels>) {
    LAST_POINTER.set(Some((window_key(window), position)));
}

pub(crate) fn last_pointer_window() -> Option<u64> {
    let (gpui_id, _) = LAST_POINTER.get()?;
    APPS_BY_GPUI_WINDOW
        .with_borrow(|apps| apps.get(&gpui_id).map(|(id, _)| *id))
        .filter(|id| *id != 0)
}

pub(crate) fn owner_of_node(node: u64, cx: &App) -> Option<u64> {
    if !has_secondary() {
        return None;
    }
    secondary_apps()
        .into_iter()
        .find(|(_, _, app)| app.read(cx).tree_metadata.node_ids.contains(&node))
        .map(|(id, _, _)| id)
}

pub(crate) fn owners_of(ids: &[u64], cx: &App) -> (bool, Vec<u64>) {
    if !has_secondary() {
        return (true, Vec::new());
    }
    let windows = secondary_apps();
    let mut main_owns = false;
    let mut owners: Vec<u64> = Vec::new();
    for id in ids {
        let owner = windows
            .iter()
            .find(|(_, _, app)| app.read(cx).tree_metadata.node_ids.contains(id))
            .map(|(window, _, _)| *window);
        match owner {
            Some(window) => {
                if !owners.contains(&window) {
                    owners.push(window);
                }
            }
            None => main_owns = true,
        }
    }
    (main_owns, owners)
}

pub(crate) fn window_with_focused_input(cx: &App) -> Option<u64> {
    secondary_apps()
        .into_iter()
        .find(|(_, _, app)| app.read(cx).focused_input.is_some())
        .map(|(id, _, _)| id)
}

pub(crate) fn refresh_tween_owners(cx: &mut App) -> HashSet<u64> {
    let ids = crate::anim_overlay_tween::active_ids();
    let mut owned = HashSet::new();
    if ids.is_empty() {
        return owned;
    }
    let mut to_refresh = Vec::new();
    for (window_id, _, app) in secondary_apps() {
        let nodes = &app.read(cx).tree_metadata.node_ids;
        let mine: Vec<u64> = ids
            .iter()
            .copied()
            .filter(|id| nodes.contains(id))
            .collect();
        if !mine.is_empty() {
            owned.extend(mine);
            to_refresh.push(window_id);
        }
    }
    for window_id in to_refresh {
        refresh(window_id, cx);
    }
    owned
}

pub(crate) fn owners_of_layout_key(key: &str, cx: &App) -> Vec<u64> {
    secondary_apps()
        .into_iter()
        .filter(|(_, _, app)| app.read(cx).tree_metadata.native_layout_keys.contains(key))
        .map(|(id, _, _)| id)
        .collect()
}

pub(crate) fn refresh(id: u64, cx: &mut App) {
    let Some((handle, _)) = get(id) else {
        return;
    };
    let _ = handle.update(cx, |_root, window, root_cx| {
        root_cx.notify();
        window.refresh();
    });
}

pub(crate) fn refresh_all_secondary(cx: &mut App) {
    for (_, handle, _) in secondary_apps() {
        let _ = handle.update(cx, |_root, window, root_cx| {
            root_cx.notify();
            window.refresh();
        });
    }
}

pub(crate) fn retain_all_with(window: u64, metadata: &TreeMetadata, cx: &App) {
    if !has_secondary() {
        metadata.retain_native_state();
        return;
    }
    let mut others: Vec<Entity<ServiceApp>> = secondary_apps()
        .into_iter()
        .filter(|(id, _, _)| *id != window)
        .map(|(_, _, app)| app)
        .collect();
    if window != 0
        && let Some((_, main)) = main_window()
    {
        others.push(main);
    }
    let mut metadatas: Vec<&TreeMetadata> = vec![metadata];
    for app in &others {
        metadatas.push(&app.read(cx).tree_metadata);
    }
    crate::retain_native_state_union(&metadatas);
}

fn retain_without(window: u64, cx: &App) {
    let mut apps: Vec<Entity<ServiceApp>> = secondary_apps()
        .into_iter()
        .filter(|(id, _, _)| *id != window)
        .map(|(_, _, app)| app)
        .collect();
    if let Some((_, main)) = main_window() {
        apps.push(main);
    }
    let metadatas: Vec<&TreeMetadata> =
        apps.iter().map(|app| &app.read(cx).tree_metadata).collect();
    crate::retain_native_state_union(&metadatas);
}

fn main_content_bounds(cx: &mut App) -> Option<Bounds<Pixels>> {
    let (handle, app) = main_window()?;
    let chrome = app.read(cx).chrome;
    handle
        .update(cx, |_root, window, _cx| {
            let bounds = window.bounds();
            content_bounds_on_screen(window, bounds, chrome)
        })
        .ok()
}

#[cfg(target_os = "linux")]
fn content_bounds_on_screen(
    window: &Window,
    bounds: Bounds<Pixels>,
    chrome: bool,
) -> Bounds<Pixels> {
    let offset = crate::linux_frame::content_offset(window, chrome);
    Bounds {
        origin: bounds.origin + offset,
        size: crate::linux_frame::content_size(window, chrome),
    }
}

#[cfg(not(target_os = "linux"))]
fn content_bounds_on_screen(
    window: &Window,
    bounds: Bounds<Pixels>,
    _chrome: bool,
) -> Bounds<Pixels> {
    Bounds {
        origin: bounds.origin,
        size: window.viewport_size(),
    }
}

fn cursor_on_screen(cx: &mut App) -> Option<Point<Pixels>> {
    let (gpui_id, position) = LAST_POINTER.get()?;
    let handle = cx
        .windows()
        .into_iter()
        .find(|handle| handle.window_id().as_u64() == gpui_id)?;
    handle
        .update(cx, |_root, window, _cx| window.bounds().origin + position)
        .ok()
}

fn display_bounds_at(point: Point<Pixels>, cx: &App) -> Option<Bounds<Pixels>> {
    cx.displays()
        .into_iter()
        .map(|display| display.bounds())
        .find(|bounds| bounds.contains(&point))
        .or_else(|| cx.primary_display().map(|display| display.bounds()))
}

fn clamp_to_display(
    origin: Point<Pixels>,
    window_size: Size<Pixels>,
    cursor: Option<Point<Pixels>>,
    cx: &App,
) -> Point<Pixels> {
    let Some(display) = display_bounds_at(origin, cx) else {
        return origin;
    };
    let max_x = display.origin.x + (display.size.width - window_size.width).max(px(0.0));
    let max_y = display.origin.y + (display.size.height - window_size.height).max(px(0.0));
    let past_right = origin.x > max_x;
    let past_bottom = origin.y > max_y;
    let mut y = origin.y.clamp(display.origin.y, max_y);
    if past_right
        && past_bottom
        && let Some(cursor) = cursor
    {
        y = (cursor.y - window_size.height - px(16.0)).max(display.origin.y);
    }
    point(origin.x.clamp(display.origin.x, max_x), y)
}

fn placement_origin(
    spec: &WindowSpec,
    window_size: Size<Pixels>,
    frame_offset: Point<Pixels>,
    cx: &mut App,
) -> Point<Pixels> {
    if CONFIG.get().offscreen_test_window {
        return point(px(-10000.0), px(-10000.0));
    }
    let parent = main_content_bounds(cx);
    let mut cursor = None;
    let content_origin = match &spec.placement {
        WindowPlacement::Screen { x, y } => point(px(*x), px(*y)),
        WindowPlacement::Parent { x, y } => parent
            .map(|parent| parent.origin + point(px(*x), px(*y)))
            .unwrap_or_else(|| point(px(*x), px(*y))),
        WindowPlacement::Cursor { dx, dy } => {
            let at = cursor_on_screen(cx)
                .or_else(|| parent.map(|parent| parent.center()))
                .unwrap_or_else(|| point(px(120.0), px(120.0)));
            cursor = Some(at);
            at + point(px(*dx), px(*dy))
        }
        WindowPlacement::Center => match parent {
            Some(parent) => point(
                parent.center().x - px(spec.width / 2.0),
                parent.center().y - px(spec.height / 2.0),
            ),
            None => cx
                .primary_display()
                .map(|display| {
                    let bounds = display.bounds();
                    point(
                        bounds.center().x - px(spec.width / 2.0),
                        bounds.center().y - px(spec.height / 2.0),
                    )
                })
                .unwrap_or_else(|| point(px(160.0), px(160.0))),
        },
    };
    clamp_to_display(content_origin - frame_offset, window_size, cursor, cx)
}

#[cfg(target_os = "linux")]
fn decorations_for(role: WindowRole) -> Option<gpui::WindowDecorations> {
    if role == WindowRole::Popup {
        Some(gpui::WindowDecorations::Client)
    } else {
        crate::linux_frame::requested_decorations()
    }
}

#[cfg(target_os = "linux")]
fn draws_chrome(role: WindowRole) -> bool {
    role != WindowRole::Popup
        && std::env::var_os("RNGPUI_BORDERLESS").is_none()
        && crate::linux_display::expects_client_decorations(decorations_for(role))
}

#[cfg(not(target_os = "linux"))]
fn draws_chrome(_role: WindowRole) -> bool {
    false
}

#[cfg(target_os = "linux")]
fn frame_geometry(chrome: bool) -> (Size<Pixels>, Point<Pixels>) {
    let frame = crate::linux_frame::frame_size(chrome);
    let offset = if chrome {
        point(
            crate::linux_frame::SHADOW_INSET,
            crate::linux_frame::SHADOW_INSET + gpui_component::TITLE_BAR_HEIGHT,
        )
    } else {
        point(px(0.0), px(0.0))
    };
    (frame, offset)
}

#[cfg(not(target_os = "linux"))]
fn frame_geometry(_chrome: bool) -> (Size<Pixels>, Point<Pixels>) {
    (size(px(0.0), px(0.0)), point(px(0.0), px(0.0)))
}

pub(crate) fn request_close(id: u64, reason: &str) {
    crate::bridge::window_event(id, "close", json!({ "reason": reason }));
}

pub(crate) fn open(spec: WindowSpec, cx: &mut App) {
    if WINDOWS.with_borrow(|windows| windows.contains_key(&spec.id)) {
        update(spec, cx);
        return;
    }
    let config = CONFIG.get();
    let role = spec.role;
    let chrome = draws_chrome(role);
    let (frame, frame_offset) = frame_geometry(chrome);
    let content = size(px(spec.width), px(spec.height));
    let window_size = size(content.width + frame.width, content.height + frame.height);
    let origin = placement_origin(&spec, window_size, frame_offset, cx);
    let min_size = match (spec.min_width, spec.min_height) {
        (None, None) => None,
        (min_width, min_height) => Some(size(
            px(min_width.unwrap_or(1.0)) + frame.width,
            px(min_height.unwrap_or(1.0)) + frame.height,
        )),
    };
    let kind = match role {
        WindowRole::Dialog | WindowRole::Popup => WindowKind::Floating,
        WindowRole::Normal | WindowRole::Main => WindowKind::Normal,
    };
    let titlebar = if role == WindowRole::Popup {
        None
    } else {
        Some(TitlebarOptions {
            title: Some(spec.title.clone().into()),
            appears_transparent: false,
            traffic_light_position: None,
        })
    };
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds {
            origin,
            size: window_size,
        })),
        titlebar,
        focus: !config.background,
        show: config.show_window,
        kind,
        is_movable: true,
        is_resizable: spec.resizable && !config.test_mode,
        is_minimizable: role == WindowRole::Normal && !config.test_mode,
        display_id: None,
        window_background: gpui::WindowBackgroundAppearance::Opaque,
        #[cfg(target_os = "linux")]
        app_id: Some(crate::linux_app_id()),
        #[cfg(not(target_os = "linux"))]
        app_id: None,
        window_min_size: min_size,
        #[cfg(target_os = "linux")]
        window_decorations: decorations_for(role),
        #[cfg(not(target_os = "linux"))]
        window_decorations: None,
        tabbing_identifier: None,
    };

    let id = spec.id;
    let title = spec.title.clone();
    let created_app: Rc<RefCell<Option<Entity<ServiceApp>>>> = Rc::new(RefCell::new(None));
    let created_view: Rc<Cell<usize>> = Rc::new(Cell::new(0));
    #[cfg(target_os = "linux")]
    let created_frame: Rc<RefCell<Option<Entity<crate::linux_frame::LinuxWindowFrame>>>> =
        Rc::new(RefCell::new(None));
    let app_slot = created_app.clone();
    let view_slot = created_view.clone();
    #[cfg(target_os = "linux")]
    let frame_slot = created_frame.clone();
    let close_on_blur = spec.close_on_blur;
    let close_on_escape = spec.close_on_escape;
    let opened = cx.open_window(options, move |window, cx| {
        window.set_window_title(&title);
        #[cfg(target_os = "macos")]
        {
            crate::liquid_glass::pin_appearance(window);
            if config.offscreen_test_window
                && !crate::liquid_glass::show_offscreen_test_window(window)
            {
                crate::liquid_glass::show_onscreen_capture_window(window);
            }
            if config.capture_onscreen {
                crate::liquid_glass::show_onscreen_capture_window(window);
            }
            if config.background && config.show_window {
                crate::liquid_glass::show_nonactivating_window(window);
            }
            view_slot.set(crate::liquid_glass::gpui_ns_view_ptr(window).unwrap_or(0));
        }
        #[cfg(not(target_os = "macos"))]
        view_slot.set(0);
        let app = cx.new(|cx| {
            let mut app = ServiceApp::new(id, role, chrome, cx);
            app.close_on_blur = close_on_blur;
            app.close_on_escape = close_on_escape;
            app
        });
        app.update(cx, |_this, cx| {
            cx.observe_window_activation(window, move |this, window, cx| {
                activation_changed(
                    this.window_id,
                    window.is_window_active(),
                    this.close_on_blur,
                    cx,
                );
            })
            .detach();
            #[cfg(target_os = "linux")]
            cx.observe_window_bounds(window, move |this, window, _cx| {
                if this.frames_painted.get() > 0 {
                    crate::linux_window_registry::publish_secondary(
                        this.window_id,
                        window,
                        &this.window_title,
                        this.role.label(),
                    );
                }
            })
            .detach();
        });
        window.on_window_should_close(cx, move |_window, _cx| {
            request_close(id, "system");
            false
        });
        *app_slot.borrow_mut() = Some(app.clone());
        #[cfg(target_os = "linux")]
        let root_view: gpui::AnyView = {
            let appearance_override = crate::forced_appearance().map(|mode| match mode {
                gpui_component::theme::ThemeMode::Dark => gpui::WindowAppearance::Dark,
                gpui_component::theme::ThemeMode::Light => gpui::WindowAppearance::Light,
            });
            let content_view: gpui::AnyView = app.clone().into();
            let frame = cx.new(|_| {
                crate::linux_frame::LinuxWindowFrame::secondary(
                    content_view,
                    title.clone().into(),
                    appearance_override,
                    chrome,
                    move |_window, _cx| request_close(id, "system"),
                )
            });
            *frame_slot.borrow_mut() = Some(frame.clone());
            frame.into()
        };
        #[cfg(not(target_os = "linux"))]
        let root_view = app.clone();
        cx.new(|cx| gpui_component::Root::new(root_view, window, cx))
    });
    let handle = match opened {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("[rngpui] cannot open window {id}: {error}");
            request_close(id, "error");
            return;
        }
    };
    let Some(app) = created_app.borrow_mut().take() else {
        return;
    };
    let gpui_id = gpui_key(handle);
    APPS_BY_GPUI_WINDOW.with_borrow_mut(|apps| {
        apps.insert(gpui_id, (id, app.downgrade()));
    });
    app.update(cx, |this, _cx| this.window_title = spec.title.clone());
    let always_on_top = spec.always_on_top;
    WINDOWS.with_borrow_mut(|windows| {
        windows.insert(
            id,
            SecondaryWindow {
                spec,
                handle,
                app: app.clone(),
                #[cfg(target_os = "linux")]
                frame: created_frame.borrow_mut().take(),
                gpui_id,
                view: created_view.get(),
            },
        );
    });
    if always_on_top {
        set_always_on_top(handle, true, cx);
    }
    if let Some(tree) = PENDING_TREES.with_borrow_mut(|pending| pending.remove(&id)) {
        apply_tree(id, tree, cx);
    }
    crate::bridge::window_event(
        id,
        "open",
        json!({ "width": f32::from(content.width), "height": f32::from(content.height) }),
    );
}

fn set_always_on_top(handle: WindowHandle<gpui_component::Root>, on_top: bool, cx: &mut App) {
    let _ = handle.update(cx, |_root, window, _cx| {
        #[cfg(target_os = "macos")]
        crate::liquid_glass::set_floating_level(window, on_top);
        #[cfg(not(target_os = "macos"))]
        window.set_keep_above(on_top);
    });
}

pub(crate) fn update(spec: WindowSpec, cx: &mut App) {
    let Some((previous, handle, app)) = WINDOWS.with_borrow(|windows| {
        windows
            .get(&spec.id)
            .map(|window| (window.spec.clone(), window.handle, window.app.clone()))
    }) else {
        return;
    };
    if previous == spec {
        return;
    }
    let size_changed = previous.width != spec.width || previous.height != spec.height;
    let title_changed = previous.title != spec.title;
    let on_top_changed = previous.always_on_top != spec.always_on_top;
    app.update(cx, |this, _cx| {
        this.close_on_blur = spec.close_on_blur;
        this.close_on_escape = spec.close_on_escape;
        this.window_title = spec.title.clone();
    });
    if title_changed || size_changed {
        let chrome = app.read(cx).chrome;
        let (frame, _) = frame_geometry(chrome);
        let title = spec.title.clone();
        let next_size = size(px(spec.width) + frame.width, px(spec.height) + frame.height);
        let _ = handle.update(cx, |_root, window, _cx| {
            if title_changed {
                window.set_window_title(&title);
            }
            if size_changed {
                window.resize(next_size);
            }
        });
    }
    #[cfg(target_os = "linux")]
    if title_changed
        && let Some(frame) = WINDOWS.with_borrow(|windows| {
            windows
                .get(&spec.id)
                .and_then(|window| window.frame.clone())
        })
    {
        let title = spec.title.clone();
        frame.update(cx, |frame, cx| {
            frame.set_title(title.into());
            cx.notify();
        });
    }
    if on_top_changed {
        set_always_on_top(handle, spec.always_on_top, cx);
    }
    WINDOWS.with_borrow_mut(|windows| {
        if let Some(window) = windows.get_mut(&spec.id) {
            window.spec = spec;
        }
    });
}

pub(crate) fn close(id: u64, cx: &mut App) {
    PENDING_TREES.with_borrow_mut(|pending| pending.remove(&id));
    let Some(window) = WINDOWS.with_borrow_mut(|windows| windows.remove(&id)) else {
        return;
    };
    APPS_BY_GPUI_WINDOW.with_borrow_mut(|apps| apps.remove(&window.gpui_id));
    crate::elements::input::forget_owner(id);
    crate::elements::webview::forget_owner(id);
    crate::elements::forget_pointer_window(window.gpui_id);
    crate::native_element::forget_window(window.gpui_id);
    crate::hit_passthrough::forget_view(window.view);
    #[cfg(target_os = "linux")]
    crate::linux_window_registry::remove_secondary(id);
    let focused_input = window.app.read(cx).focused_input;
    if let Some(input) = focused_input {
        crate::bridge::event(input, "blur");
    }
    let _ = window
        .handle
        .update(cx, |_root, window, _cx| window.remove_window());
    retain_without(id, cx);
    note_activation(id, false, cx);
}

pub(crate) fn focus(id: u64, cx: &mut App) {
    let Some((handle, _)) = get(id) else {
        return;
    };
    let _ = handle.update(cx, |_root, window, _cx| window.activate_window());
}

pub(crate) fn apply_tree(id: u64, tree: Arc<ReactElement>, cx: &mut App) {
    let Some((handle, app)) = WINDOWS.with_borrow(|windows| {
        windows
            .get(&id)
            .map(|window| (window.handle, window.app.clone()))
    }) else {
        PENDING_TREES.with_borrow_mut(|pending| {
            pending.insert(id, tree);
        });
        return;
    };
    app.update(cx, |this, cx| this.apply_secondary_tree(tree, cx));
    let _ = handle.update(cx, |_root, window, root_cx| {
        root_cx.notify();
        window.refresh();
    });
}

pub(crate) fn activation_changed(id: u64, active: bool, close_on_blur: bool, cx: &mut App) {
    note_activation(id, active, cx);
    if !active && close_on_blur && id != 0 {
        request_close(id, "blur");
    }
}

pub(crate) fn simulate_activation(id: u64, active: bool, cx: &mut App) -> bool {
    if id == 0 {
        note_activation(0, active, cx);
        return true;
    }
    let Some((_, app)) = get(id) else {
        return false;
    };
    let close_on_blur = app.read(cx).close_on_blur;
    activation_changed(id, active, close_on_blur, cx);
    true
}

pub(crate) fn note_activation(id: u64, active: bool, cx: &mut App) {
    let changed = ACTIVE.with_borrow_mut(|focused| {
        if active {
            focused.insert(id)
        } else {
            focused.remove(&id)
        }
    });
    if changed && id != 0 && WINDOWS.with_borrow(|windows| windows.contains_key(&id)) {
        crate::bridge::window_event(id, if active { "focus" } else { "blur" }, json!({}));
    }
    if changed && id == 0 {
        crate::bridge::window_event(0, if active { "focus" } else { "blur" }, json!({}));
    }
    if active {
        publish_app_state(cx);
        return;
    }
    let check = APP_STATE_CHECK.get() + 1;
    APP_STATE_CHECK.set(check);
    cx.spawn(async move |cx| {
        cx.background_executor()
            .timer(Duration::from_millis(60))
            .await;
        if APP_STATE_CHECK.get() == check {
            let _ = cx.update(publish_app_state);
        }
    })
    .detach();
}

fn publish_app_state(_cx: &mut App) {
    let focused = ACTIVE.with_borrow(|focused| {
        let mut ids: Vec<u64> = focused.iter().copied().collect();
        ids.sort_unstable();
        ids.last().copied()
    });
    let active = focused.is_some();
    if APP_ACTIVE.get() == Some(active) && active {
        crate::bridge::app_state(active, focused);
        return;
    }
    if APP_ACTIVE.get() == Some(active) {
        return;
    }
    APP_ACTIVE.set(Some(active));
    crate::bridge::app_state(active, focused);
}

pub(crate) fn is_main_closed(cx: &mut App) -> bool {
    let Some((handle, _)) = main_window() else {
        return false;
    };
    handle.update(cx, |_root, _window, _cx| ()).is_err()
}

pub(crate) fn close_all_secondary(cx: &mut App) {
    let ids: Vec<u64> = WINDOWS.with_borrow(|windows| windows.keys().copied().collect());
    for id in ids {
        close(id, cx);
    }
}

pub(crate) fn capture_request_targets() -> Vec<(u64, WindowHandle<gpui_component::Root>)> {
    WINDOWS.with_borrow(|windows| {
        windows
            .values()
            .map(|window| (window.spec.id, window.handle))
            .collect()
    })
}

pub(crate) fn describe(cx: &mut App) -> Value {
    let mut out = Vec::new();
    if let Some((handle, app)) = main_window() {
        out.push(describe_one(0, "main", None, None, handle, &app, cx));
    }
    let mut windows: Vec<(
        WindowSpec,
        WindowHandle<gpui_component::Root>,
        Entity<ServiceApp>,
    )> = WINDOWS.with_borrow(|windows| {
        windows
            .values()
            .map(|window| (window.spec.clone(), window.handle, window.app.clone()))
            .collect()
    });
    windows.sort_by_key(|(spec, _, _)| spec.id);
    for (spec, handle, app) in windows {
        out.push(describe_one(
            spec.id,
            spec.role.label(),
            Some(spec.title.clone()),
            spec.test_id.clone(),
            handle,
            &app,
            cx,
        ));
    }
    json!({ "ok": true, "type": "windows", "windows": out })
}

fn describe_one(
    id: u64,
    kind: &str,
    title: Option<String>,
    test_id: Option<String>,
    handle: WindowHandle<gpui_component::Root>,
    app: &Entity<ServiceApp>,
    cx: &mut App,
) -> Value {
    let (nodes, frames, chrome, focused_input) = {
        let app = app.read(cx);
        let frames = if id == 0 {
            crate::anim_trace::frames_painted()
        } else {
            app.frames_painted.get()
        };
        (
            app.tree_metadata.node_ids.len(),
            frames,
            app.chrome,
            app.focused_input,
        )
    };
    let geometry = handle
        .update(cx, |_root, window, _cx| {
            let bounds = window.bounds();
            #[cfg(target_os = "linux")]
            let content = crate::linux_frame::content_size(window, chrome);
            #[cfg(not(target_os = "linux"))]
            let content = {
                let _ = chrome;
                window.viewport_size()
            };
            json!({
                "x": f32::from(bounds.origin.x),
                "y": f32::from(bounds.origin.y),
                "outerWidth": f32::from(bounds.size.width),
                "outerHeight": f32::from(bounds.size.height),
                "width": f32::from(content.width),
                "height": f32::from(content.height),
                "active": window.is_window_active(),
            })
        })
        .unwrap_or(Value::Null);
    json!({
        "id": id,
        "kind": kind,
        "title": title,
        "testID": test_id,
        "nodes": nodes,
        "framesPainted": frames,
        "focusedInput": focused_input,
        "bounds": geometry,
    })
}
