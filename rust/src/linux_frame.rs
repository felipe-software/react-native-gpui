use std::rc::Rc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use gpui::{
    AbsoluteLength, AnyView, App, BoxShadow, Context, CursorStyle, Decorations, Edges, Hsla,
    InteractiveElement as _, IntoElement, MouseButton, ParentElement, Pixels, Point, Render,
    ResizeEdge, SharedString, Size, Styled, Tiling, Window, WindowAppearance, WindowDecorations,
    div, point, prelude::FluentBuilder as _, px, rgb, size,
};
use gpui_component::{TITLE_BAR_HEIGHT, TitleBar};

static CHROME: AtomicBool = AtomicBool::new(true);
static TRANSPARENT: AtomicBool = AtomicBool::new(false);
static APP_TINT: Mutex<Option<Hsla>> = Mutex::new(None);

pub const SHADOW_INSET: Pixels = px(12.0);
const LIGHT_BACKDROP: u32 = 0xfafafa;
const DARK_BACKDROP: u32 = 0x242424;
const LIGHT_TITLE_BAR: u32 = 0xebebeb;
const DARK_TITLE_BAR: u32 = 0x303030;
const LIGHT_EDGE: u32 = 0xd0d0d0;
const DARK_EDGE: u32 = 0x1a1a1a;

pub fn configure(chrome: bool) {
    CHROME.store(chrome, Ordering::Relaxed);
    TRANSPARENT.store(
        std::env::var_os("RNGPUI_TRANSPARENT_WINDOW").is_some(),
        Ordering::Relaxed,
    );
    gpui_component::set_client_frame_enabled(false);
    set_app_tint(
        std::env::var("RNGPUI_APP_TINT")
            .ok()
            .and_then(|value| crate::style::parse_css_color(&value)),
    );
}

pub fn requested_decorations() -> Option<WindowDecorations> {
    match std::env::var("RNGPUI_LINUX_DECORATIONS").ok()?.as_str() {
        "client" => Some(WindowDecorations::Client),
        "server" => Some(WindowDecorations::Server),
        _ => None,
    }
}

pub fn set_app_tint(color: Option<Hsla>) {
    *APP_TINT.lock().unwrap_or_else(|error| error.into_inner()) = color;
}

pub fn main_chrome() -> bool {
    CHROME.load(Ordering::Relaxed)
}

fn client_tiling(window: &Window, chrome: bool) -> Option<Tiling> {
    if !chrome {
        return None;
    }
    match window.window_decorations() {
        Decorations::Client { tiling } => Some(tiling),
        Decorations::Server => None,
    }
}

fn insets(window: &Window, chrome: bool) -> Edges<Pixels> {
    let Some(tiling) = client_tiling(window, chrome) else {
        return Edges::all(px(0.0));
    };
    let inset = |tiled: bool| if tiled { px(0.0) } else { SHADOW_INSET };
    Edges {
        top: inset(tiling.top),
        right: inset(tiling.right),
        bottom: inset(tiling.bottom),
        left: inset(tiling.left),
    }
}

pub fn content_size(window: &Window, chrome: bool) -> Size<Pixels> {
    let viewport = window.viewport_size();
    let insets = insets(window, chrome);
    let title_bar = if client_tiling(window, chrome).is_some() {
        TITLE_BAR_HEIGHT
    } else {
        px(0.0)
    };
    size(
        (viewport.width - insets.left - insets.right).max(px(0.0)),
        (viewport.height - insets.top - insets.bottom - title_bar).max(px(0.0)),
    )
}

pub fn content_offset(window: &Window, chrome: bool) -> Point<Pixels> {
    let insets = insets(window, chrome);
    let title_bar = if client_tiling(window, chrome).is_some() {
        TITLE_BAR_HEIGHT
    } else {
        px(0.0)
    };
    point(insets.left, insets.top + title_bar)
}

fn is_dark(appearance: WindowAppearance) -> bool {
    matches!(
        appearance,
        WindowAppearance::Dark | WindowAppearance::VibrantDark
    )
}

fn backdrop(appearance: WindowAppearance) -> Option<Hsla> {
    if TRANSPARENT.load(Ordering::Relaxed) {
        return None;
    }
    let base: Hsla = rgb(if is_dark(appearance) {
        DARK_BACKDROP
    } else {
        LIGHT_BACKDROP
    })
    .into();
    let tint = *APP_TINT.lock().unwrap_or_else(|error| error.into_inner());
    Some(tint.map_or(base, |tint| base.blend(tint)))
}

fn resize_cursor(edge: ResizeEdge) -> CursorStyle {
    match edge {
        ResizeEdge::Top | ResizeEdge::Bottom => CursorStyle::ResizeUpDown,
        ResizeEdge::Left | ResizeEdge::Right => CursorStyle::ResizeLeftRight,
        ResizeEdge::TopLeft | ResizeEdge::BottomRight => CursorStyle::ResizeUpLeftDownRight,
        ResizeEdge::TopRight | ResizeEdge::BottomLeft => CursorStyle::ResizeUpRightDownLeft,
    }
}

