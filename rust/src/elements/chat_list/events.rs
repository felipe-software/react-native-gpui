use gpui::{MouseButton, Pixels, Point};
use serde_json::{Map, Value, json};

use super::model::ChatElement;
use super::state::{HitTarget, ListState, ScrollSnapshot, TargetKind, element_for};
use crate::elements::ReactElement;

pub const PRESS_EVENT: &str = "chatListPress";
pub const HOVER_EVENT: &str = "chatListHover";
pub const SCROLL_EVENT: &str = "chatListScroll";

fn button_label(button: MouseButton) -> Option<&'static str> {
    match button {
        MouseButton::Left => Some("left"),
        MouseButton::Right => Some("right"),
        MouseButton::Middle => Some("middle"),
        MouseButton::Navigate(_) => None,
    }
}

fn insert_text(map: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        map.insert(key.into(), json!(value));
    }
}

fn text_of(value: &Option<gpui::SharedString>) -> Option<&str> {
    value.as_ref().map(|value| value.as_ref())
}

fn target_fields(map: &mut Map<String, Value>, element: &ChatElement) {
    match element {
        ChatElement::User(user) => {
            insert_text(map, "login", Some(&user.login));
            insert_text(map, "name", Some(&element.copy_text()));
        }
        ChatElement::Text(text) => {
            insert_text(map, "url", text_of(&text.link));
            insert_text(map, "name", Some(&element.copy_text()));
        }
        ChatElement::Emote(image) | ChatElement::Badge(image) => {
            insert_text(map, "name", Some(&image.name));
            insert_text(map, "url", Some(&image.url));
            insert_text(map, "link", text_of(&image.link));
            insert_text(map, "tooltip", text_of(&image.tooltip));
            insert_text(map, "tooltipImage", text_of(&image.tooltip_image));
        }
    }
}

pub fn hover_payload(list: &ListState, target: &HitTarget) -> Option<Value> {
    let entry = list.entry(target.seq)?;
    let element = element_for(&entry.message, target.part, target.element)?;
    let mut map = Map::new();
    map.insert("target".into(), json!(target.kind.label()));
    map.insert("messageId".into(), json!(entry.message.id.as_ref()));
    target_fields(&mut map, element);
    map.insert("x".into(), json!(f32::from(target.bounds.origin.x)));
    map.insert("y".into(), json!(f32::from(target.bounds.origin.y)));
    map.insert("width".into(), json!(f32::from(target.bounds.size.width)));
    map.insert("height".into(), json!(f32::from(target.bounds.size.height)));
    Some(Value::Object(map))
}

pub fn emit_hover(id: u64, list: &ListState, target: Option<&HitTarget>) {
    if !list.listens_hover {
        return;
    }
    let payload = target
        .and_then(|target| hover_payload(list, target))
        .unwrap_or(Value::Null);
    crate::bridge::chat_list_event(id, HOVER_EVENT, payload);
}

pub fn press_payload(
    list: &ListState,
    button: MouseButton,
    position: Point<Pixels>,
    target: Option<&HitTarget>,
    seq: Option<i64>,
) -> Option<Value> {
    let button = button_label(button)?;
    let seq = target.map(|target| target.seq).or(seq)?;
    let entry = list.entry(seq)?;
    let mut map = Map::new();
    let kind = target.map_or("message", |target| target.kind.label());
    map.insert("target".into(), json!(kind));
    map.insert("messageId".into(), json!(entry.message.id.as_ref()));
    map.insert("button".into(), json!(button));
    map.insert("x".into(), json!(f32::from(position.x)));
    map.insert("y".into(), json!(f32::from(position.y)));
    if let Some(target) = target
        && let Some(element) = element_for(&entry.message, target.part, target.element)
    {
        target_fields(&mut map, element);
        if matches!(target.kind, TargetKind::Link | TargetKind::User) {
            map.remove("tooltip");
        }
    }
    Some(Value::Object(map))
}

pub fn emit_press(
    id: u64,
    list: &ListState,
    button: MouseButton,
    position: Point<Pixels>,
    target: Option<&HitTarget>,
    seq: Option<i64>,
) -> Option<Value> {
    let payload = press_payload(list, button, position, target, seq)?;
    if list.listens_press {
        crate::bridge::chat_list_event(id, PRESS_EVENT, payload.clone());
    }
    Some(payload)
}

pub fn emit_scroll_state(id: u64, element: &ReactElement, snapshot: ScrollSnapshot) {
    if !element.listens(SCROLL_EVENT) {
        return;
    }
    crate::bridge::chat_list_event(
        id,
        SCROLL_EVENT,
        json!({
            "atBottom": snapshot.at_bottom,
            "paused": snapshot.paused,
            "unseen": snapshot.unseen,
        }),
    );
}
