mod debug;
mod element;
mod events;
mod images;
mod layout;
mod model;
mod state;

use std::collections::HashSet;

pub use debug::{debug_tap, dump, state_json};
pub use element::{ReactChatListElement, scroll_list};
pub use model::{ChatListOp, ChatListOptions, parse_command};

pub const ELEMENT_TYPE: &str = "chatlist";

pub fn apply(id: u64, op: ChatListOp) {
    state::with_list(id, |list| list.apply(op));
}

pub fn retain(present: &HashSet<u64>) {
    state::retain(present);
}

pub fn selected_text() -> Option<String> {
    state::selected_text()
}

pub fn clear_selection() -> bool {
    state::clear_selection()
}

pub fn selection_changed_at() -> Option<std::time::Instant> {
    state::selection_changed_at()
}

pub fn forget_window(window: u64) {
    images::forget_window(window);
}