fn resize_handle(edge: ResizeEdge, insets: Edges<Pixels>) -> impl IntoElement {
    let along = |length: Pixels| AbsoluteLength::Pixels(length);
    let handle = div().absolute().cursor(resize_cursor(edge));
    let handle = match edge {
        ResizeEdge::Top => handle
            .top_0()
            .left(along(insets.left))
            .right(along(insets.right))
            .h(insets.top),
        ResizeEdge::Bottom => handle
            .bottom_0()
            .left(along(insets.left))
            .right(along(insets.right))
            .h(insets.bottom),
        ResizeEdge::Left => handle
            .left_0()
            .top(along(insets.top))
            .bottom(along(insets.bottom))
            .w(insets.left),
        ResizeEdge::Right => handle
            .right_0()
            .top(along(insets.top))
            .bottom(along(insets.bottom))
            .w(insets.right),
        ResizeEdge::TopLeft => handle.top_0().left_0().w(insets.left).h(insets.top),
        ResizeEdge::TopRight => handle.top_0().right_0().w(insets.right).h(insets.top),
        ResizeEdge::BottomLeft => handle.bottom_0().left_0().w(insets.left).h(insets.bottom),
        ResizeEdge::BottomRight => handle.bottom_0().right_0().w(insets.right).h(insets.bottom),
    };
    handle.on_mouse_down(MouseButton::Left, move |_, window, cx| {
        cx.stop_propagation();
        window.start_window_resize(edge);
    })
}

pub fn chrome_size(client_decorated: bool) -> Size<Pixels> {
    frame_size(client_decorated && CHROME.load(Ordering::Relaxed))
}

pub fn frame_size(chrome: bool) -> Size<Pixels> {
    if !chrome {
        return size(px(0.0), px(0.0));
    }
    size(SHADOW_INSET * 2.0, SHADOW_INSET * 2.0 + TITLE_BAR_HEIGHT)
}

type CloseHandler = Rc<dyn Fn(&mut Window, &mut App)>;

pub struct LinuxWindowFrame {
    content: AnyView,
    title: SharedString,
    appearance_override: Option<WindowAppearance>,
    chrome: bool,
    on_close: Option<CloseHandler>,
}

impl LinuxWindowFrame {
    pub fn new(
        content: AnyView,
        title: SharedString,
        appearance_override: Option<WindowAppearance>,
    ) -> Self {
        Self {
            content,
            title,
            appearance_override,
            chrome: CHROME.load(Ordering::Relaxed),
            on_close: None,
        }
    }

    pub fn secondary(
        content: AnyView,
        title: SharedString,
        appearance_override: Option<WindowAppearance>,
        chrome: bool,
        on_close: impl Fn(&mut Window, &mut App) + 'static,
    ) -> Self {
        Self {
            content,
            title,
            appearance_override,
            chrome,
            on_close: Some(Rc::new(on_close)),
        }
    }

    pub fn set_title(&mut self, title: SharedString) {
        self.title = title;
    }
}

impl Render for LinuxWindowFrame {
    fn render(&mut self, window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let appearance = self
            .appearance_override
            .unwrap_or_else(|| window.appearance());
        let backdrop = backdrop(appearance);
        let tiling = client_tiling(window, self.chrome);
        window.set_client_inset(if tiling.is_some() {
            SHADOW_INSET
        } else {
            px(0.0)
        });
        let Some(tiling) = tiling else {
            return div()
                .size_full()
                .when_some(backdrop, |frame, color| frame.bg(color))
                .child(self.content.clone())
                .into_any_element();
        };

        let dark = is_dark(appearance);
        let insets = insets(window, self.chrome);
        let on_close = self.on_close.clone();
        let title_bar = TitleBar::new().when_some(on_close, |title_bar, on_close| {
            title_bar.on_close_window(move |_, window, cx| on_close(window, cx))
        });
        let edge_color = rgb(if dark { DARK_EDGE } else { LIGHT_EDGE });

        let surface = div()
            .size_full()
            .relative()
            .overflow_hidden()
            .when_some(backdrop, |frame, color| frame.bg(color))
            .border_color(edge_color)
            .when(!tiling.top, |frame| frame.border_t_1())
            .when(!tiling.bottom, |frame| frame.border_b_1())
            .when(!tiling.left, |frame| frame.border_l_1())
            .when(!tiling.right, |frame| frame.border_r_1())
            .when(!tiling.is_tiled(), |frame| {
                frame.shadow(vec![BoxShadow {
                    color: gpui::black().opacity(0.3),
                    offset: point(px(0.0), px(1.0)),
                    blur_radius: SHADOW_INSET / 2.0,
                    spread_radius: px(0.0),
                }])
            })
            .child(
                div()
                    .absolute()
                    .top(TITLE_BAR_HEIGHT)
                    .left_0()
                    .right_0()
                    .bottom_0()
                    .child(self.content.clone()),
            )
            .child(
                div().absolute().top_0().left_0().right_0().child(
                    title_bar
                        .bg(rgb(if dark {
                            DARK_TITLE_BAR
                        } else {
                            LIGHT_TITLE_BAR
                        }))
                        .border_color(edge_color)
                        .child(div().text_sm().line_clamp(1).child(self.title.clone())),
                ),
            );

        div()
            .size_full()
            .relative()
            .pt(insets.top)
            .pr(insets.right)
            .pb(insets.bottom)
            .pl(insets.left)
            .child(surface)
            .children(
                [
                    ResizeEdge::Top,
                    ResizeEdge::Bottom,
                    ResizeEdge::Left,
                    ResizeEdge::Right,
                    ResizeEdge::TopLeft,
                    ResizeEdge::TopRight,
                    ResizeEdge::BottomLeft,
                    ResizeEdge::BottomRight,
                ]
                .map(|edge| resize_handle(edge, insets)),
            )
            .into_any_element()
    }
}
