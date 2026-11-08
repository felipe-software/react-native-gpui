use std::sync::Arc;
use std::time::Instant;

use gpui::{
    App, Bounds, ContentMask, CursorStyle, Element, ElementId, GlobalElementId, Hitbox,
    HitboxBehavior, Hsla, IntoElement, LayoutId, MouseButton, MouseDownEvent, MouseExitEvent,
    MouseMoveEvent, MouseUpEvent, PathBuilder, Pixels, Point, ScrollWheelEvent, Window, fill,
    point, px, size,
};

use super::events;
use super::images;
use super::layout::{ColorRole, GlyphsItem, ItemKind, LayoutStyle, Shaper};
use super::model::ChatListOptions;
use super::state::{
    self, Gesture, HitTarget, ListState, Row, SCROLLBAR_WIDTH, ScrollbarGeometry, SelPos, Selection,
};
use crate::elements::{ReactElement, bounds_have_drawable_area, report_layout};

pub const SCROLLBAR_LAYOUT_INSET: f32 = 8.0;
const THUMB_IDLE_WIDTH: f32 = 4.0;
const CLICK_SLOP: f32 = 15.0;

#[derive(Clone, Copy)]
pub struct Palette {
    pub text: Hsla,
    pub muted: Hsla,
    pub link: Hsla,
    pub selection: Hsla,
    pub separator: Option<Hsla>,
    pub alternate: Option<Hsla>,
    pub thumb: Hsla,
    pub thumb_active: Hsla,
    pub curve: Hsla,
}

impl Palette {
    fn resolve(options: &ChatListOptions, element: &ReactElement) -> Self {
        let text = options
            .text_color
            .or(element.style.color)
            .unwrap_or_else(|| gpui::rgba(0xffffffff).into());
        let thumb = options
            .scrollbar_color
            .unwrap_or_else(|| gpui::rgba(0x575757ff).into());
        let thumb_active = Hsla {
            l: (thumb.l + 0.04).min(1.0),
            ..thumb
        };
        Self {
            text,
            muted: options
                .muted_color
                .unwrap_or_else(|| gpui::rgba(0x8c7f7fff).into()),
            link: options
                .link_color
                .unwrap_or_else(|| gpui::rgba(0x4286f4ff).into()),
            selection: options
                .selection_color
                .unwrap_or_else(|| gpui::rgba(0xffffff40).into()),
            separator: options.separator_color,
            alternate: options.alternate_background,
            thumb,
            thumb_active,
            curve: gpui::rgba(0x888888ff).into(),
        }
    }

    fn color(&self, role: ColorRole) -> Hsla {
        match role {
            ColorRole::Text => self.text,
            ColorRole::Muted => self.muted,
            ColorRole::Link => self.link,
            ColorRole::Custom(color) => color,
        }
    }
}

struct RowPaint {
    row: Row,
    background: Option<Hsla>,
    opacity: Option<f32>,
    selected: Option<(u32, u32)>,
}

pub struct ChatPrepaint {
    hitbox: Hitbox,
    pointer_span: usize,
    rows: Vec<RowPaint>,
    palette: Palette,
    hovered: Option<HitTarget>,
    scrollbar: ScrollbarGeometry,
    thumb_hovered: bool,
    thumb_dragging: bool,
    markers: Vec<(f32, Hsla)>,
    animate: bool,
    line_height: f32,
}

pub struct ReactChatListElement {
    element: Arc<ReactElement>,
}

impl ReactChatListElement {
    pub fn new(element: Arc<ReactElement>) -> Self {
        Self { element }
    }

    fn options(&self) -> ChatListOptions {
        self.element
            .chat_list_options()
            .cloned()
            .unwrap_or_default()
    }
}

fn layout_style(options: &ChatListOptions, window: &Window) -> LayoutStyle {
    let font_family = options
        .font_family
        .clone()
        .unwrap_or_else(|| window.text_style().font_family.clone());
    LayoutStyle {
        font_family,
        font_size: options.font_size,
        emote_scale: options.emote_scale,
        show_timestamps: options.show_timestamps,
    }
}

