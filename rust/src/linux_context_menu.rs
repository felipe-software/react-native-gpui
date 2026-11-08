use gpui::{
    AnyElement, Context, DismissEvent, Entity, Focusable as _, IntoElement as _,
    ParentElement as _, Pixels, Point, Subscription, Window, anchored, deferred, point, px,
};
use gpui_component::menu::{PopupMenu, PopupMenuItem};

use crate::native_menu::{NativeContextMenu, NativeContextMenuItem};

pub struct OpenContextMenu {
    position: Point<Pixels>,
    menu: Entity<PopupMenu>,
    _dismiss: Subscription,
}

impl OpenContextMenu {
    pub fn element(&self) -> AnyElement {
        deferred(
            anchored()
                .position(self.position)
                .snap_to_window_with_margin(px(8.0))
                .child(self.menu.clone()),
        )
        .with_priority(1)
        .into_any_element()
    }
}

pub fn open<T: 'static>(
    menu: NativeContextMenu,
    on_close: impl Fn(&mut T, &mut Context<T>) + 'static,
    window: &mut Window,
    cx: &mut Context<T>,
) -> Option<OpenContextMenu> {
    let close_id = menu.close_id.clone();
    if menu.items.is_empty() {
        if let Some(close_id) = close_id.as_deref() {
            crate::bridge::command(close_id);
        }
        return None;
    }
    let items = menu.items;
    let popup = PopupMenu::build(window, cx, move |popup, window, cx| {
        add_items(popup, &items, window, cx)
    });
    let dismiss = cx.subscribe_in(&popup, window, move |this, _, _: &DismissEvent, _, cx| {
        on_close(this, cx);
        if let Some(close_id) = close_id.as_deref() {
            crate::bridge::command(close_id);
        }
        cx.notify();
    });
    popup.focus_handle(cx).focus(window);
    Some(OpenContextMenu {
        position: point(px(menu.x), px(menu.y)),
        menu: popup,
        _dismiss: dismiss,
    })
}

fn add_items(
    mut popup: PopupMenu,
    items: &[NativeContextMenuItem],
    window: &mut Window,
    cx: &mut Context<PopupMenu>,
) -> PopupMenu {
    for item in items {
        popup = match item {
            NativeContextMenuItem::Action {
                id,
                label,
                disabled,
                checked,
                ..
            } => {
                let id = id.clone();
                popup.item(
                    PopupMenuItem::new(label.clone())
                        .disabled(*disabled)
                        .checked(*checked)
                        .on_click(move |_, _, _| crate::bridge::command(&id)),
                )
            }
            NativeContextMenuItem::Label { label } => popup.label(label.clone()),
            NativeContextMenuItem::Separator => popup.separator(),
            NativeContextMenuItem::Submenu {
                label,
                disabled: true,
                ..
            } => popup.item(PopupMenuItem::new(label.clone()).disabled(true)),
            NativeContextMenuItem::Submenu { label, items, .. } => {
                let items = items.clone();
                popup.submenu(label.clone(), window, cx, move |submenu, window, cx| {
                    add_items(submenu, &items, window, cx)
                })
            }
        };
    }
    popup
}
