use std::any::Any;
use std::collections::{BTreeMap, HashSet};
use std::sync::{Arc, OnceLock};
use std::time::Instant;

use gpui::{AnyElement, MouseButton, Window};
use serde_json::{Value, json};

pub use crate::anim_overlay::arm_paint_only_frame;
pub use crate::dump::hsla_to_hex;
pub use crate::elements::{
    ReactElement, bounds_have_drawable_area, close_pointer_span, open_pointer_span,
    overflow_clip_radii, pointer_reaches, report_layout,
};
pub use crate::image_prefetch::{
    adopt as adopt_prefetched_image, resource_for as image_resource,
    sweep as sweep_prefetched_images,
};
pub use crate::selection::clear as clear_text_selection;
pub use crate::style::{ElementStyle, map_font_family, parse_css_color};

const BUILT_IN_TYPES: &[&str] = &[
    "div",
    "text",
    "svg",
    "image",
    "webview",
    "system",
    "textinput",
    "textarea",
    "nativebutton",
    "nativeinput",
    "diff",
];

pub trait NativeElement: Send + Sync + 'static {
    fn element_type(&self) -> &'static str;

    fn parse_props(&self, props: Option<&Value>) -> NativeProps;

    fn render(&self, element: Arc<ReactElement>, window_id: u64) -> AnyElement;

    fn props_change_is_paint_only(&self, previous: &NativeProps, next: &NativeProps) -> bool {
        previous == next
    }

    fn parse_command(&self, _name: &str, _args: &Value) -> Option<NativeCommand> {
        None
    }

    fn apply_command(&self, _id: u64, _command: NativeCommand) {}

    fn retain(&self, _live: &HashSet<u64>) {}

    fn forget_window(&self, _window: u64) {}

    fn selected_text(&self) -> Option<String> {
        None
    }

    fn selection_changed_at(&self) -> Option<Instant> {
        None
    }

    fn clear_selection(&self) -> bool {
        false
    }

    fn holds_image(&self, _url: &str) -> bool {
        false
    }

    fn handles_pointer(&self) -> bool {
        false
    }

    fn debug_tap(&self, _id: u64, _x: f32, _y: f32, _button: MouseButton) -> Option<Value> {
        None
    }

    fn scroll_by(&self, _id: u64, _dx: f32, _dy: f32, _window: &Window) -> Option<bool> {
        None
    }

    fn dump(&self, _id: u64) -> Option<NativeDump> {
        None
    }

    fn debug_commands(&self) -> &'static [&'static str] {
        &[]
    }

    fn debug_command(&self, _name: &str, _request: &Value) -> Value {
        json!({ "ok": false, "error": "unknown debug command" })
    }
}

trait PropsValue: Any + Send + Sync {
    fn as_any(&self) -> &dyn Any;
    fn equals(&self, other: &dyn Any) -> bool;
}

impl<T: PartialEq + Send + Sync + 'static> PropsValue for T {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn equals(&self, other: &dyn Any) -> bool {
        other.downcast_ref::<T>().is_some_and(|other| self == other)
    }
}

#[derive(Clone)]
pub struct NativeProps(Arc<dyn PropsValue>);

impl NativeProps {
    pub fn new<T: PartialEq + Send + Sync + 'static>(props: T) -> Self {
        Self(Arc::new(props))
    }

    pub fn get<T: 'static>(&self) -> Option<&T> {
        self.0.as_any().downcast_ref()
    }
}

impl PartialEq for NativeProps {
    fn eq(&self, other: &Self) -> bool {
        self.0.equals(other.0.as_any())
    }
}

pub struct NativeCommand(Box<dyn Any + Send>);

impl NativeCommand {
    pub fn new<T: Send + 'static>(command: T) -> Self {
        Self(Box::new(command))
    }

    pub fn take<T: 'static>(self) -> Option<T> {
        self.0.downcast().ok().map(|command| *command)
    }
}

pub struct NativeDump {
    pub state: Value,
    pub children: Vec<Value>,
}