pub fn prepare_list(
    list: &mut ListState,
    style: &LayoutStyle,
    bounds: Bounds<Pixels>,
    window: &Window,
) {
    let text_system = window.text_system().clone();
    let shaper = Shaper {
        text_system: &text_system,
        style,
    };
    if list.style.as_ref() != Some(style) {
        let metrics = shaper.metrics(&shaper.font(false, false), style.font_size);
        list.set_style(style.clone(), metrics);
    }
    let was_overflowing = list.scrollbar.thumb.is_some();
    let width_for = |overflowing: bool| {
        let inset = if overflowing {
            SCROLLBAR_LAYOUT_INSET
        } else {
            0.0
        };
        (f32::from(bounds.size.width) - inset).max(1.0)
    };
    list.compute_rows(bounds, width_for(was_overflowing), &shaper);
    list.update_scrollbar(bounds);
    let overflowing = list.scrollbar.thumb.is_some();
    if overflowing != was_overflowing {
        list.compute_rows(bounds, width_for(overflowing), &shaper);
        list.update_scrollbar(bounds);
    }
}

fn hovered_after_layout(list: &mut ListState, id: u64, pointer: Point<Pixels>, inside: bool) {
    let next = if inside && list.gesture.is_none() {
        list.hit_target(pointer)
    } else {
        None
    };
    let changed = match (&list.hovered, &next) {
        (Some(previous), Some(next)) => {
            !previous.same_element(next) || previous.bounds != next.bounds
        }
        (None, None) => false,
        _ => true,
    };
    if changed {
        events::emit_hover(id, list, next.as_ref());
        list.hovered = next;
    }
}

impl Element for ReactChatListElement {
    type RequestLayoutState = ();
    type PrepaintState = Option<ChatPrepaint>;

    fn id(&self) -> Option<ElementId> {
        Some(ElementId::Integer(self.element.global_id))
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let style = self.element.build_gpui_style(None);
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        _cx: &mut App,
    ) -> Option<ChatPrepaint> {
        if self.element.style.is_display_none() {
            return None;
        }
        report_layout(&self.element, bounds);
        if !bounds_have_drawable_area(bounds) {
            return None;
        }
        let hitbox = window.insert_hitbox(bounds, HitboxBehavior::Normal);
        let pointer_span =
            crate::elements::div::open_pointer_span(hitbox.id, self.element.global_id, false);
        crate::elements::div::close_pointer_span(pointer_span);

        let options = self.options();
        let palette = Palette::resolve(&options, &self.element);
        let style = layout_style(&options, window);
        let id = self.element.global_id;
        let pointer = window.mouse_position();
        let pointer_in_bounds = bounds.contains(&pointer);
        let animate = options.animate_emotes;
        let listens_press = self.element.listens(events::PRESS_EVENT);
        let listens_hover = self.element.listens(events::HOVER_EVENT);
        state::with_list(id, |list| {
            list.listens_press = listens_press;
            list.listens_hover = listens_hover;
            list.set_options(options);
            prepare_list(list, &style, bounds, window);
            let inside = pointer_in_bounds && list.pointer_inside;
            hovered_after_layout(list, id, pointer, inside);
            let rows = list
                .rows
                .iter()
                .map(|row| {
                    let entry = list.entry(row.seq);
                    let message = entry.map(|entry| &entry.message);
                    let alternate = palette.alternate.filter(|_| row.seq.rem_euclid(2) == 1);
                    let background = message.and_then(|message| message.background).or(alternate);
                    let disabled = message.is_some_and(|message| message.disabled);
                    let historical = message.is_some_and(|message| message.historical);
                    let mut opacity = 1.0;
                    if disabled {
                        opacity *= list.options.disabled_opacity;
                    }
                    if historical {
                        opacity *= list.options.historical_opacity;
                    }
                    RowPaint {
                        row: row.clone(),
                        background,
                        opacity: (opacity < 1.0).then_some(opacity),
                        selected: list
                            .selection
                            .and_then(|selection| selection.units_for(row.seq)),
                    }
                })
                .collect();
            let scrollbar = list.scrollbar;
            let thumb_dragging = matches!(list.gesture, Some(Gesture::Thumb { .. }));
            let thumb_hovered = thumb_dragging || (inside && list.pointer_on_scrollbar);
            let markers = marker_positions(list, &scrollbar);
            let line_height = list.metrics.map_or(16.0, |metrics| metrics.text_height());
            Some(ChatPrepaint {
                hitbox,
                pointer_span,
                rows,
                palette,
                hovered: list.hovered.clone(),
                scrollbar,
                thumb_hovered,
                thumb_dragging,
                markers,
                animate,
                line_height,
            })
        })
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        prepaint: &mut Option<ChatPrepaint>,
        window: &mut Window,
        cx: &mut App,
    ) {
        let Some(prepaint) = prepaint.as_mut() else {
            return;
        };
        let id = self.element.global_id;
        let now = Instant::now();
        let style = self.element.build_gpui_style(None);
        let mut tally = PaintTally::default();
        let content_mask = ContentMask {
            bounds,
            corner_radii: crate::elements::div::overflow_clip_radii(
                bounds,
                &style,
                window.rem_size(),
            ),
        };
        window.with_element_opacity(self.element.style.opacity, |window| {
            style.paint(bounds, window, cx, |window, cx| {
                window.with_content_mask(Some(content_mask), |window| {
                    window.paint_layer(bounds, |window| {
                        for row_paint in &prepaint.rows {
                            paint_row(
                                row_paint,
                                Pass::Content,
                                bounds,
                                prepaint,
                                now,
                                &mut tally,
                                window,
                                cx,
                            );
                        }
                    });
                    window.paint_layer(bounds, |window| {
                        for row_paint in prepaint
                            .rows
                            .iter()
                            .filter(|row_paint| row_paint.row.layout.has_layers)
                        {
                            paint_row(
                                row_paint,
                                Pass::Overlays,
                                bounds,
                                prepaint,
                                now,
                                &mut tally,
                                window,
                                cx,
                            );
                        }
                    });
                    window.paint_layer(bounds, |window| {
                        for row_paint in &prepaint.rows {
                            if let Some((from, to)) = row_paint.selected {
                                let origin_x = bounds.origin.x;
                                let color = prepaint.palette.selection;
                                window.with_element_opacity(row_paint.opacity, |window| {
                                    paint_selection(
                                        &row_paint.row,
                                        from,
                                        to,
                                        origin_x,
                                        color,
                                        window,
                                    );
                                });
                            }
                        }
                        paint_scrollbar(prepaint, window);
                    });
                });
            });
        });

        if let Some(hovered) = prepaint.hovered.as_ref()
            && hovered_uses_hand(hovered)
        {
            window.set_cursor_style(CursorStyle::PointingHand, &prepaint.hitbox);
        }

        state::with_existing(id, |list| {
            list.stats.painted_items = tally.items;
            list.stats.painted_images = tally.images;
            list.stats.animated_visible = tally.animated;
            let snapshot = list.scroll_snapshot();
            if list.last_scroll_state != Some(snapshot) {
                list.last_scroll_state = Some(snapshot);
                events::emit_scroll_state(id, &self.element, snapshot);
            }
        });

        if let Some(deadline) = tally.next_wake {
            images::request_wake(deadline, window, cx);
        }
        images::sweep(now, window, cx);
        register_listeners(id, prepaint, bounds, window);
    }
}

