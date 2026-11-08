use std::ops::Range;
use std::sync::Arc;

use gpui::{
    Font, FontFeatures, FontStyle, FontWeight, Hsla, LineLayout, SharedString, TextRun,
    WindowTextSystem, px,
};

use super::model::{ChatElement, ChatMessage, ImageElement, Word, split_words};

pub const MARGIN_LEFT: f32 = 8.0;
pub const MARGIN_RIGHT: f32 = 8.0;
pub const MARGIN_TOP: f32 = 4.0;
pub const MARGIN_BOTTOM: f32 = 4.0;
pub const COMPACT_EMOTE_OFFSET: f32 = 4.0;
pub const REPLY_FONT_SCALE: f32 = 0.8;
pub const REPLY_CURVE_WIDTH: f32 = 18.0;
const ELLIPSIS: &str = "…";

#[derive(Clone, Debug, PartialEq)]
pub struct LayoutStyle {
    pub font_family: SharedString,
    pub font_size: f32,
    pub emote_scale: f32,
    pub show_timestamps: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LayoutKey {
    pub width: u32,
    pub style_rev: u64,
    pub revision: u64,
}

impl LayoutKey {
    pub fn new(width: f32, style_rev: u64, revision: u64) -> Self {
        Self {
            width: (width.max(0.0) * 2.0).round() as u32,
            style_rev,
            revision,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Part {
    Reply,
    Timestamp,
    Body,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ColorRole {
    Text,
    Muted,
    Link,
    Custom(Hsla),
}

pub struct GlyphsItem {
    pub layout: Arc<LineLayout>,
    pub baseline: f32,
    pub color: ColorRole,
    pub text: SharedString,
}

pub struct ImageItem {
    pub url: SharedString,
    pub name: SharedString,
    pub background: Option<Hsla>,
}

pub enum ItemKind {
    Glyphs(GlyphsItem),
    Image(ImageItem),
    ReplyCurve,
}

pub struct Item {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub kind: ItemKind,
    pub part: Part,
    pub element: u16,
    pub sel_start: u32,
    pub sel_len: u32,
    pub space_width: f32,
    pub line: u32,
    pub layer: bool,
}

impl Item {
    pub fn right(&self) -> f32 {
        self.x + self.width
    }

    pub fn bottom(&self) -> f32 {
        self.y + self.height
    }

    pub fn is_selectable(&self) -> bool {
        self.sel_len > 0
    }

    pub fn byte_offset_for_unit(&self, unit: u32) -> usize {
        let local = unit.saturating_sub(self.sel_start).min(self.sel_len) as usize;
        match &self.kind {
            ItemKind::Glyphs(glyphs) => glyphs
                .text
                .char_indices()
                .nth(local)
                .map_or(glyphs.text.len(), |(offset, _)| offset),
            ItemKind::Image(_) | ItemKind::ReplyCurve => local,
        }
    }

    pub fn x_for_unit(&self, unit: u32) -> f32 {
        let local = unit.saturating_sub(self.sel_start);
        match &self.kind {
            ItemKind::Glyphs(glyphs) => {
                if local >= self.sel_len {
                    return self.right();
                }
                let offset = self.byte_offset_for_unit(unit);
                self.x + f32::from(glyphs.layout.x_for_index(offset))
            }
            ItemKind::Image(_) | ItemKind::ReplyCurve => {
                if local == 0 {
                    self.x
                } else {
                    self.right()
                }
            }
        }
    }

    pub fn unit_for_x(&self, x: f32) -> u32 {
        match &self.kind {
            ItemKind::Glyphs(glyphs) => {
                let index = glyphs.layout.closest_index_for_x(px(x - self.x));
                let index = index.min(glyphs.text.len());
                let chars = glyphs.text[..index].chars().count() as u32;
                self.sel_start + chars.min(self.sel_len)
            }
            ItemKind::Image(_) | ItemKind::ReplyCurve => {
                let past_middle = x >= self.x + self.width / 2.0;
                self.sel_start + u32::from(past_middle).min(self.sel_len)
            }
        }
    }
}

pub struct Line {
    pub top: f32,
    pub bottom: f32,
    pub items: Range<usize>,
}

pub struct MessageLayout {
    pub key: LayoutKey,
    pub height: f32,
    pub items: Vec<Item>,
    pub lines: Vec<Line>,
    pub sel_units: u32,
    pub body_start: u32,
    pub has_layers: bool,
}

impl MessageLayout {
    pub fn line_at(&self, y: f32) -> Option<&Line> {
        if self.lines.is_empty() {
            return None;
        }
        let index = self.lines.partition_point(|line| line.bottom <= y);
        Some(&self.lines[index.min(self.lines.len() - 1)])
    }

    pub fn item_at(&self, x: f32, y: f32) -> Option<usize> {
        let line = self.line_at(y)?;
        if y < line.top || y >= line.bottom {
            return None;
        }
        let mut found = None;
        for index in line.items.clone() {
            let item = &self.items[index];
            let inside_x = x >= item.x && x < item.right();
            let inside_y = y >= item.y.min(line.top) && y < item.bottom().max(line.bottom);
            if inside_x && inside_y && !matches!(item.kind, ItemKind::ReplyCurve) {
                found = Some(index);
            }
        }
        found
    }

    pub fn unit_at(&self, x: f32, y: f32) -> u32 {
        if y < 0.0 {
            return 0;
        }
        if y >= self.height {
            return self.sel_units;
        }
        let Some(line) = self.line_at(y) else {
            return 0;
        };
        let mut result = None;
        let mut last_end = None;
        for index in line.items.clone() {
            let item = &self.items[index];
            if item.layer || !item.is_selectable() {
                continue;
            }
            if result.is_none() && x < item.x {
                result = Some(item.sel_start);
            } else if result.is_none() && x < item.right() {
                result = Some(item.unit_for_x(x));
            }
            last_end = Some(item.sel_start + item.sel_len);
        }
        result.or(last_end).unwrap_or(0)
    }

    pub fn word_units_at(&self, x: f32, y: f32) -> Option<(u32, u32)> {
        let index = self.item_at(x, y)?;
        let item = &self.items[index];
        item.is_selectable()
            .then_some((item.sel_start, item.sel_start + item.sel_len))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FontMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub space_width: f32,
}

impl FontMetrics {
    pub fn text_height(&self) -> f32 {
        (self.ascent + self.descent).ceil()
    }
}

pub struct Shaper<'a> {
    pub text_system: &'a WindowTextSystem,
    pub style: &'a LayoutStyle,
}

impl Shaper<'_> {
    pub fn font(&self, bold: bool, italic: bool) -> Font {
        let mut font = gpui::font(self.style.font_family.clone());
        if bold {
            font.weight = FontWeight::BOLD;
        }
        if italic {
            font.style = FontStyle::Italic;
        }
        font
    }

    pub fn metrics(&self, font: &Font, size: f32) -> FontMetrics {
        let font_id = self.text_system.resolve_font(font);
        let ascent = f32::from(self.text_system.ascent(font_id, px(size)));
        let descent = f32::from(self.text_system.descent(font_id, px(size))).abs();
        let space = self.shape(" ", font, size);
        FontMetrics {
            ascent,
            descent,
            space_width: f32::from(space.width).max(1.0),
        }
    }

    pub fn shape(&self, text: &str, font: &Font, size: f32) -> Arc<LineLayout> {
        let run = TextRun {
            len: text.len(),
            font: font.clone(),
            color: gpui::black(),
            background_color: None,
            background_radius: None,
            underline: None,
            strikethrough: None,
        };
        self.text_system.layout_line(text, px(size), &[run], None)
    }
}

struct TextSpec {
    font: Font,
    size: f32,
    metrics: FontMetrics,
    color: ColorRole,
}

impl TextSpec {
    fn height(&self) -> f32 {
        self.metrics.text_height()
    }
}

struct Placed {
    width: f32,
    height: f32,
    line_height: f32,
    y_extra: f32,
    kind: ItemKind,
    part: Part,
    element: u16,
    sel_start: u32,
    sel_len: u32,
    space_width: f32,
    ascent: Option<f32>,
}

struct Pending {
    y_extra: f32,
    ascent: Option<f32>,
}

struct LayerBox {
    first: usize,
    x: f32,
    width: f32,
    space_width: f32,
}

struct Flow {
    left: f32,
    right: f32,
    x: f32,
    top: f32,
    line_start: usize,
    line_height: f32,
    min_line_height: f32,
    single_line: bool,
    truncated: bool,
    items: Vec<Item>,
    pending: Vec<Pending>,
    lines: Vec<Line>,
    units: u32,
    layer_box: Option<LayerBox>,
}

impl Flow {
    fn new(left: f32, right: f32, top: f32, min_line_height: f32) -> Self {
        Self {
            left,
            right,
            x: left,
            top,
            line_start: 0,
            line_height: 0.0,
            min_line_height,
            single_line: false,
            truncated: false,
            items: Vec::new(),
            pending: Vec::new(),
            lines: Vec::new(),
            units: 0,
            layer_box: None,
        }
    }

    fn line_is_empty(&self) -> bool {
        self.items.len() == self.line_start
    }

    fn remaining(&self) -> f32 {
        (self.right - self.x).max(0.0)
    }

    fn fits(&self, width: f32) -> bool {
        self.x + width <= self.right + 0.5
    }

    fn push(&mut self, placed: Placed, x: f32) {
        self.line_height = self.line_height.max(placed.line_height);
        self.x = x + placed.width + placed.space_width;
        self.pending.push(Pending {
            y_extra: placed.y_extra,
            ascent: placed.ascent,
        });
        self.items.push(Item {
            x,
            y: 0.0,
            width: placed.width,
            height: placed.height,
            kind: placed.kind,
            part: placed.part,
            element: placed.element,
            sel_start: placed.sel_start,
            sel_len: placed.sel_len,
            space_width: placed.space_width,
            line: self.lines.len() as u32,
            layer: false,
        });
    }

    fn place(&mut self, placed: Placed) {
        self.layer_box = None;
        if !self.line_is_empty() && !self.fits(placed.width) {
            self.break_line();
        }
        let x = self.x;
        self.push(placed, x);
    }

    fn place_image(&mut self, placed: Placed, zero_width: bool) {
        if zero_width && let Some(layer_box) = self.layer_box.take() {
            self.place_layer(placed, layer_box);
            return;
        }
        let space_width = placed.space_width;
        self.place(placed);
        let index = self.items.len() - 1;
        let item = &self.items[index];
        self.layer_box = Some(LayerBox {
            first: index,
            x: item.x,
            width: item.width,
            space_width,
        });
    }

    fn place_layer(&mut self, placed: Placed, mut layer_box: LayerBox) {
        let width = layer_box.width.max(placed.width);
        self.line_height = self.line_height.max(placed.line_height);
        self.pending.push(Pending {
            y_extra: placed.y_extra,
            ascent: None,
        });
        self.items.push(Item {
            x: layer_box.x,
            y: 0.0,
            width: placed.width,
            height: placed.height,
            kind: placed.kind,
            part: placed.part,
            element: placed.element,
            sel_start: placed.sel_start,
            sel_len: placed.sel_len,
            space_width: 0.0,
            line: self.lines.len() as u32,
            layer: true,
        });
        layer_box.width = width;
        for index in layer_box.first..self.items.len() {
            let item = &mut self.items[index];
            item.x = layer_box.x + (width - item.width) / 2.0;
        }
        self.x = layer_box.x + width + layer_box.space_width;
        self.layer_box = Some(layer_box);
    }

    fn break_line(&mut self) {
        let line_height = self.line_height.max(self.min_line_height).ceil();
        let bottom = self.top + line_height;
        for index in self.line_start..self.items.len() {
            let pending = &self.pending[index];
            let item = &mut self.items[index];
            item.y = bottom - item.height + pending.y_extra;
            if let ItemKind::Glyphs(glyphs) = &mut item.kind {
                glyphs.baseline = item.y + pending.ascent.unwrap_or(0.0);
            }
        }
        self.lines.push(Line {
            top: self.top,
            bottom,
            items: self.line_start..self.items.len(),
        });
        self.top = bottom;
        self.x = self.left;
        self.line_start = self.items.len();
        self.line_height = 0.0;
        self.layer_box = None;
    }

    fn finish(mut self) -> (Vec<Item>, Vec<Line>, f32, u32) {
        if !self.line_is_empty() {
            self.break_line();
        }
        (self.items, self.lines, self.top, self.units)
    }
}

pub fn layout_message(
    message: &ChatMessage,
    width: f32,
    key: LayoutKey,
    shaper: &Shaper,
    base_metrics: &FontMetrics,
) -> MessageLayout {
    if message.hidden {
        return MessageLayout {
            key,
            height: 0.0,
            items: Vec::new(),
            lines: Vec::new(),
            sel_units: 0,
            body_start: 0,
            has_layers: false,
        };
    }
    let left = MARGIN_LEFT;
    let right = (width - MARGIN_RIGHT).max(left + 1.0);
    let mut flow = Flow::new(left, right, MARGIN_TOP, base_metrics.text_height());

    if let Some(reply) = message.reply.as_deref() {
        layout_reply(&mut flow, reply, shaper);
    }

    if shaper.style.show_timestamps
        && let Some(timestamp) = message.timestamp.as_ref()
    {
        let mut font = shaper.font(false, false);
        font.features = FontFeatures(Arc::new(vec![("tnum".into(), 1)]));
        let spec = TextSpec {
            font,
            size: shaper.style.font_size,
            metrics: *base_metrics,
            color: ColorRole::Muted,
        };
        let words = split_words(timestamp, true);
        place_words(&mut flow, &words, Part::Timestamp, 0, &spec, shaper);
    }

    let body_start = flow.units;
    for (index, element) in message.elements.iter().enumerate() {
        place_element(
            &mut flow,
            element,
            Part::Body,
            index as u16,
            None,
            shaper,
            base_metrics,
        );
    }

    let (items, lines, bottom, sel_units) = flow.finish();
    let content_bottom = if lines.is_empty() {
        MARGIN_TOP + base_metrics.text_height()
    } else {
        bottom
    };
    let body_start = body_start_after_author(message, body_start, sel_units);
    let has_layers = items.iter().any(|item| item.layer);
    MessageLayout {
        key,
        height: (content_bottom + MARGIN_BOTTOM).ceil(),
        items,
        lines,
        sel_units,
        body_start,
        has_layers,
    }
}

fn body_start_after_author(message: &ChatMessage, body_units_start: u32, total: u32) -> u32 {
    let mut cursor = body_units_start;
    let mut after_author = None;
    for element in message.elements.iter() {
        cursor += element_units(element);
        let is_header = matches!(element, ChatElement::User(_) | ChatElement::Badge(_));
        if is_header {
            after_author = Some(cursor);
        }
        if matches!(element, ChatElement::User(_)) {
            break;
        }
    }
    after_author.unwrap_or(body_units_start).min(total)
}

pub fn element_units(element: &ChatElement) -> u32 {
    match element {
        ChatElement::Text(text) => words_units(&text.words),
        ChatElement::User(user) => words_units(&user.words),
        ChatElement::Emote(_) | ChatElement::Badge(_) => 1,
    }
}

fn words_units(words: &[Word]) -> u32 {
    words
        .iter()
        .map(|word| word.text.chars().count() as u32)
        .sum()
}

fn layout_reply(flow: &mut Flow, reply: &[ChatElement], shaper: &Shaper) {
    let size = (shaper.style.font_size * REPLY_FONT_SCALE).round().max(4.0);
    let font = shaper.font(false, false);
    let metrics = shaper.metrics(&font, size);
    let base_min = flow.min_line_height;
    flow.min_line_height = metrics.text_height();
    flow.single_line = true;
    flow.truncated = false;
    let spec = TextSpec {
        font,
        size,
        metrics,
        color: ColorRole::Muted,
    };
    let curve_height = metrics.text_height();
    let x = flow.x;
    flow.push(
        Placed {
            width: REPLY_CURVE_WIDTH,
            height: curve_height,
            line_height: curve_height,
            y_extra: 0.0,
            kind: ItemKind::ReplyCurve,
            part: Part::Reply,
            element: u16::MAX,
            sel_start: 0,
            sel_len: 0,
            space_width: 0.0,
            ascent: None,
        },
        x,
    );
    for (index, element) in reply.iter().enumerate() {
        place_element(
            flow,
            element,
            Part::Reply,
            index as u16,
            Some(&spec),
            shaper,
            &metrics,
        );
    }
    if !flow.line_is_empty() {
        flow.break_line();
    }
    flow.single_line = false;
    flow.truncated = false;
    flow.min_line_height = base_min;
}

fn place_element(
    flow: &mut Flow,
    element: &ChatElement,
    part: Part,
    index: u16,
    reply_spec: Option<&TextSpec>,
    shaper: &Shaper,
    metrics: &FontMetrics,
) {
    match element {
        ChatElement::Text(text) => {
            let default_role = if reply_spec.is_some() {
                ColorRole::Muted
            } else {
                ColorRole::Text
            };
            let color = match (text.link.is_some(), text.color) {
                (true, _) => ColorRole::Link,
                (false, Some(color)) => ColorRole::Custom(color),
                (false, None) => default_role,
            };
            let spec = text_spec(reply_spec, text.bold, text.italic, color, shaper, metrics);
            place_words(flow, &text.words, part, index, &spec, shaper);
        }
        ChatElement::User(user) => {
            let color = user.color.map_or(ColorRole::Text, ColorRole::Custom);
            let spec = text_spec(reply_spec, user.bold, false, color, shaper, metrics);
            place_words(flow, &user.words, part, index, &spec, shaper);
        }
        ChatElement::Emote(image) => {
            let scale = shaper.style.emote_scale * reply_image_scale(reply_spec, shaper);
            place_image(flow, image, part, index, scale, true, metrics);
        }
        ChatElement::Badge(image) => {
            let scale = reply_image_scale(reply_spec, shaper);
            place_image(flow, image, part, index, scale, false, metrics);
        }
    }
}

fn reply_image_scale(reply_spec: Option<&TextSpec>, shaper: &Shaper) -> f32 {
    reply_spec.map_or(1.0, |spec| spec.size / shaper.style.font_size.max(1.0))
}

fn text_spec(
    reply_spec: Option<&TextSpec>,
    bold: bool,
    italic: bool,
    color: ColorRole,
    shaper: &Shaper,
    metrics: &FontMetrics,
) -> TextSpec {
    match reply_spec {
        Some(spec) => {
            let mut font = spec.font.clone();
            if bold {
                font.weight = FontWeight::BOLD;
            }
            if italic {
                font.style = FontStyle::Italic;
            }
            TextSpec {
                font,
                size: spec.size,
                metrics: spec.metrics,
                color,
            }
        }
        None => TextSpec {
            font: shaper.font(bold, italic),
            size: shaper.style.font_size,
            metrics: *metrics,
            color,
        },
    }
}

fn glyphs_placed(
    layout: Arc<LineLayout>,
    text: SharedString,
    spec: &TextSpec,
    part: Part,
    element: u16,
    sel_start: u32,
    space_width: f32,
) -> Placed {
    let height = spec.height();
    let sel_len = text.chars().count() as u32;
    Placed {
        width: f32::from(layout.width),
        height,
        line_height: height,
        y_extra: 0.0,
        kind: ItemKind::Glyphs(GlyphsItem {
            layout,
            baseline: 0.0,
            color: spec.color,
            text,
        }),
        part,
        element,
        sel_start,
        sel_len,
        space_width,
        ascent: Some(spec.metrics.ascent),
    }
}

fn place_words(
    flow: &mut Flow,
    words: &[Word],
    part: Part,
    element: u16,
    spec: &TextSpec,
    shaper: &Shaper,
) {
    for word in words {
        let sel_start = flow.units;
        flow.units += word.text.chars().count() as u32;
        if flow.truncated {
            continue;
        }
        let layout = shaper.shape(&word.text, &spec.font, spec.size);
        let width = f32::from(layout.width);
        let space_width = if word.space_after {
            spec.metrics.space_width
        } else {
            0.0
        };
        if flow.single_line {
            place_truncating(
                flow,
                word,
                layout,
                part,
                element,
                spec,
                shaper,
                sel_start,
                space_width,
            );
            continue;
        }
        let line_width = flow.right - flow.left;
        if width > line_width {
            place_broken_word(
                flow,
                word,
                part,
                element,
                spec,
                shaper,
                sel_start,
                space_width,
            );
            continue;
        }
        let placed = glyphs_placed(
            layout,
            word.text.clone(),
            spec,
            part,
            element,
            sel_start,
            space_width,
        );
        flow.place(placed);
    }
}

#[allow(clippy::too_many_arguments)]
fn place_truncating(
    flow: &mut Flow,
    word: &Word,
    layout: Arc<LineLayout>,
    part: Part,
    element: u16,
    spec: &TextSpec,
    shaper: &Shaper,
    sel_start: u32,
    space_width: f32,
) {
    let width = f32::from(layout.width);
    if flow.fits(width) {
        let placed = glyphs_placed(
            layout,
            word.text.clone(),
            spec,
            part,
            element,
            sel_start,
            space_width,
        );
        let x = flow.x;
        flow.layer_box = None;
        flow.push(placed, x);
        return;
    }
    flow.truncated = true;
    let ellipsis = shaper.shape(ELLIPSIS, &spec.font, spec.size);
    let available = flow.remaining() - f32::from(ellipsis.width);
    let split = split_index(&word.text, &layout, available);
    let mut kept = word.text[..split].to_string();
    kept.push_str(ELLIPSIS);
    let shaped = shaper.shape(&kept, &spec.font, spec.size);
    let mut placed = glyphs_placed(
        shaped,
        SharedString::from(kept),
        spec,
        part,
        element,
        sel_start,
        0.0,
    );
    placed.sel_len = word.text[..split].chars().count() as u32;
    let x = flow.x;
    flow.layer_box = None;
    flow.push(placed, x);
}

#[allow(clippy::too_many_arguments)]
fn place_broken_word(
    flow: &mut Flow,
    word: &Word,
    part: Part,
    element: u16,
    spec: &TextSpec,
    shaper: &Shaper,
    sel_start: u32,
    space_width: f32,
) {
    let mut rest: &str = &word.text;
    let mut unit = sel_start;
    flow.layer_box = None;
    while !rest.is_empty() {
        let layout = shaper.shape(rest, &spec.font, spec.size);
        let available = flow.remaining();
        let fits_whole = f32::from(layout.width) <= available + 0.5;
        let mut split = if fits_whole {
            rest.len()
        } else {
            split_index(rest, &layout, available)
        };
        if split == 0 {
            if !flow.line_is_empty() {
                flow.break_line();
                continue;
            }
            split = rest.chars().next().map_or(rest.len(), char::len_utf8);
        }
        let (chunk, remainder) = rest.split_at(split);
        let is_last = remainder.is_empty();
        let chunk_space = if is_last { space_width } else { 0.0 };
        let shaped = shaper.shape(chunk, &spec.font, spec.size);
        let placed = glyphs_placed(
            shaped,
            SharedString::from(chunk.to_string()),
            spec,
            part,
            element,
            unit,
            chunk_space,
        );
        unit += placed.sel_len;
        let x = flow.x;
        flow.push(placed, x);
        rest = remainder;
        if !is_last {
            flow.break_line();
        }
    }
}

fn split_index(text: &str, layout: &LineLayout, available: f32) -> usize {
    let mut split = 0;
    for (offset, character) in text.char_indices() {
        let end = offset + character.len_utf8();
        let end_x = if end >= text.len() {
            f32::from(layout.width)
        } else {
            f32::from(layout.x_for_index(end))
        };
        if end_x > available + 0.5 {
            break;
        }
        split = end;
    }
    split
}

fn place_image(
    flow: &mut Flow,
    image: &ImageElement,
    part: Part,
    element: u16,
    scale: f32,
    compact: bool,
    metrics: &FontMetrics,
) {
    let sel_start = flow.units;
    flow.units += 1;
    if flow.truncated {
        return;
    }
    let width = (image.width * scale).max(1.0);
    let height = (image.height * scale).max(1.0);
    let offset = if compact { COMPACT_EMOTE_OFFSET } else { 0.0 };
    let space_width = if image.space_after {
        metrics.space_width
    } else {
        0.0
    };
    let placed = Placed {
        width,
        height,
        line_height: (height - offset).max(1.0),
        y_extra: offset / 2.0,
        kind: ItemKind::Image(ImageItem {
            url: image.url.clone(),
            name: image.name.clone(),
            background: image.background,
        }),
        part,
        element,
        sel_start,
        sel_len: 1,
        space_width,
        ascent: None,
    };
    if flow.single_line && !flow.fits(width) {
        flow.truncated = true;
        return;
    }
    flow.place_image(placed, image.zero_width);
}