#[derive(Clone, PartialEq)]
pub(crate) struct NativePayload {
    pub kind: usize,
    pub props: NativeProps,
}

pub fn emit_event(id: u64, name: &str, payload: Value) {
    crate::bridge::native_event(id, name, payload);
}

static ELEMENTS: OnceLock<Vec<Box<dyn NativeElement>>> = OnceLock::new();

pub(crate) fn install(elements: Vec<Box<dyn NativeElement>>) {
    let mut seen = HashSet::new();
    for element in &elements {
        let element_type = element.element_type();
        assert!(
            !BUILT_IN_TYPES.contains(&element_type),
            "native element type `{element_type}` is a built-in element type"
        );
        assert!(
            seen.insert(element_type),
            "native element type `{element_type}` is registered twice"
        );
    }
    assert!(
        ELEMENTS.set(elements).is_ok(),
        "native elements are already registered"
    );
}

fn elements() -> &'static [Box<dyn NativeElement>] {
    ELEMENTS.get().map_or(&[], Vec::as_slice)
}

pub(crate) fn kind_of(element_type: &str) -> Option<usize> {
    elements()
        .iter()
        .position(|element| element.element_type() == element_type)
}

pub(crate) fn pointer_kind(element_type: &str) -> Option<usize> {
    kind_of(element_type).filter(|kind| elements()[*kind].handles_pointer())
}

pub(crate) fn parse_props(element_type: &str, props: Option<&Value>) -> Option<NativePayload> {
    let kind = kind_of(element_type)?;
    Some(NativePayload {
        kind,
        props: elements()[kind].parse_props(props),
    })
}

pub(crate) fn render(kind: usize, element: Arc<ReactElement>, window_id: u64) -> AnyElement {
    elements()[kind].render(element, window_id)
}

pub(crate) fn props_change_is_paint_only(previous: &NativePayload, next: &NativePayload) -> bool {
    previous.kind == next.kind
        && elements()[previous.kind].props_change_is_paint_only(&previous.props, &next.props)
}

pub(crate) fn parse_command(value: &Value) -> Option<(usize, u64, NativeCommand)> {
    let kind = kind_of(value.get("type")?.as_str()?)?;
    let id = value.get("id")?.as_u64()?;
    let name = value.get("name")?.as_str()?;
    let args = value.get("args").unwrap_or(&Value::Null);
    let command = elements()[kind].parse_command(name, args)?;
    Some((kind, id, command))
}

pub(crate) fn apply_command(kind: usize, id: u64, command: NativeCommand) {
    elements()[kind].apply_command(id, command);
}

pub(crate) fn retain(live: &BTreeMap<usize, HashSet<u64>>) {
    let none = HashSet::new();
    for (kind, element) in elements().iter().enumerate() {
        element.retain(live.get(&kind).unwrap_or(&none));
    }
}

pub(crate) fn forget_window(window: u64) {
    for element in elements() {
        element.forget_window(window);
    }
}

pub(crate) fn selected_text() -> Option<String> {
    elements()
        .iter()
        .filter_map(|element| {
            let text = element.selected_text()?;
            Some((element.selection_changed_at(), text))
        })
        .max_by_key(|(changed_at, _)| *changed_at)
        .map(|(_, text)| text)
}

pub(crate) fn selection_changed_at() -> Option<Instant> {
    elements()
        .iter()
        .filter_map(|element| element.selection_changed_at())
        .max()
}

pub(crate) fn clear_selection() -> bool {
    elements().iter().fold(false, |cleared, element| {
        element.clear_selection() || cleared
    })
}

pub(crate) fn holds_image(url: &str) -> bool {
    elements().iter().any(|element| element.holds_image(url))
}

pub(crate) fn debug_tap(
    kind: usize,
    id: u64,
    x: f32,
    y: f32,
    button: MouseButton,
) -> Option<Value> {
    elements()[kind].debug_tap(id, x, y, button)
}