fn hovered_uses_hand(hovered: &HitTarget) -> bool {
    !matches!(hovered.kind, state::TargetKind::Badge)
}

fn marker_positions(list: &ListState, scrollbar: &ScrollbarGeometry) -> Vec<(f32, Hsla)> {
    let Some(track) = scrollbar.track else {
        return Vec::new();
    };
    let Some(front) = list.entries.front().map(|entry| entry.seq) else {
        return Vec::new();
    };
    if scrollbar.thumb.is_none() {
        return Vec::new();
    }
    let total = list.entries.len().max(1) as f32;
    let height = f32::from(track.size.height);
    list.markers
        .iter()
        .map(|(seq, color)| {
            let index = (*seq - front) as f32;
            (f32::from(track.top()) + height * index / total, *color)
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Pass {
    Content,
    Overlays,
}

#[derive(Default)]
struct PaintTally {
    items: usize,
    images: usize,
    animated: usize,
    next_wake: Option<Instant>,
}

impl PaintTally {
    fn wake_at(&mut self, deadline: Instant) {
        self.next_wake = Some(
            self.next_wake
                .map_or(deadline, |current| current.min(deadline)),
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn paint_row(
    row_paint: &RowPaint,
    pass: Pass,
    bounds: Bounds<Pixels>,
    prepaint: &ChatPrepaint,
    now: Instant,
    tally: &mut PaintTally,
    window: &mut Window,
    cx: &mut App,
) {
    let row = &row_paint.row;
    let layout = &row.layout;
    let origin_x = bounds.origin.x;
    let top = px(row.top);
    let palette = &prepaint.palette;
    window.with_element_opacity(row_paint.opacity, |window| {
        if pass == Pass::Content {
            if let Some(background) = row_paint.background {
                let row_bounds = Bounds::new(
                    point(origin_x, top),
                    size(bounds.size.width, px(layout.height)),
                );
                window.paint_quad(fill(row_bounds, background));
            }
            if let Some(separator) = palette.separator {
                let line = Bounds::new(point(origin_x, top), size(bounds.size.width, px(1.0)));
                window.paint_quad(fill(line, separator));
            }
        }
        let hovered_link = prepaint.hovered.as_ref().filter(|hovered| {
            hovered.seq == row.seq && matches!(hovered.kind, state::TargetKind::Link)
        });
        for item in &layout.items {
            let wanted = match pass {
                Pass::Content => !item.layer,
                Pass::Overlays => item.layer,
            };
            if !wanted {
                continue;
            }
            let item_top = row.top + item.y;
            let visible = item_top < f32::from(bounds.bottom())
                && item_top + item.height > f32::from(bounds.top());
            if !visible {
                continue;
            }
            match &item.kind {
                ItemKind::Glyphs(glyphs) => {
                    tally.items += 1;
                    let color = palette.color(glyphs.color);
                    let baseline_y = px(row.top + glyphs.baseline);
                    let item_x = origin_x + px(item.x);
                    paint_glyphs(glyphs, item_x, baseline_y, color, window);
                    let underline = hovered_link.is_some_and(|hovered| {
                        hovered.part == item.part && hovered.element == item.element
                    });
                    if underline {
                        paint_link_underline(
                            glyphs,
                            item_x,
                            baseline_y,
                            px(item.width),
                            color,
                            window,
                        );
                    }
                }
                ItemKind::Image(image) => {
                    let image_bounds = Bounds::new(
                        point(origin_x + px(item.x), px(item_top)),
                        size(px(item.width), px(item.height)),
                    );
                    if let Some(background) = image.background {
                        window.paint_quad(gpui::fill(image_bounds, background));
                    }
                    let Some(loaded) = images::image(&image.url, now, window, cx) else {
                        continue;
                    };
                    tally.images += 1;
                    let (frame, deadline) = loaded.frame_at(now, prepaint.animate);
                    if let Some(deadline) = deadline {
                        tally.animated += 1;
                        tally.wake_at(deadline);
                    }
                    let _ = window.paint_image(
                        image_bounds,
                        gpui::Corners::default(),
                        loaded.data.clone(),
                        frame,
                        false,
                    );
                }
                ItemKind::ReplyCurve => {
                    paint_reply_curve(
                        origin_x + px(item.x),
                        px(row.top + item.bottom()),
                        palette.curve,
                        window,
                    );
                }
            }
        }
    });
}

fn paint_glyphs(
    glyphs: &GlyphsItem,
    x: Pixels,
    baseline_y: Pixels,
    color: Hsla,
    window: &mut Window,
) {
    let font_size = glyphs.layout.font_size;
    for run in glyphs.layout.runs.iter() {
        for glyph in run.glyphs.iter() {
            let origin = point(x + glyph.position.x, baseline_y);
            let _ = if glyph.is_emoji {
                window.paint_emoji(origin, run.font_id, glyph.id, font_size)
            } else {
                window.paint_glyph(origin, run.font_id, glyph.id, font_size, color)
            };
        }
    }
}

fn paint_link_underline(
    glyphs: &GlyphsItem,
    x: Pixels,
    baseline_y: Pixels,
    width: Pixels,
    color: Hsla,
    window: &mut Window,
) {
    let descent = glyphs.layout.descent.max(px(1.0));
    window.paint_underline(
        point(x, baseline_y + descent * 0.5),
        width,
        &gpui::UnderlineStyle {
            color: Some(color),
            thickness: px(1.0),
            wavy: false,
        },
    );
}

fn paint_reply_curve(x: Pixels, bottom: Pixels, color: Hsla, window: &mut Window) {
    let mut builder = PathBuilder::stroke(px(1.5));
    let start = point(x + px(2.0), bottom - px(2.0));
    let corner = point(x + px(2.0), bottom - px(8.0));
    let bend = point(x + px(8.0), bottom - px(8.0));
    let end = point(x + px(18.0), bottom - px(8.0));
    builder.move_to(start);
    builder.curve_to(bend, corner);
    builder.line_to(end);
    if let Ok(path) = builder.build() {
        window.paint_path(path, color);
    }
}

fn paint_selection(
    row: &Row,
    from: u32,
    to: u32,
    origin_x: Pixels,
    color: Hsla,
    window: &mut Window,
) {
    let layout = &row.layout;
    for line in &layout.lines {
        let mut start_x: Option<f32> = None;
        let mut end_x = 0.0f32;
        for index in line.items.clone() {
            let item = &layout.items[index];
            if item.layer || !item.is_selectable() {
                continue;
            }
            let item_end = item.sel_start + item.sel_len;
            let overlap_start = from.max(item.sel_start);
            let overlap_end = to.min(item_end);
            if overlap_start >= overlap_end {
                continue;
            }
            let x0 = item.x_for_unit(overlap_start);
            let mut x1 = item.x_for_unit(overlap_end);
            let continues = to > item_end;
            if continues {
                x1 = item.right() + item.space_width;
            }
            start_x = Some(start_x.map_or(x0, |start| start.min(x0)));
            end_x = end_x.max(x1);
        }
        if let Some(start) = start_x {
            let band = Bounds::new(
                point(origin_x + px(start), px(row.top + line.top)),
                size(px((end_x - start).max(1.0)), px(line.bottom - line.top)),
            );
            window.paint_quad(fill(band, color));
        }
    }
}

fn paint_scrollbar(prepaint: &ChatPrepaint, window: &mut Window) {
    let Some(thumb) = prepaint.scrollbar.thumb else {
        return;
    };
    let palette = &prepaint.palette;
    let color = if prepaint.thumb_dragging {
        palette.thumb_active
    } else {
        palette.thumb
    };
    let expanded = prepaint.thumb_hovered;
    let width = if expanded {
        SCROLLBAR_WIDTH
    } else {
        THUMB_IDLE_WIDTH
    };
    let thumb_bounds = Bounds::new(
        point(thumb.right() - px(width), thumb.top()),
        size(px(width), thumb.size.height),
    );
    window.paint_quad(fill(thumb_bounds, color));
    let Some(track) = prepaint.scrollbar.track else {
        return;
    };
    let total = prepaint.scrollbar.total.max(1.0);
    let marker_height = (f32::from(track.size.height) / total).max(2.0).ceil();
    let marker_x = track.left() + px(SCROLLBAR_WIDTH * 3.0 / 8.0);
    for (y, color) in &prepaint.markers {
        let marker = Bounds::new(
            point(marker_x, px(*y)),
            size(px(SCROLLBAR_WIDTH / 4.0), px(marker_height)),
        );
        window.paint_quad(fill(marker, *color));
    }
}

fn register_listeners(
    id: u64,
    prepaint: &ChatPrepaint,
    bounds: Bounds<Pixels>,
    window: &mut Window,
) {
    let span = prepaint.pointer_span;
    let line_height = prepaint.line_height;
    let scrollbar = prepaint.scrollbar;

    window.on_mouse_event(move |event: &MouseDownEvent, phase, window, _cx| {
        if !phase.bubble() || !bounds.contains(&event.position) {
            return;
        }
        if !crate::elements::div::pointer_reaches(Some(span), window) {
            return;
        }
        if handle_mouse_down(id, event, scrollbar, window) {
            window.refresh();
        }
    });

    window.on_mouse_event(move |event: &MouseMoveEvent, phase, window, _cx| {
        if !phase.bubble() {
            return;
        }
        let inside = bounds.contains(&event.position)
            && crate::elements::div::pointer_reaches(Some(span), window);
        if handle_mouse_move(id, event, inside, window) {
            crate::anim_overlay::arm_paint_only_frame();
            window.refresh();
        }
    });

    window.on_mouse_event(move |event: &MouseUpEvent, phase, window, _cx| {
        if !phase.bubble() {
            return;
        }
        if handle_mouse_up(id, event) {
            crate::anim_overlay::arm_paint_only_frame();
            window.refresh();
        }
    });

    window.on_mouse_event(move |_event: &MouseExitEvent, phase, window, _cx| {
        if !phase.bubble() {
            return;
        }
        if handle_pointer_left(id) {
            crate::anim_overlay::arm_paint_only_frame();
            window.refresh();
        }
    });

    window.on_mouse_event(move |event: &ScrollWheelEvent, phase, window, cx| {
        if !phase.bubble() || !bounds.contains(&event.position) {
            return;
        }
        if !crate::elements::div::pointer_reaches(Some(span), window) {
            return;
        }
        let delta = event.delta.pixel_delta(px(line_height));
        if scroll_list(id, f32::from(delta.y), window) {
            crate::anim_overlay::arm_paint_only_frame();
            window.refresh();
            cx.stop_propagation();
        }
    });
}

pub fn scroll_list(id: u64, delta_y: f32, window: &Window) -> bool {
    state::with_existing(id, |list| {
        let style = list.style.clone()?;
        let text_system = window.text_system().clone();
        let shaper = Shaper {
            text_system: &text_system,
            style: &style,
        };
        Some(list.scroll_by(delta_y, &shaper))
    })
    .flatten()
    .unwrap_or(false)
}

fn handle_mouse_down(
    id: u64,
    event: &MouseDownEvent,
    scrollbar: ScrollbarGeometry,
    window: &Window,
) -> bool {
    let on_scrollbar = scrollbar
        .track
        .is_some_and(|track| track.contains(&event.position));
    if on_scrollbar && scrollbar.thumb.is_some() && event.button == MouseButton::Left {
        return start_thumb_drag(id, event.position, scrollbar, window);
    }
    let is_left = event.button == MouseButton::Left;
    if is_left {
        crate::selection::clear();
        state::take_selection_ownership(id);
    }
    state::with_existing(id, |list| {
        let position = list.sel_pos_at(event.position);
        let target = list.hit_target(event.position);
        let seq = list.row_at(f32::from(event.position.y)).map(|row| row.seq);
        if is_left {
            let selection = match (event.click_count, position) {
                (2, Some(position)) => word_selection(list, position, event.position),
                (count, Some(position)) if count >= 3 => message_selection(list, position.seq),
                (_, Some(position)) => Some(Selection {
                    anchor: position,
                    focus: position,
                }),
                (_, None) => None,
            };
            if selection.is_some_and(|selection| !selection.is_empty()) {
                state::mark_selection_changed();
            }
            list.selection = selection;
        }
        if !is_left {
            events::emit_press(id, list, event.button, event.position, target.as_ref(), seq);
            return true;
        }
        list.gesture = Some(Gesture::Press {
            button: event.button,
            origin: event.position,
            start: position,
            target,
            seq,
        });
        if list.hovered.take().is_some() {
            events::emit_hover(id, list, None);
        }
        true
    })
    .unwrap_or(false)
}

fn word_selection(list: &ListState, position: SelPos, point: Point<Pixels>) -> Option<Selection> {
    let viewport = list.viewport?;
    let row = list.rows.iter().find(|row| row.seq == position.seq)?;
    let x = f32::from(point.x - viewport.origin.x);
    let y = f32::from(point.y) - row.top;
    let (start, end) = row.layout.word_units_at(x, y)?;
    Some(Selection {
        anchor: SelPos {
            seq: position.seq,
            unit: start,
        },
        focus: SelPos {
            seq: position.seq,
            unit: end,
        },
    })
}

fn message_selection(list: &ListState, seq: i64) -> Option<Selection> {
    let row = list.rows.iter().find(|row| row.seq == seq)?;
    Some(Selection {
        anchor: SelPos {
            seq,
            unit: row.layout.body_start,
        },
        focus: SelPos {
            seq,
            unit: row.layout.sel_units,
        },
    })
}

fn start_thumb_drag(
    id: u64,
    position: Point<Pixels>,
    scrollbar: ScrollbarGeometry,
    window: &Window,
) -> bool {
    let Some(thumb) = scrollbar.thumb else {
        return false;
    };
    let on_thumb = position.y >= thumb.top() && position.y < thumb.bottom();
    let grab = if on_thumb {
        f32::from(position.y - thumb.top())
    } else {
        f32::from(thumb.size.height) / 2.0
    };
    state::with_existing(id, |list| {
        list.gesture = Some(Gesture::Thumb { grab });
        if !on_thumb {
            move_thumb(list, f32::from(position.y) - grab, window);
        }
    });
    true
}

fn move_thumb(list: &mut ListState, thumb_top: f32, window: &Window) {
    let Some(position) = list.position_for_thumb_top(thumb_top) else {
        return;
    };
    let Some(style) = list.style.clone() else {
        return;
    };
    let text_system = window.text_system().clone();
    let shaper = Shaper {
        text_system: &text_system,
        style: &style,
    };
    list.scroll_to_position(position, &shaper);
}

fn handle_mouse_move(id: u64, event: &MouseMoveEvent, inside: bool, window: &Window) -> bool {
    state::with_existing(id, |list| {
        let mut changed = false;
        let was_inside = list.pointer_inside;
        list.pointer_inside = inside;
        let on_scrollbar = inside
            && list
                .scrollbar
                .track
                .is_some_and(|track| track.contains(&event.position));
        if on_scrollbar != list.pointer_on_scrollbar {
            list.pointer_on_scrollbar = on_scrollbar;
            changed = true;
        }
        if list.options.pause_on_hover {
            let pause = inside && !list.resume_override;
            if !inside {
                list.resume_override = false;
            }
            if pause != list.hover_paused {
                list.hover_paused = pause;
                changed = true;
            }
        }
        match list.gesture.clone() {
            Some(Gesture::Thumb { grab }) => {
                move_thumb(list, f32::from(event.position.y) - grab, window);
                return true;
            }
            Some(Gesture::Press {
                button: MouseButton::Left,
                origin,
                start: Some(_),
                ..
            }) if event.pressed_button == Some(MouseButton::Left) => {
                if distance(origin, event.position) > CLICK_SLOP {
                    list.gesture = Some(Gesture::Selecting);
                }
                return extend_selection(list, event.position) || changed;
            }
            Some(Gesture::Selecting) if event.pressed_button == Some(MouseButton::Left) => {
                return extend_selection(list, event.position) || changed;
            }
            Some(_) => return changed,
            None => {}
        }
        let next = if inside {
            list.hit_target(event.position)
        } else {
            None
        };
        let hover_changed = match (&list.hovered, &next) {
            (Some(previous), Some(next)) => {
                !previous.same_element(next) || previous.bounds != next.bounds
            }
            (None, None) => false,
            _ => true,
        };
        if hover_changed {
            events::emit_hover(id, list, next.as_ref());
            list.hovered = next;
            changed = true;
        }
        changed || was_inside != inside
    })
    .unwrap_or(false)
}

fn extend_selection(list: &mut ListState, position: Point<Pixels>) -> bool {
    let Some(focus) = list.sel_pos_at(position) else {
        return false;
    };
    let Some(selection) = list.selection.as_mut() else {
        return false;
    };
    if selection.focus == focus {
        return false;
    }
    selection.focus = focus;
    if !selection.is_empty() {
        state::mark_selection_changed();
    }
    true
}

fn distance(a: Point<Pixels>, b: Point<Pixels>) -> f32 {
    let dx = f32::from(a.x - b.x);
    let dy = f32::from(a.y - b.y);
    dx.hypot(dy)
}

fn handle_mouse_up(id: u64, event: &MouseUpEvent) -> bool {
    state::with_existing(id, |list| {
        let gesture = list.gesture.take();
        match gesture {
            Some(Gesture::Press {
                button,
                origin,
                target,
                seq,
                ..
            }) if button == event.button => {
                if list.selection.is_some_and(|selection| selection.is_empty()) {
                    list.selection = None;
                }
                if distance(origin, event.position) <= CLICK_SLOP {
                    events::emit_press(id, list, button, event.position, target.as_ref(), seq);
                }
                true
            }
            Some(Gesture::Press { .. }) => {
                list.gesture = gesture;
                false
            }
            Some(Gesture::Selecting) => {
                if list.selection.is_some_and(|selection| selection.is_empty()) {
                    list.selection = None;
                }
                true
            }
            Some(Gesture::Thumb { .. }) => true,
            None => false,
        }
    })
    .unwrap_or(false)
}

fn handle_pointer_left(id: u64) -> bool {
    state::with_existing(id, |list| {
        let mut changed = list.pointer_inside;
        list.pointer_inside = false;
        list.pointer_on_scrollbar = false;
        list.resume_override = false;
        if list.hover_paused {
            list.hover_paused = false;
            changed = true;
        }
        if list.hovered.take().is_some() {
            events::emit_hover(id, list, None);
            changed = true;
        }
        changed
    })
    .unwrap_or(false)
}

impl IntoElement for ReactChatListElement {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}
