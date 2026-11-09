use std::sync::Arc;

use gpui::{Hsla, SharedString};
use serde_json::{Map, Value};

use crate::style::parse_css_color;

pub const DEFAULT_MAX_MESSAGES: usize = 1000;
const MAX_MESSAGES_LIMIT: usize = 100_000;

#[derive(Clone, Debug, PartialEq)]
pub struct Word {
    pub text: SharedString,
    pub space_after: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextElement {
    pub words: Arc<[Word]>,
    pub color: Option<Hsla>,
    pub bold: bool,
    pub italic: bool,
    pub link: Option<SharedString>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UserElement {
    pub words: Arc<[Word]>,
    pub login: SharedString,
    pub color: Option<Hsla>,
    pub bold: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImageElement {
    pub name: SharedString,
    pub url: SharedString,
    pub width: f32,
    pub height: f32,
    pub zero_width: bool,
    pub tooltip: Option<SharedString>,
    pub tooltip_image: Option<SharedString>,
    pub link: Option<SharedString>,
    pub background: Option<Hsla>,
    pub space_after: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ChatElement {
    Text(TextElement),
    User(UserElement),
    Emote(ImageElement),
    Badge(ImageElement),
}

impl ChatElement {
    pub fn copy_text(&self) -> String {
        match self {
            ChatElement::Text(text) => join_words(&text.words),
            ChatElement::User(user) => join_words(&user.words),
            ChatElement::Emote(image) | ChatElement::Badge(image) => image.name.to_string(),
        }
    }
}

fn join_words(words: &[Word]) -> String {
    let mut out = String::new();
    for (index, word) in words.iter().enumerate() {
        if index > 0 {
            out.push(' ');
        }
        out.push_str(&word.text);
    }
    out
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub id: SharedString,
    pub timestamp: Option<SharedString>,
    pub elements: Arc<[ChatElement]>,
    pub reply: Option<Arc<[ChatElement]>>,
    pub background: Option<Hsla>,
    pub marker: Option<Hsla>,
    pub disabled: bool,
    pub historical: bool,
    pub hidden: bool,
}

impl ChatMessage {
    pub fn plain_text(&self) -> String {
        let mut out = String::new();
        for element in self.elements.iter() {
            let text = element.copy_text();
            if text.is_empty() {
                continue;
            }
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(&text);
        }
        out
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ChatMessagePatch {
    pub id: SharedString,
    pub timestamp: Option<Option<SharedString>>,
    pub elements: Option<Arc<[ChatElement]>>,
    pub reply: Option<Option<Arc<[ChatElement]>>>,
    pub background: Option<Option<Hsla>>,
    pub marker: Option<Option<Hsla>>,
    pub disabled: Option<bool>,
    pub historical: Option<bool>,
    pub hidden: Option<bool>,
}

impl ChatMessagePatch {
    pub fn apply(&self, message: &mut ChatMessage) {
        if let Some(timestamp) = &self.timestamp {
            message.timestamp = timestamp.clone();
        }
        if let Some(elements) = &self.elements {
            message.elements = elements.clone();
        }
        if let Some(reply) = &self.reply {
            message.reply = reply.clone();
        }
        if let Some(background) = self.background {
            message.background = background;
        }
        if let Some(marker) = self.marker {
            message.marker = marker;
        }
        if let Some(disabled) = self.disabled {
            message.disabled = disabled;
        }
        if let Some(historical) = self.historical {
            message.historical = historical;
        }
        if let Some(hidden) = self.hidden {
            message.hidden = hidden;
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum ChatListOp {
    Append(Vec<ChatMessage>),
    Prepend(Vec<ChatMessage>),
    Update(Vec<ChatMessagePatch>),
    Clear,
    ScrollToBottom,
    ScrollToTop,
    ScrollToMessage {
        id: SharedString,
        align: RevealAlign,
    },
    Page(f32),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RevealAlign {
    Top,
    Center,
    Bottom,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChatListOptions {
    pub font_size: f32,
    pub font_family: Option<SharedString>,
    pub text_color: Option<Hsla>,
    pub muted_color: Option<Hsla>,
    pub link_color: Option<Hsla>,
    pub selection_color: Option<Hsla>,
    pub separator_color: Option<Hsla>,
    pub alternate_background: Option<Hsla>,
    pub scrollbar_color: Option<Hsla>,
    pub disabled_opacity: f32,
    pub historical_opacity: f32,
    pub show_timestamps: bool,
    pub emote_scale: f32,
    pub animate_emotes: bool,
    pub max_messages: usize,
    pub pause_on_hover: bool,
}

impl Default for ChatListOptions {
    fn default() -> Self {
        Self {
            font_size: 13.0,
            font_family: None,
            text_color: None,
            muted_color: None,
            link_color: None,
            selection_color: None,
            separator_color: None,
            alternate_background: None,
            scrollbar_color: None,
            disabled_opacity: 0.4,
            historical_opacity: 0.4,
            show_timestamps: false,
            emote_scale: 1.0,
            animate_emotes: true,
            max_messages: DEFAULT_MAX_MESSAGES,
            pause_on_hover: false,
        }
    }
}

impl ChatListOptions {
    pub fn parse(value: Option<&Value>) -> Self {
        let mut options = Self::default();
        let Some(obj) = value.and_then(Value::as_object) else {
            return options;
        };
        if let Some(size) = number(obj, "fontSize").filter(|size| *size > 0.0) {
            options.font_size = size.clamp(4.0, 96.0);
        }
        options.font_family =
            string(obj, "fontFamily").map(|family| crate::style::map_font_family(&family));
        options.text_color = color(obj, "textColor");
        options.muted_color = color(obj, "mutedColor");
        options.link_color = color(obj, "linkColor");
        options.selection_color = color(obj, "selectionColor");
        options.separator_color = color(obj, "separatorColor");
        options.alternate_background = color(obj, "alternateBackground");
        options.scrollbar_color = color(obj, "scrollbarColor");
        if let Some(opacity) = number(obj, "disabledOpacity") {
            options.disabled_opacity = opacity.clamp(0.0, 1.0);
        }
        if let Some(opacity) = number(obj, "historicalOpacity") {
            options.historical_opacity = opacity.clamp(0.0, 1.0);
        }
        options.show_timestamps = boolean(obj, "showTimestamps").unwrap_or(false);
        if let Some(scale) = number(obj, "emoteScale").filter(|scale| *scale > 0.0) {
            options.emote_scale = scale.clamp(0.1, 8.0);
        }
        options.animate_emotes = boolean(obj, "animateEmotes").unwrap_or(true);
        if let Some(max) = obj.get("maxMessages").and_then(Value::as_u64) {
            options.max_messages = (max as usize).clamp(1, MAX_MESSAGES_LIMIT);
        }
        options.pause_on_hover = boolean(obj, "pauseOnHover").unwrap_or(false);
        options
    }
}

fn number(obj: &Map<String, Value>, key: &str) -> Option<f32> {
    obj.get(key)
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn boolean(obj: &Map<String, Value>, key: &str) -> Option<bool> {
    obj.get(key).and_then(Value::as_bool)
}

fn string(obj: &Map<String, Value>, key: &str) -> Option<String> {
    obj.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn shared(obj: &Map<String, Value>, key: &str) -> Option<SharedString> {
    string(obj, key).map(SharedString::from)
}

fn color(obj: &Map<String, Value>, key: &str) -> Option<Hsla> {
    obj.get(key)
        .and_then(Value::as_str)
        .and_then(parse_css_color)
}

pub fn parse_command(value: &Value) -> Option<(u64, ChatListOp)> {
    let id = value.get("id").and_then(Value::as_u64)?;
    let op = match value.get("op").and_then(Value::as_str)? {
        "append" => ChatListOp::Append(parse_messages(value.get("messages"))),
        "prepend" => ChatListOp::Prepend(parse_messages(value.get("messages"))),
        "update" => ChatListOp::Update(parse_patches(value.get("patches"))),
        "clear" => ChatListOp::Clear,
        "scrollToBottom" => ChatListOp::ScrollToBottom,
        "scrollToTop" => ChatListOp::ScrollToTop,
        "scrollToMessage" => ChatListOp::ScrollToMessage {
            id: SharedString::from(value.get("messageId").and_then(Value::as_str)?.to_string()),
            align: match value.get("align").and_then(Value::as_str) {
                Some("top") => RevealAlign::Top,
                Some("bottom") => RevealAlign::Bottom,
                _ => RevealAlign::Center,
            },
        },
        "page" => {
            let direction = value
                .get("direction")
                .and_then(Value::as_f64)
                .unwrap_or(1.0);
            ChatListOp::Page(if direction < 0.0 { -1.0 } else { 1.0 })
        }
        _ => return None,
    };
    Some((id, op))
}

fn parse_messages(value: Option<&Value>) -> Vec<ChatMessage> {
    value
        .and_then(Value::as_array)
        .map(|messages| messages.iter().filter_map(parse_message).collect())
        .unwrap_or_default()
}

fn parse_patches(value: Option<&Value>) -> Vec<ChatMessagePatch> {
    value
        .and_then(Value::as_array)
        .map(|patches| patches.iter().filter_map(parse_patch).collect())
        .unwrap_or_default()
}

pub fn parse_message(value: &Value) -> Option<ChatMessage> {
    let obj = value.as_object()?;
    let id = shared(obj, "id")?;
    Some(ChatMessage {
        id,
        timestamp: shared(obj, "timestamp"),
        elements: parse_elements(obj.get("elements")),
        reply: parse_reply(obj.get("reply")),
        background: color(obj, "background"),
        marker: color(obj, "marker"),
        disabled: boolean(obj, "disabled").unwrap_or(false),
        historical: boolean(obj, "historical").unwrap_or(false),
        hidden: boolean(obj, "hidden").unwrap_or(false),
    })
}

fn parse_patch(value: &Value) -> Option<ChatMessagePatch> {
    let obj = value.as_object()?;
    let id = shared(obj, "id")?;
    let clearable_string = |key: &str| obj.get(key).map(|_| shared(obj, key));
    let clearable_color = |key: &str| obj.get(key).map(|_| color(obj, key));
    Some(ChatMessagePatch {
        id,
        timestamp: clearable_string("timestamp"),
        elements: obj
            .get("elements")
            .filter(|elements| elements.is_array())
            .map(|elements| parse_elements(Some(elements))),
        reply: obj.get("reply").map(|reply| parse_reply(Some(reply))),
        background: clearable_color("background"),
        marker: clearable_color("marker"),
        disabled: boolean(obj, "disabled"),
        historical: boolean(obj, "historical"),
        hidden: boolean(obj, "hidden"),
    })
}

fn parse_reply(value: Option<&Value>) -> Option<Arc<[ChatElement]>> {
    let elements = parse_elements(value);
    (!elements.is_empty()).then_some(elements)
}

fn parse_elements(value: Option<&Value>) -> Arc<[ChatElement]> {
    value
        .and_then(Value::as_array)
        .map(|elements| {
            elements
                .iter()
                .filter_map(parse_element)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
        .into()
}

fn parse_element(value: &Value) -> Option<ChatElement> {
    let obj = value.as_object()?;
    let space_after = boolean(obj, "trailingSpace").unwrap_or(true);
    match obj.get("kind").and_then(Value::as_str)? {
        "text" => {
            let words = split_words(obj.get("text").and_then(Value::as_str)?, space_after);
            if words.is_empty() {
                return None;
            }
            Some(ChatElement::Text(TextElement {
                words,
                color: color(obj, "color"),
                bold: boolean(obj, "bold").unwrap_or(false),
                italic: boolean(obj, "italic").unwrap_or(false),
                link: shared(obj, "link"),
            }))
        }
        "user" => {
            let words = split_words(obj.get("text").and_then(Value::as_str)?, space_after);
            if words.is_empty() {
                return None;
            }
            Some(ChatElement::User(UserElement {
                words,
                login: shared(obj, "login").unwrap_or_default(),
                color: color(obj, "color"),
                bold: boolean(obj, "bold").unwrap_or(true),
            }))
        }
        "emote" => parse_image(obj, space_after).map(ChatElement::Emote),
        "badge" => parse_image(obj, space_after).map(|mut image| {
            image.zero_width = false;
            image.link = None;
            ChatElement::Badge(image)
        }),
        _ => None,
    }
}

fn parse_image(obj: &Map<String, Value>, space_after: bool) -> Option<ImageElement> {
    let width = number(obj, "width").filter(|width| width.is_finite() && *width > 0.0)?;
    let height = number(obj, "height").filter(|height| height.is_finite() && *height > 0.0)?;
    Some(ImageElement {
        name: shared(obj, "name").unwrap_or_default(),
        url: shared(obj, "url").unwrap_or_default(),
        width: width.min(4096.0),
        height: height.min(4096.0),
        zero_width: boolean(obj, "zeroWidth").unwrap_or(false),
        tooltip: shared(obj, "tooltip"),
        tooltip_image: shared(obj, "tooltipImage"),
        link: shared(obj, "link"),
        background: color(obj, "background"),
        space_after,
    })
}

pub fn split_words(text: &str, space_after_last: bool) -> Arc<[Word]> {
    let pieces: Vec<&str> = text.split_whitespace().collect();
    let last = pieces.len().saturating_sub(1);
    pieces
        .into_iter()
        .enumerate()
        .map(|(index, piece)| Word {
            text: SharedString::from(piece.to_string()),
            space_after: index < last || space_after_last,
        })
        .collect::<Vec<_>>()
        .into()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn splits_words_and_keeps_trailing_space_rule() {
        let words = split_words("  hello   world ", false);
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].text.as_ref(), "hello");
        assert!(words[0].space_after);
        assert!(!words[1].space_after);
    }

    #[test]
    fn parses_append_with_every_element_kind() {
        let command = json!({
            "$cmd": "chatList",
            "id": 7,
            "op": "append",
            "messages": [{
                "id": "m1",
                "timestamp": "12:00",
                "marker": "#ff0000",
                "elements": [
                    { "kind": "badge", "name": "mod", "url": "https://x/b.png", "width": 18, "height": 18 },
                    { "kind": "user", "text": "alice:", "login": "alice", "color": "#00ff00" },
                    { "kind": "text", "text": "hi there", "link": "https://a.b" },
                    { "kind": "emote", "name": "Kappa", "url": "https://x/k.png", "width": 28, "height": 28, "zeroWidth": true },
                    { "kind": "emote", "name": "bad", "url": "https://x/k.png", "width": 0, "height": 28 }
                ],
                "reply": [{ "kind": "text", "text": "Replying to @bob" }]
            }]
        });
        let (id, op) = parse_command(&command).expect("command parses");
        assert_eq!(id, 7);
        let ChatListOp::Append(messages) = op else {
            panic!("expected append");
        };
        let message = &messages[0];
        assert_eq!(message.elements.len(), 4);
        assert!(message.marker.is_some());
        assert!(
            matches!(message.elements[1], ChatElement::User(ref user) if user.bold && user.login.as_ref() == "alice")
        );
        assert!(matches!(message.elements[3], ChatElement::Emote(ref emote) if emote.zero_width));
        assert_eq!(message.reply.as_ref().map(|reply| reply.len()), Some(1));
        assert_eq!(message.plain_text(), "mod alice: hi there Kappa");
    }

    #[test]
    fn patch_distinguishes_absent_from_cleared_fields() {
        let patch =
            parse_patch(&json!({ "id": "m1", "background": "", "disabled": true })).unwrap();
        let mut message = parse_message(&json!({
            "id": "m1",
            "background": "#111111",
            "marker": "#222222",
            "elements": [{ "kind": "text", "text": "a" }]
        }))
        .unwrap();
        patch.apply(&mut message);
        assert_eq!(message.background, None);
        assert!(message.marker.is_some());
        assert!(message.disabled);
        assert_eq!(message.elements.len(), 1);
    }

    #[test]
    fn hidden_flag_and_badge_background_round_trip() {
        let mut message = parse_message(&json!({
            "id": "m1",
            "elements": [
                { "kind": "badge", "name": "moderator", "url": "u", "width": 18, "height": 18, "background": "#34ae0a" },
                { "kind": "text", "text": "a" }
            ]
        }))
        .unwrap();
        assert!(!message.hidden);
        let ChatElement::Badge(badge) = &message.elements[0] else {
            panic!("expected a badge");
        };
        assert!(badge.background.is_some());

        parse_patch(&json!({ "id": "m1", "hidden": true }))
            .unwrap()
            .apply(&mut message);
        assert!(message.hidden);
        parse_patch(&json!({ "id": "m1", "hidden": false }))
            .unwrap()
            .apply(&mut message);
        assert!(!message.hidden);
    }

    #[test]
    fn options_fall_back_to_defaults() {
        let options = ChatListOptions::parse(Some(
            &json!({ "fontSize": 0, "maxMessages": 5, "emoteScale": 2 }),
        ));
        assert_eq!(options.font_size, 13.0);
        assert_eq!(options.max_messages, 5);
        assert_eq!(options.emote_scale, 2.0);
        assert!(options.animate_emotes);
    }
}