pub(crate) fn scroll_by(kind: usize, id: u64, dx: f32, dy: f32, window: &Window) -> Option<bool> {
    elements()[kind].scroll_by(id, dx, dy, window)
}

pub(crate) fn dump(kind: usize, id: u64) -> Option<NativeDump> {
    elements()[kind].dump(id)
}

pub(crate) fn debug_kind(name: &str) -> Option<usize> {
    elements()
        .iter()
        .position(|element| element.debug_commands().contains(&name))
}

pub(crate) fn debug_command(kind: usize, name: &str, request: &Value) -> Value {
    elements()[kind].debug_command(name, request)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use gpui::{AnyElement, IntoElement};
    use serde_json::{Value, json};

    use super::{NativeCommand, NativeElement, NativeProps, ReactElement};
    use crate::{Incoming, parse_incoming};

    #[derive(Debug, PartialEq)]
    struct Probe {
        size: f32,
    }

    struct ProbeElement;

    impl NativeElement for ProbeElement {
        fn element_type(&self) -> &'static str {
            "probe"
        }

        fn parse_props(&self, props: Option<&Value>) -> NativeProps {
            let size = props
                .and_then(|props| props.get("size"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            NativeProps::new(Probe { size: size as f32 })
        }

        fn render(&self, _element: Arc<ReactElement>, _window_id: u64) -> AnyElement {
            gpui::div().into_any_element()
        }

        fn parse_command(&self, name: &str, args: &Value) -> Option<NativeCommand> {
            let by = args.get("by").and_then(Value::as_f64)?;
            (name == "grow").then(|| NativeCommand::new(by as f32))
        }
    }

    #[test]
    fn registered_elements_get_their_props_and_commands() {
        super::install(vec![Box::new(ProbeElement)]);

        let Some(Incoming::Tree(root)) = parse_incoming(&json!({
            "globalId": 1,
            "type": "div",
            "children": [{ "globalId": 2, "type": "probe", "nativeProps": { "size": 3 } }]
        })) else {
            panic!("expected a tree");
        };
        let probe = &root.children[0];
        assert_eq!(probe.native_props::<Probe>(), Some(&Probe { size: 3.0 }));
        assert_eq!(probe.native_kind(), Some(0));
        assert_eq!(root.native_kind(), None);

        let Some(Incoming::NativeCommand { kind, id, command }) = parse_incoming(&json!({
            "$cmd": "nativeCommand", "type": "probe", "id": 2, "name": "grow", "args": { "by": 4 }
        })) else {
            panic!("expected a native command");
        };
        assert_eq!((kind, id), (0, 2));
        assert_eq!(command.take::<f32>(), Some(4.0));

        let unknown_type = json!({ "$cmd": "nativeCommand", "type": "missing", "id": 2, "name": "grow", "args": { "by": 4 } });
        let unknown_name = json!({ "$cmd": "nativeCommand", "type": "probe", "id": 2, "name": "shrink", "args": { "by": 4 } });
        assert!(parse_incoming(&unknown_type).is_none());
        assert!(parse_incoming(&unknown_name).is_none());
    }

    #[test]
    fn props_compare_by_value_and_type() {
        let small = NativeProps::new(Probe { size: 1.0 });
        let same = NativeProps::new(Probe { size: 1.0 });
        let large = NativeProps::new(Probe { size: 2.0 });
        let other_type = NativeProps::new(1.0f32);

        assert!(small == same);
        assert!(small != large);
        assert!(small != other_type);
        assert_eq!(large.get::<Probe>(), Some(&Probe { size: 2.0 }));
        assert_eq!(other_type.get::<Probe>(), None);
    }

    #[test]
    fn commands_hand_back_their_value() {
        let command = NativeCommand::new(vec![1u8, 2, 3]);
        assert_eq!(command.take::<Vec<u8>>(), Some(vec![1, 2, 3]));
        assert!(NativeCommand::new(7u32).take::<String>().is_none());
    }
}
