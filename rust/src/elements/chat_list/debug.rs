use gpui::{MouseButton, point, px};
use serde_json::{Map, Value, json};

use super::events;
use super::images;
use super::layout::{ItemKind, Part};
use super::model::ChatElement;
use super::state::{self, ListState, element_for};

const ITEM_SLOTS: i64 = 1000;
const ROW_SLOTS: i64 = 1000;

fn synthetic_id(list_id: u64, seq: i64, slot: usize) -> i64 {
    let list = (list_id % 1_000_000_000) as i64;
    -(list * ROW_SLOTS * ITEM_SLOTS + seq.rem_euclid(ROW_SLOTS) * ITEM_SLOTS + slot as i64)
}

fn bounds_json(x: f32, y: f32, width: f32, height: f32) -> Value {
    json!({ "x": x, "y": y, "width": width, "height": height })
}

fn item_type(element: Option<&ChatElement>, part: Part, kind: &ItemKind) -> &'static str {
    if matches!(kind, ItemKind::ReplyCurve) {
        return "chatlist-reply-curve";
    }
    if part == Part::Timestamp {
        return "chatlist-timestamp";
    }
    match element {
        Some(ChatElement::User(_)) => "chatlist-user",
        Some(ChatElement::Text(text)) if text.link.is_some() => "chatlist-link",
        Some(ChatElement::Text(_)) => "chatlist-text",
        Some(ChatElement::Emote(_)) => "chatlist-emote",
        Some(ChatElement::Badge(_)) => "chatlist-badge",
        None => "chatlist-item",
    }
}

pub fn summary(list: &ListState) -> Value {
    let (ready, loading, failed) = images::loaded_count();
    let selection = list.copy_text();
    json!({
        "messages": list.entries.len(),
        "visibleMessages": list.rows.len(),
        "cachedLayouts": list.layouts_cached,
        "layoutsBuilt": list.stats.layouts_built,
        "framesLaidOut": list.stats.frames,
        "paintedItems": list.stats.painted_items,
        "paintedImages": list.stats.painted_images,
        "animatedVisible": list.stats.animated_visible,
        "atBottom": list.at_bottom(),
        "following": list.following(),
        "paused": list.is_paused(),
        "unseen": list.unseen,
        "markers": list.markers.len(),
        "selection": selection,
        "hovered": list.hovered.as_ref().map(|hovered| hovered.kind.label()),
        "anchor": list.anchor.map(|anchor| json!({
            "messageId": list.entry(anchor.seq).map(|entry| entry.message.id.to_string()),
            "offset": anchor.offset,
        })),
        "firstMessageId": list.entries.front().map(|entry| entry.message.id.to_string()),
        "lastMessageId": list.entries.back().map(|entry| entry.message.id.to_string()),
        "scrollbar": {
            "thumb": list.scrollbar.thumb.map(|thumb| bounds_json(
                f32::from(thumb.origin.x),
                f32::from(thumb.origin.y),
                f32::from(thumb.size.width),
                f32::from(thumb.size.height),
            )),
            "position": list.scrollbar.position,
            "span": list.scrollbar.span,
            "total": list.scrollbar.total,
        },
        "images": { "ready": ready, "loading": loading, "failed": failed },
        "animationWakes": images::wakes_scheduled(),
    })
}

pub fn dump(list_id: u64) -> Option<(Value, Vec<Value>)> {
    state::with_existing(list_id, |list| {
        let viewport = list.viewport?;
        let origin_x = f32::from(viewport.origin.x);
        let mut children = Vec::new();
        for row in &list.rows {
            let Some(entry) = list.entry(row.seq) else {
                continue;
            };
            let message = &entry.message;
            let mut items = Vec::new();
            for (index, item) in row.layout.items.iter().enumerate() {
                if index + 1 >= ITEM_SLOTS as usize {
                    break;
                }
                let element = element_for(message, item.part, item.element);
                let mut node = Map::new();
                node.insert(
                    "globalId".into(),
                    json!(synthetic_id(list_id, row.seq, index + 1)),
                );
                node.insert(
                    "type".into(),
                    json!(item_type(element, item.part, &item.kind)),
                );
                let text = match &item.kind {
                    ItemKind::Glyphs(glyphs) => Some(glyphs.text.to_string()),
                    ItemKind::Image(image) => Some(image.name.to_string()),
                    ItemKind::ReplyCurve => None,
                };
                if let Some(text) = text {
                    node.insert("text".into(), json!(text));
                }
                if let ItemKind::Image(image) = &item.kind {
                    node.insert("src".into(), json!(image.url.as_ref()));
                }
                if let Some(ChatElement::User(user)) = element {
                    node.insert(
                        "accessibility".into(),
                        json!({ "label": user.login.as_ref() }),
                    );
                }
                node.insert(
                    "bounds".into(),
                    bounds_json(origin_x + item.x, row.top + item.y, item.width, item.height),
                );
                items.push(Value::Object(node));
            }
            let mut node = Map::new();
            node.insert("globalId".into(), json!(synthetic_id(list_id, row.seq, 0)));
            node.insert("type".into(), json!("chatlist-message"));
            node.insert("text".into(), json!(message.plain_text()));
            node.insert(
                "accessibility".into(),
                json!({ "nativeID": message.id.as_ref() }),
            );
            node.insert(
                "bounds".into(),
                bounds_json(
                    origin_x,
                    row.top,
                    f32::from(viewport.size.width),
                    row.layout.height,
                ),
            );
            let mut style = Map::new();
            if let Some(background) = message.background {
                style.insert(
                    "backgroundColor".into(),
                    json!(crate::dump::hsla_to_hex(background)),
                );
            }
            if message.disabled || message.historical {
                let mut opacity = 1.0;
                if message.disabled {
                    opacity *= list.options.disabled_opacity;
                }
                if message.historical {
                    opacity *= list.options.historical_opacity;
                }
                style.insert("opacity".into(), json!(opacity));
            }
            if !style.is_empty() {
                node.insert("style".into(), Value::Object(style));
            }
            node.insert("children".into(), Value::Array(items));
            children.push(Value::Object(node));
        }
        Some((summary(list), children))
    })
    .flatten()
}

pub fn state_json(list_id: Option<u64>) -> Value {
    let ids = match list_id {
        Some(id) => vec![id],
        None => state::list_ids(),
    };
    let lists: Vec<Value> = ids
        .into_iter()
        .filter_map(|id| {
            state::with_existing(id, |list| {
                let mut value = summary(list);
                value["id"] = json!(id);
                value
            })
        })
        .collect();
    json!({ "ok": true, "type": "chatList", "lists": lists })
}

pub fn debug_tap(list_id: u64, x: f32, y: f32, button: MouseButton) -> Option<Value> {
    state::with_existing(list_id, |list| {
        let position = point(px(x), px(y));
        let target = list.hit_target(position);
        let seq = list.row_at(y).map(|row| row.seq);
        events::emit_press(list_id, list, button, position, target.as_ref(), seq)
    })
    .flatten()
}
