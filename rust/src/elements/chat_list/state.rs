use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::Arc;

use gpui::{Bounds, Hsla, MouseButton, Pixels, Point, SharedString};

use super::layout::{
    FontMetrics, LayoutKey, LayoutStyle, MessageLayout, Part, Shaper, layout_message,
};
use super::model::{
    ChatElement, ChatListOp, ChatListOptions, ChatMessage, RevealAlign, Word, split_words,
};

pub const SCROLLBAR_WIDTH: f32 = 16.0;
const THUMB_TRACK_INSET: f32 = 11.0;
const THUMB_MIN_HEIGHT: f32 = 10.0;
const THUMB_TOP_INSET: f32 = 1.0;
const LAYOUT_BUDGET: usize = 600;

pub struct Entry {
    pub seq: i64,
    pub message: ChatMessage,
    pub revision: u64,
    pub layout: Option<Arc<MessageLayout>>,
    pub used_frame: u64,
}

#[derive(Clone)]
pub struct Row {
    pub seq: i64,
    pub top: f32,
    pub layout: Arc<MessageLayout>,
}

impl Row {
    pub fn bottom(&self) -> f32 {
        self.top + self.layout.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Anchor {
    pub seq: i64,
    pub offset: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct SelPos {
    pub seq: i64,
    pub unit: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Selection {
    pub anchor: SelPos,
    pub focus: SelPos,
}

impl Selection {
    pub fn ordered(&self) -> (SelPos, SelPos) {
        if self.anchor <= self.focus {
            (self.anchor, self.focus)
        } else {
            (self.focus, self.anchor)
        }
    }

    pub fn is_empty(&self) -> bool {
        self.anchor == self.focus
    }

    pub fn units_for(&self, seq: i64) -> Option<(u32, u32)> {
        let (start, end) = self.ordered();
        if seq < start.seq || seq > end.seq || self.is_empty() {
            return None;
        }
        let from = if seq == start.seq { start.unit } else { 0 };
        let to = if seq == end.seq { end.unit } else { u32::MAX };
        (from < to).then_some((from, to))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetKind {
    User,
    Link,
    Emote,
    Badge,
}

impl TargetKind {
    pub fn label(self) -> &'static str {
        match self {
            TargetKind::User => "user",
            TargetKind::Link => "link",
            TargetKind::Emote => "emote",
            TargetKind::Badge => "badge",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct HitTarget {
    pub kind: TargetKind,
    pub seq: i64,
    pub part: Part,
    pub element: u16,
    pub item: usize,
    pub bounds: Bounds<Pixels>,
}

impl HitTarget {
    pub fn same_element(&self, other: &HitTarget) -> bool {
        self.seq == other.seq && self.part == other.part && self.element == other.element
    }
}

#[derive(Clone, Debug)]
pub enum Gesture {
    Press {
        button: MouseButton,
        origin: Point<Pixels>,
        start: Option<SelPos>,
        target: Option<HitTarget>,
        seq: Option<i64>,
    },
    Selecting,
    Thumb {
        grab: f32,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScrollSnapshot {
    pub at_bottom: bool,
    pub paused: bool,
    pub unseen: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ScrollbarGeometry {
    pub track: Option<Bounds<Pixels>>,
    pub thumb: Option<Bounds<Pixels>>,
    pub total: f32,
    pub span: f32,
    pub position: f32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub layouts_built: u64,
    pub frames: u64,
    pub painted_items: usize,
    pub painted_images: usize,
    pub animated_visible: usize,
}

pub struct ListState {
    pub entries: VecDeque<Entry>,
    ids: HashMap<SharedString, i64>,
    next_seq: i64,
    revision_counter: u64,
    pub options: ChatListOptions,
    pub style: Option<LayoutStyle>,
    pub style_rev: u64,
    pub metrics: Option<FontMetrics>,
    pub follow: bool,
    pub anchor: Option<Anchor>,
    pub hover_paused: bool,
    pub resume_override: bool,
    pub unseen: usize,
    pub selection: Option<Selection>,
    pub gesture: Option<Gesture>,
    pub hovered: Option<HitTarget>,
    pub pointer_inside: bool,
    pub pointer_on_scrollbar: bool,
    pub rows: Vec<Row>,
    pub viewport: Option<Bounds<Pixels>>,
    pub content_width: f32,
    pub markers: BTreeMap<i64, Hsla>,
    pub scrollbar: ScrollbarGeometry,
    pub last_scroll_state: Option<ScrollSnapshot>,
    pub layouts_cached: usize,
    pub frame: u64,
    pub stats: Stats,
    pub listens_press: bool,
    pub listens_hover: bool,
    pub pending_scroll: Option<PendingScroll>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PendingScroll {
    Top,
    Message { seq: i64, align: RevealAlign },
    Page(f32),
}

impl Default for ListState {
    fn default() -> Self {
        Self {
            entries: VecDeque::new(),
            ids: HashMap::new(),
            next_seq: 0,
            revision_counter: 0,
            options: ChatListOptions::default(),
            style: None,
            style_rev: 0,
            metrics: None,
            follow: true,
            anchor: None,
            hover_paused: false,
            resume_override: false,
            unseen: 0,
            selection: None,
            gesture: None,
            hovered: None,
            pointer_inside: false,
            pointer_on_scrollbar: false,
            rows: Vec::new(),
            viewport: None,
            content_width: 0.0,
            markers: BTreeMap::new(),
            scrollbar: ScrollbarGeometry::default(),
            last_scroll_state: None,
            layouts_cached: 0,
            frame: 0,
            stats: Stats::default(),
            listens_press: false,
            listens_hover: false,
            pending_scroll: None,
        }
    }
}

thread_local! {
    static LISTS: RefCell<HashMap<u64, ListState>> = RefCell::new(HashMap::new());
    static SELECTION_OWNER: RefCell<Option<u64>> = const { RefCell::new(None) };
    static SELECTION_CHANGED_AT: std::cell::Cell<Option<std::time::Instant>> = const { std::cell::Cell::new(None) };
}

pub fn mark_selection_changed() {
    SELECTION_CHANGED_AT.set(Some(std::time::Instant::now()));
}

pub fn selection_changed_at() -> Option<std::time::Instant> {
    SELECTION_CHANGED_AT.get()
}

pub fn with_list<R>(id: u64, f: impl FnOnce(&mut ListState) -> R) -> R {
    LISTS.with_borrow_mut(|lists| f(lists.entry(id).or_default()))
}

pub fn with_existing<R>(id: u64, f: impl FnOnce(&mut ListState) -> R) -> Option<R> {
    LISTS.with_borrow_mut(|lists| lists.get_mut(&id).map(f))
}

pub fn list_ids() -> Vec<u64> {
    LISTS.with_borrow(|lists| lists.keys().copied().collect())
}

pub fn retain(present: &HashSet<u64>) {
    LISTS.with_borrow_mut(|lists| lists.retain(|id, _| present.contains(id)));
    SELECTION_OWNER.with_borrow_mut(|owner| {
        if owner.is_some_and(|id| !present.contains(&id)) {
            *owner = None;
        }
    });
}

pub fn take_selection_ownership(id: u64) {
    let previous = SELECTION_OWNER.with_borrow_mut(|owner| owner.replace(id));
    if let Some(previous) = previous.filter(|previous| *previous != id) {
        with_existing(previous, |list| list.selection = None);
    }
}

pub fn clear_selection() -> bool {
    let owner = SELECTION_OWNER.with_borrow_mut(Option::take);
    owner
        .and_then(|id| with_existing(id, |list| list.selection.take().is_some()))
        .unwrap_or(false)
}

pub fn selected_text() -> Option<String> {
    let owner = SELECTION_OWNER.with_borrow(|owner| *owner)?;
    with_existing(owner, |list| list.copy_text()).flatten()
}

impl ListState {
    pub fn index_of(&self, seq: i64) -> Option<usize> {
        let front = self.entries.front()?.seq;
        let index = seq.checked_sub(front)?;
        let index = usize::try_from(index).ok()?;
        (index < self.entries.len()).then_some(index)
    }

    pub fn entry(&self, seq: i64) -> Option<&Entry> {
        self.index_of(seq).map(|index| &self.entries[index])
    }

    pub fn is_paused(&self) -> bool {
        let selecting = matches!(self.gesture, Some(Gesture::Selecting));
        self.hover_paused || selecting
    }

    pub fn following(&self) -> bool {
        self.follow && !self.is_paused()
    }

    pub fn set_options(&mut self, options: ChatListOptions) {
        if self.options == options {
            return;
        }
        let max_changed = options.max_messages != self.options.max_messages;
        if !options.pause_on_hover {
            self.hover_paused = false;
        }
        self.options = options;
        if max_changed {
            self.trim();
        }
    }

    pub fn set_style(&mut self, style: LayoutStyle, metrics: FontMetrics) {
        if self.style.as_ref() == Some(&style) {
            return;
        }
        self.style = Some(style);
        self.metrics = Some(metrics);
        self.style_rev += 1;
    }

    pub fn apply(&mut self, op: ChatListOp) {
        match op {
            ChatListOp::Append(messages) => self.append(messages),
            ChatListOp::Prepend(messages) => self.prepend(messages),
            ChatListOp::Update(patches) => {
                for patch in patches {
                    if let Some(seq) = self.ids.get(&patch.id).copied()
                        && let Some(index) = self.index_of(seq)
                    {
                        let revision = self.next_revision();
                        let entry = &mut self.entries[index];
                        patch.apply(&mut entry.message);
                        entry.revision = revision;
                        let marker = entry.message.marker;
                        self.set_marker(seq, marker);
                    }
                }
            }
            ChatListOp::Clear => {
                self.entries.clear();
                self.ids.clear();
                self.markers.clear();
                self.selection = None;
                self.hovered = None;
                self.gesture = None;
                self.rows.clear();
                self.anchor = None;
                self.unseen = 0;
                self.follow = true;
                self.layouts_cached = 0;
            }
            ChatListOp::ScrollToBottom => {
                self.follow = true;
                self.hover_paused = false;
                self.resume_override = self.pointer_inside;
                self.unseen = 0;
                self.pending_scroll = None;
            }
            ChatListOp::ScrollToTop => {
                self.pending_scroll = Some(PendingScroll::Top);
            }
            ChatListOp::ScrollToMessage { id, align } => {
                if let Some(seq) = self.ids.get(&id).copied() {
                    self.pending_scroll = Some(PendingScroll::Message { seq, align });
                }
            }
            ChatListOp::Page(direction) => {
                self.pending_scroll = Some(PendingScroll::Page(direction));
            }
        }
    }

    fn resolve_pending_scroll(&mut self, pending: PendingScroll, height: f32, shaper: &Shaper) {
        let width = self.content_width;
        match pending {
            PendingScroll::Top => {
                let Some(first) = self.entries.front() else {
                    return;
                };
                self.anchor = Some(Anchor {
                    seq: first.seq,
                    offset: 0.0,
                });
                self.follow = false;
            }
            PendingScroll::Message { seq, align } => {
                let Some(index) = self.index_of(seq) else {
                    return;
                };
                self.anchor = Some(Anchor { seq, offset: 0.0 });
                self.follow = false;
                let row_height = self.height_at(index, shaper, width);
                let lift = match align {
                    RevealAlign::Top => 0.0,
                    RevealAlign::Center => ((height - row_height) / 2.0).max(0.0),
                    RevealAlign::Bottom => (height - row_height).max(0.0),
                };
                if lift > 0.0 {
                    self.scroll_by(lift, shaper);
                }
                let offset = self.anchor.map_or(0.0, |anchor| anchor.offset);
                let at = self.anchor.and_then(|anchor| self.index_of(anchor.seq));
                if let Some(at) = at {
                    self.follow = self.reaches_bottom(at, offset, height, shaper, width);
                }
            }
            PendingScroll::Page(direction) => {
                self.scroll_by(-direction * height, shaper);
            }
        }
    }

    fn next_revision(&mut self) -> u64 {
        self.revision_counter += 1;
        self.revision_counter
    }

    fn set_marker(&mut self, seq: i64, marker: Option<Hsla>) {
        match marker {
            Some(color) => {
                self.markers.insert(seq, color);
            }
            None => {
                self.markers.remove(&seq);
            }
        }
    }

    fn append(&mut self, messages: Vec<ChatMessage>) {
        let following = self.following();
        for message in messages {
            if let Some(seq) = self.ids.get(&message.id).copied()
                && let Some(index) = self.index_of(seq)
            {
                let revision = self.next_revision();
                let entry = &mut self.entries[index];
                entry.message = message;
                entry.revision = revision;
                let marker = entry.message.marker;
                self.set_marker(seq, marker);
                continue;
            }
            if self.entries.is_empty() {
                self.next_seq = 0;
            }
            let seq = self.next_seq;
            self.next_seq += 1;
            let revision = self.next_revision();
            self.ids.insert(message.id.clone(), seq);
            self.set_marker(seq, message.marker);
            self.entries.push_back(Entry {
                seq,
                message,
                revision,
                layout: None,
                used_frame: 0,
            });
            if !following {
                self.unseen += 1;
            }
        }
        self.trim();
    }

    fn prepend(&mut self, messages: Vec<ChatMessage>) {
        let capacity = self.options.max_messages.saturating_sub(self.entries.len());
        let fresh: Vec<ChatMessage> = messages
            .into_iter()
            .filter(|message| !self.ids.contains_key(&message.id))
            .collect();
        let skip = fresh.len().saturating_sub(capacity);
        for message in fresh.into_iter().skip(skip).rev() {
            let seq = match self.entries.front() {
                Some(front) => front.seq - 1,
                None => {
                    self.next_seq = 1;
                    0
                }
            };
            let revision = self.next_revision();
            self.ids.insert(message.id.clone(), seq);
            self.set_marker(seq, message.marker);
            self.entries.push_front(Entry {
                seq,
                message,
                revision,
                layout: None,
                used_frame: 0,
            });
        }
    }

    fn trim(&mut self) {
        let max = self.options.max_messages.max(1);
        while self.entries.len() > max {
            let Some(entry) = self.entries.pop_front() else {
                break;
            };
            self.ids.remove(&entry.message.id);
            self.markers.remove(&entry.seq);
            if entry.layout.is_some() {
                self.layouts_cached = self.layouts_cached.saturating_sub(1);
            }
            self.rows.retain(|row| row.seq != entry.seq);
            if self
                .hovered
                .as_ref()
                .is_some_and(|hovered| hovered.seq == entry.seq)
            {
                self.hovered = None;
            }
        }
        let Some(front) = self.entries.front().map(|entry| entry.seq) else {
            return;
        };
        if let Some(anchor) = self.anchor.as_mut()
            && anchor.seq < front
        {
            anchor.seq = front;
            anchor.offset = 0.0;
        }
        if let Some(selection) = self.selection.as_mut() {
            let (_, end) = selection.ordered();
            if end.seq < front {
                self.selection = None;
            } else {
                for position in [&mut selection.anchor, &mut selection.focus] {
                    if position.seq < front {
                        *position = SelPos {
                            seq: front,
                            unit: 0,
                        };
                    }
                }
            }
        }
    }

    pub fn layout_at(
        &mut self,
        index: usize,
        shaper: &Shaper,
        width: f32,
    ) -> Option<Arc<MessageLayout>> {
        let metrics = self.metrics?;
        let frame = self.frame;
        let style_rev = self.style_rev;
        let entry = self.entries.get_mut(index)?;
        entry.used_frame = frame;
        let key = LayoutKey::new(width, style_rev, entry.revision);
        if let Some(layout) = entry.layout.as_ref()
            && layout.key == key
        {
            return Some(layout.clone());
        }
        let layout = Arc::new(layout_message(&entry.message, width, key, shaper, &metrics));
        let was_empty = entry.layout.is_none();
        entry.layout = Some(layout.clone());
        if was_empty {
            self.layouts_cached += 1;
        }
        self.stats.layouts_built += 1;
        Some(layout)
    }

    fn height_at(&mut self, index: usize, shaper: &Shaper, width: f32) -> f32 {
        self.layout_at(index, shaper, width)
            .map_or(0.0, |layout| layout.height)
    }

    pub fn compute_rows(&mut self, viewport: Bounds<Pixels>, width: f32, shaper: &Shaper) {
        self.frame += 1;
        self.stats.frames += 1;
        self.viewport = Some(viewport);
        self.content_width = width;
        let height = f32::from(viewport.size.height);
        let top = f32::from(viewport.origin.y);
        if let Some(pending) = self.pending_scroll.take() {
            self.resolve_pending_scroll(pending, height, shaper);
        }
        let mut local = if self.following() || self.anchor.is_none() {
            self.bottom_rows(height, shaper, width)
        } else {
            self.anchored_rows(height, shaper, width)
        };
        let content_ends_early = local.last().is_some_and(|(index, y, layout)| {
            *index + 1 == self.entries.len() && y + layout.height < height - 0.5
        });
        let not_following = !self.following() && self.anchor.is_some();
        if not_following && content_ends_early {
            local = self.bottom_rows(height, shaper, width);
            if !self.is_paused() {
                self.follow = true;
            }
        }
        if self.following() {
            self.unseen = 0;
        }
        self.rows = local
            .into_iter()
            .map(|(index, y, layout)| Row {
                seq: self.entries[index].seq,
                top: top + y,
                layout,
            })
            .collect();
        self.anchor = self
            .rows
            .iter()
            .find(|row| row.bottom() > top)
            .map(|row| Anchor {
                seq: row.seq,
                offset: top - row.top,
            });
        self.evict_layouts();
    }

    fn bottom_rows(
        &mut self,
        height: f32,
        shaper: &Shaper,
        width: f32,
    ) -> Vec<(usize, f32, Arc<MessageLayout>)> {
        let mut rows = Vec::new();
        let mut y = height;
        for index in (0..self.entries.len()).rev() {
            let Some(layout) = self.layout_at(index, shaper, width) else {
                break;
            };
            y -= layout.height;
            rows.push((index, y, layout));
            if y <= 0.0 {
                break;
            }
        }
        rows.reverse();
        if y > 0.0 {
            for row in rows.iter_mut() {
                row.1 -= y;
            }
        }
        rows
    }

    fn anchored_rows(
        &mut self,
        height: f32,
        shaper: &Shaper,
        width: f32,
    ) -> Vec<(usize, f32, Arc<MessageLayout>)> {
        let Some(anchor) = self.anchor else {
            return Vec::new();
        };
        let (start, offset) = match self.index_of(anchor.seq) {
            Some(index) => (index, anchor.offset),
            None => (0, 0.0),
        };
        let mut rows = Vec::new();
        let mut y = -offset;
        let mut index = start;
        while index < self.entries.len() && y < height {
            let Some(layout) = self.layout_at(index, shaper, width) else {
                break;
            };
            let row_height = layout.height;
            rows.push((index, y, layout));
            y += row_height;
            index += 1;
        }
        rows
    }

    pub fn scroll_by(&mut self, delta_y: f32, shaper: &Shaper) -> bool {
        let Some(viewport) = self.viewport else {
            return false;
        };
        let width = self.content_width;
        let Some(anchor) = self.anchor else {
            return false;
        };
        let Some(mut index) = self.index_of(anchor.seq) else {
            return false;
        };
        let mut offset = anchor.offset - delta_y;
        while offset < 0.0 {
            if index == 0 {
                offset = 0.0;
                break;
            }
            index -= 1;
            offset += self.height_at(index, shaper, width);
        }
        loop {
            let row_height = self.height_at(index, shaper, width);
            if offset < row_height || index + 1 >= self.entries.len() {
                break;
            }
            offset -= row_height;
            index += 1;
        }
        let seq = self.entries[index].seq;
        let next = Anchor { seq, offset };
        let moved = self.anchor != Some(next);
        self.anchor = Some(next);
        if delta_y > 0.0 && moved {
            self.follow = false;
        }
        let height = f32::from(viewport.size.height);
        if self.reaches_bottom(index, offset, height, shaper, width) {
            self.follow = true;
        }
        moved
    }

    fn reaches_bottom(
        &mut self,
        index: usize,
        offset: f32,
        height: f32,
        shaper: &Shaper,
        width: f32,
    ) -> bool {
        let mut remaining = -offset;
        for next in index..self.entries.len() {
            remaining += self.height_at(next, shaper, width);
            if remaining > height + 0.5 {
                return false;
            }
        }
        true
    }

    pub fn scroll_to_position(&mut self, position: f32, shaper: &Shaper) {
        if self.entries.is_empty() {
            return;
        }
        let Some(viewport) = self.viewport else {
            return;
        };
        let width = self.content_width;
        let clamped = position.clamp(0.0, self.entries.len() as f32);
        let mut index = (clamped.floor() as usize).min(self.entries.len() - 1);
        let fraction = clamped - index as f32;
        let mut offset = fraction * self.height_at(index, shaper, width);
        if offset >= self.height_at(index, shaper, width) && index + 1 < self.entries.len() {
            index += 1;
            offset = 0.0;
        }
        self.anchor = Some(Anchor {
            seq: self.entries[index].seq,
            offset,
        });
        let height = f32::from(viewport.size.height);
        self.follow = self.reaches_bottom(index, offset, height, shaper, width);
    }

    pub fn update_scrollbar(&mut self, bounds: Bounds<Pixels>) {
        let total = self.entries.len() as f32;
        let Some(viewport) = self.viewport else {
            self.scrollbar = ScrollbarGeometry::default();
            return;
        };
        let top = f32::from(viewport.origin.y);
        let bottom = top + f32::from(viewport.size.height);
        let mut span = 0.0;
        for row in &self.rows {
            let visible_height = (row.bottom().min(bottom) - row.top.max(top)).max(0.0);
            if row.layout.height > 0.0 {
                span += visible_height / row.layout.height;
            }
        }
        let position = self
            .anchor
            .and_then(|anchor| {
                let index = self.index_of(anchor.seq)?;
                let row_height = self
                    .rows
                    .iter()
                    .find(|row| row.seq == anchor.seq)
                    .map_or(1.0, |row| row.layout.height.max(1.0));
                Some(index as f32 + anchor.offset / row_height)
            })
            .unwrap_or(0.0);
        let track = Bounds::new(
            gpui::point(bounds.right() - gpui::px(SCROLLBAR_WIDTH), bounds.top()),
            gpui::size(gpui::px(SCROLLBAR_WIDTH), bounds.size.height),
        );
        let overflowing = total > 0.0 && span < total - 0.001;
        let thumb = overflowing.then(|| {
            let travel = (f32::from(track.size.height) - THUMB_TRACK_INSET).max(0.0);
            let clamped = position.clamp(0.0, (total - span).max(0.0));
            let thumb_height = span / total * travel + THUMB_MIN_HEIGHT;
            let thumb_top = clamped / total * travel + THUMB_TOP_INSET;
            Bounds::new(
                gpui::point(track.left(), track.top() + gpui::px(thumb_top)),
                gpui::size(track.size.width, gpui::px(thumb_height)),
            )
        });
        self.scrollbar = ScrollbarGeometry {
            track: Some(track),
            thumb,
            total,
            span,
            position,
        };
    }

    pub fn position_for_thumb_top(&self, thumb_top: f32) -> Option<f32> {
        let track = self.scrollbar.track?;
        self.scrollbar.thumb?;
        let travel = (f32::from(track.size.height) - THUMB_TRACK_INSET).max(1.0);
        let offset = thumb_top - f32::from(track.top()) - THUMB_TOP_INSET;
        let scrollable = (self.scrollbar.total - self.scrollbar.span).max(0.0);
        Some((offset / travel * self.scrollbar.total).clamp(0.0, scrollable))
    }

    pub fn at_bottom(&self) -> bool {
        let Some(viewport) = self.viewport else {
            return true;
        };
        let Some(last) = self.entries.back() else {
            return true;
        };
        self.rows.last().is_some_and(|row| {
            let bottom = f32::from(viewport.origin.y + viewport.size.height);
            row.seq == last.seq && row.bottom() <= bottom + 1.0
        })
    }

    pub fn scroll_snapshot(&self) -> ScrollSnapshot {
        ScrollSnapshot {
            at_bottom: self.at_bottom(),
            paused: self.is_paused(),
            unseen: self.unseen,
        }
    }

    pub fn row_at(&self, y: f32) -> Option<&Row> {
        self.rows
            .iter()
            .find(|row| y >= row.top && y < row.bottom())
    }

    pub fn sel_pos_at(&self, point: Point<Pixels>) -> Option<SelPos> {
        let viewport = self.viewport?;
        let x = f32::from(point.x - viewport.origin.x);
        let y = f32::from(point.y);
        let first = self.rows.first()?;
        let last = self.rows.last()?;
        if y < first.top {
            return Some(SelPos {
                seq: first.seq,
                unit: 0,
            });
        }
        if y >= last.bottom() {
            return Some(SelPos {
                seq: last.seq,
                unit: last.layout.sel_units,
            });
        }
        let row = self.row_at(y)?;
        Some(SelPos {
            seq: row.seq,
            unit: row.layout.unit_at(x, y - row.top),
        })
    }

    pub fn hit_target(&self, point: Point<Pixels>) -> Option<HitTarget> {
        let viewport = self.viewport?;
        let x = f32::from(point.x - viewport.origin.x);
        let y = f32::from(point.y);
        let row = self.row_at(y)?;
        let item_index = row.layout.item_at(x, y - row.top)?;
        let item = &row.layout.items[item_index];
        let entry = self.entry(row.seq)?;
        let element = element_for(&entry.message, item.part, item.element)?;
        let kind = match element {
            ChatElement::User(_) => TargetKind::User,
            ChatElement::Text(text) if text.link.is_some() => TargetKind::Link,
            ChatElement::Emote(_) => TargetKind::Emote,
            ChatElement::Badge(_) => TargetKind::Badge,
            ChatElement::Text(_) => return None,
        };
        let bounds = Bounds::new(
            gpui::point(
                viewport.origin.x + gpui::px(item.x),
                gpui::px(row.top + item.y),
            ),
            gpui::size(gpui::px(item.width), gpui::px(item.height)),
        );
        Some(HitTarget {
            kind,
            seq: row.seq,
            part: item.part,
            element: item.element,
            item: item_index,
            bounds,
        })
    }

    pub fn copy_text(&self) -> Option<String> {
        let selection = self.selection?;
        if selection.is_empty() {
            return None;
        }
        let (start, end) = selection.ordered();
        let show_timestamps = self
            .style
            .as_ref()
            .is_some_and(|style| style.show_timestamps);
        let mut out = String::new();
        let mut first = true;
        for seq in start.seq..=end.seq {
            let Some(entry) = self.entry(seq) else {
                continue;
            };
            let Some((from, to)) = selection.units_for(seq) else {
                continue;
            };
            let text = units_text(&entry.message, show_timestamps, from, to);
            if !first {
                out.push('\n');
            }
            first = false;
            out.push_str(text.trim_end());
        }
        (!out.is_empty()).then_some(out)
    }

    fn evict_layouts(&mut self) {
        if self.layouts_cached <= LAYOUT_BUDGET {
            return;
        }
        let visible: HashSet<i64> = self.rows.iter().map(|row| row.seq).collect();
        let mut candidates: Vec<(u64, usize)> = self
            .entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| entry.layout.is_some() && !visible.contains(&entry.seq))
            .map(|(index, entry)| (entry.used_frame, index))
            .collect();
        candidates.sort_unstable();
        let excess = self.layouts_cached - LAYOUT_BUDGET * 3 / 4;
        for (_, index) in candidates.into_iter().take(excess) {
            self.entries[index].layout = None;
            self.layouts_cached -= 1;
        }
    }
}

pub fn element_for(message: &ChatMessage, part: Part, element: u16) -> Option<&ChatElement> {
    match part {
        Part::Body => message.elements.get(element as usize),
        Part::Reply => message.reply.as_deref()?.get(element as usize),
        Part::Timestamp => None,
    }
}

struct Token<'a> {
    text: TokenText<'a>,
    units: u32,
    space_after: bool,
}

enum TokenText<'a> {
    Word(&'a str),
    Name(&'a str),
    Silent,
}

fn push_words<'a>(tokens: &mut Vec<Token<'a>>, words: &'a [Word]) {
    for word in words {
        tokens.push(Token {
            text: TokenText::Word(&word.text),
            units: word.text.chars().count() as u32,
            space_after: word.space_after,
        });
    }
}

fn push_elements<'a>(tokens: &mut Vec<Token<'a>>, elements: &'a [ChatElement]) {
    for element in elements {
        match element {
            ChatElement::Text(text) => push_words(tokens, &text.words),
            ChatElement::User(user) => push_words(tokens, &user.words),
            ChatElement::Emote(image) => tokens.push(Token {
                text: TokenText::Name(&image.name),
                units: 1,
                space_after: image.space_after,
            }),
            ChatElement::Badge(_) => tokens.push(Token {
                text: TokenText::Silent,
                units: 1,
                space_after: false,
            }),
        }
    }
}

pub fn units_text(message: &ChatMessage, show_timestamps: bool, from: u32, to: u32) -> String {
    let timestamp_words = message
        .timestamp
        .as_ref()
        .filter(|_| show_timestamps)
        .map(|timestamp| split_words(timestamp, true));
    let mut tokens = Vec::new();
    if let Some(reply) = message.reply.as_deref() {
        push_elements(&mut tokens, reply);
    }
    if let Some(words) = timestamp_words.as_deref() {
        push_words(&mut tokens, words);
    }
    push_elements(&mut tokens, &message.elements);
    let mut out = String::new();
    let mut cursor = 0u32;
    for token in tokens {
        let start = cursor;
        let end = cursor + token.units;
        cursor = end;
        if end <= from {
            continue;
        }
        if start >= to {
            break;
        }
        let local_start = from.saturating_sub(start);
        let local_end = (to - start).min(token.units);
        match token.text {
            TokenText::Word(word) => out.extend(
                word.chars()
                    .skip(local_start as usize)
                    .take((local_end - local_start) as usize),
            ),
            TokenText::Name(name) => out.push_str(name),
            TokenText::Silent => {}
        }
        if token.space_after && to > end {
            out.push(' ');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::elements::chat_list::model::parse_message;

    fn message(id: &str, text: &str) -> ChatMessage {
        parse_message(&json!({
            "id": id,
            "timestamp": "10:00",
            "elements": [
                { "kind": "user", "text": "alice:", "login": "alice" },
                { "kind": "text", "text": text },
                { "kind": "emote", "name": "Kappa", "url": "u", "width": 28, "height": 28 }
            ]
        }))
        .unwrap()
    }

    #[test]
    fn copies_partial_words_and_emote_names() {
        let message = message("a", "hello world");
        assert_eq!(
            units_text(&message, false, 0, u32::MAX).trim_end(),
            "alice: hello world Kappa"
        );
        assert_eq!(units_text(&message, false, 7, 13), "ello wo");
        assert_eq!(units_text(&message, true, 0, 5), "10:00");
    }

    #[test]
    fn append_trims_oldest_and_keeps_anchor_valid() {
        let mut list = ListState::default();
        list.options.max_messages = 3;
        list.apply(ChatListOp::Append(
            (0..5).map(|i| message(&i.to_string(), "x")).collect(),
        ));
        assert_eq!(list.entries.len(), 3);
        assert_eq!(list.entries.front().unwrap().message.id.as_ref(), "2");
        list.anchor = Some(Anchor {
            seq: 0,
            offset: 5.0,
        });
        list.follow = false;
        list.apply(ChatListOp::Append(vec![message("5", "y")]));
        assert_eq!(list.anchor.unwrap().seq, list.entries.front().unwrap().seq);
        assert_eq!(list.unseen, 1);
    }

    #[test]
    fn prepend_keeps_seqs_contiguous_and_respects_capacity() {
        let mut list = ListState::default();
        list.options.max_messages = 4;
        list.apply(ChatListOp::Append(vec![
            message("c", "x"),
            message("d", "x"),
        ]));
        list.apply(ChatListOp::Prepend(vec![
            message("z", "x"),
            message("a", "x"),
            message("b", "x"),
        ]));
        let ids: Vec<&str> = list
            .entries
            .iter()
            .map(|entry| entry.message.id.as_ref())
            .collect();
        assert_eq!(ids, vec!["a", "b", "c", "d"]);
        let seqs: Vec<i64> = list.entries.iter().map(|entry| entry.seq).collect();
        assert_eq!(seqs, vec![-2, -1, 0, 1]);
        assert_eq!(list.index_of(0), Some(2));
    }

    #[test]
    fn selection_orders_and_scopes_units() {
        let selection = Selection {
            anchor: SelPos { seq: 3, unit: 4 },
            focus: SelPos { seq: 1, unit: 2 },
        };
        assert_eq!(selection.units_for(1), Some((2, u32::MAX)));
        assert_eq!(selection.units_for(2), Some((0, u32::MAX)));
        assert_eq!(selection.units_for(3), Some((0, 4)));
        assert_eq!(selection.units_for(4), None);
    }
}
