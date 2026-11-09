import type { AppCommandBinding } from "react-native-gpui";
import type { HotkeyOverride } from "../../data/api";

export type HotkeyCategory = "Popup Windows" | "Split" | "Split input box" | "Window";

export type HotkeyEntry = { name: string; category: HotkeyCategory; key: string; action?: string; builtIn?: boolean };

export const HOTKEY_CATEGORIES: HotkeyCategory[] = ["Popup Windows", "Split", "Split input box", "Window"];

const TABS = [1, 2, 3, 4, 5, 6, 7, 8];

export const DEFAULT_HOTKEYS: HotkeyEntry[] = [
    { category: "Popup Windows", name: "close popup window", key: "Esc", action: "escape" },
    { category: "Popup Windows", name: "popup accept", key: "Return" },
    { category: "Popup Windows", name: "popup focus search box", key: "Ctrl+F", action: "search" },
    { category: "Popup Windows", name: "popup reject", key: "Esc" },
    { category: "Popup Windows", name: "popup scroll down", key: "PgDown" },
    { category: "Popup Windows", name: "popup scroll up", key: "PgUp" },
    { category: "Popup Windows", name: "popup select last tab", key: "Ctrl+9", action: "selectTab:9" },
    { category: "Popup Windows", name: "popup select next tab", key: "Ctrl+Tab", action: "nextTab" },
    { category: "Popup Windows", name: "popup select previous tab", key: "Ctrl+Shift+Tab", action: "previousTab" },
    ...TABS.map((tab): HotkeyEntry => ({ category: "Popup Windows", name: `popup select tab #${tab}`, key: `Ctrl+${tab}`, action: `selectTab:${tab}` })),
    { category: "Split", name: "change channel", key: "Ctrl+R", action: "changeChannel" },
    { category: "Split", name: "create clip", key: "Alt+X" },
    { category: "Split", name: "delete", key: "Ctrl+W", action: "closeSplit" },
    { category: "Split", name: "focus down", key: "Alt+Down", action: "focusDown" },
    { category: "Split", name: "focus left", key: "Alt+Left", action: "focusLeft" },
    { category: "Split", name: "focus right", key: "Alt+Right", action: "focusRight" },
    { category: "Split", name: "focus up", key: "Alt+Up", action: "focusUp" },
    { category: "Split", name: "open debug popup", key: "F10" },
    { category: "Split", name: "open overlay", key: "Ctrl+Alt+N" },
    { category: "Split", name: "reconnect", key: "Ctrl+F5", action: "reconnect" },
    { category: "Split", name: "reload emotes", key: "F5" },
    { category: "Split", name: "scroll page down", key: "PgDown" },
    { category: "Split", name: "scroll page up", key: "PgUp" },
    { category: "Split", name: "scroll to bottom", key: "Ctrl+End", action: "scrollToBottom" },
    { category: "Split", name: "scroll to top", key: "Ctrl+Home" },
    { category: "Split", name: "show global search", key: "Ctrl+Shift+F", action: "searchAll" },
    { category: "Split", name: "show search", key: "Ctrl+F", action: "search" },
    { category: "Split", name: "toggle overlay click-through", key: "Ctrl+Shift+U" },
    { category: "Split input box", name: "emote picker", key: "Ctrl+E", action: "emotePopup" },
    { category: "Split input box", name: "go to end of input", key: "End", builtIn: true },
    { category: "Split input box", name: "go to end of input with selection", key: "Shift+End", builtIn: true },
    { category: "Split input box", name: "go to start of input", key: "Home", builtIn: true },
    { category: "Split input box", name: "go to start of input with selection", key: "Shift+Home", builtIn: true },
    { category: "Split input box", name: "next message", key: "Down", action: "input:next" },
    { category: "Split input box", name: "previous message", key: "Up", action: "input:previous" },
    { category: "Split input box", name: "send message", key: "Return", builtIn: true },
    { category: "Split input box", name: "send message and keep text", key: "Ctrl+Return", action: "input:sendKeep" },
    { category: "Window", name: "new popup window", key: "Ctrl+N", action: "popupSplit" },
    { category: "Window", name: "new popup window from tab", key: "Ctrl+Shift+N" },
    { category: "Window", name: "new split", key: "Ctrl+T", action: "newSplit" },
    { category: "Window", name: "new tab", key: "Ctrl+Shift+T", action: "newTab" },
    { category: "Window", name: "open quick switcher", key: "Ctrl+K", action: "quickSwitcher" },
    { category: "Window", name: "open settings", key: "Ctrl+P", action: "openSettings" },
    { category: "Window", name: "remove tab", key: "Ctrl+Shift+W", action: "closeTab" },
    { category: "Window", name: "reopen split", key: "Ctrl+G", action: "reopenSplit" },
    { category: "Window", name: "select last tab", key: "Ctrl+9", action: "selectTab:9" },
    { category: "Window", name: "select next tab", key: "Ctrl+Tab", action: "nextTab" },
    { category: "Window", name: "select previous tab", key: "Ctrl+Shift+Tab", action: "previousTab" },
    ...TABS.map((tab): HotkeyEntry => ({ category: "Window", name: `select tab #${tab}`, key: `Ctrl+${tab}`, action: `selectTab:${tab}` })),
    { category: "Window", name: "toggle local r9k", key: "Ctrl+H" },
    { category: "Window", name: "toggle tab visibility", key: "Ctrl+U", action: "toggleTabs" },
    { category: "Window", name: "zoom in", key: "Ctrl++", action: "zoomIn" },
    { category: "Window", name: "zoom out", key: "Ctrl+-", action: "zoomOut" },
    { category: "Window", name: "zoom reset", key: "Ctrl+0", action: "zoomReset" },
];

const KEY_NAMES: Record<string, string> = {
    return: "enter",
    enter: "enter",
    esc: "escape",
    escape: "escape",
    pgdown: "pagedown",
    pgup: "pageup",
    del: "delete",
    ins: "insert",
};

export function toBindingKey(display: string): string | undefined {
    const parts = display.split("+").filter((part, index, list) => part !== "" || index === list.length - 1);
    if (display.endsWith("++")) parts.splice(parts.length - 1, 1, "+");
    const key = parts.pop();
    if (!key) return undefined;
    const modifiers = parts.map((part) => {
        const lower = part.toLowerCase();
        if (lower === "ctrl") return "secondary";
        if (lower === "meta") return "cmd";
        return lower;
    });
    const lowerKey = key.toLowerCase();
    return [...modifiers, KEY_NAMES[lowerKey] ?? lowerKey].join("-");
}

export function resolveHotkeys(overrides: HotkeyOverride[]): HotkeyEntry[] {
    const byName = new Map(overrides.map((override) => [override.id, override]));
    const entries: HotkeyEntry[] = [];
    for (const entry of DEFAULT_HOTKEYS) {
        const override = byName.get(entry.name);
        if (override?.removed) continue;
        entries.push(override ? { ...entry, key: override.key } : entry);
    }
    for (const override of overrides) {
        const isCustom = !DEFAULT_HOTKEYS.some((entry) => entry.name === override.id);
        if (!isCustom || override.removed || !override.action) continue;
        entries.push({ name: override.id, category: override.category ?? "Window", key: override.key, action: override.action });
    }
    return entries.sort((a, b) => {
        const byCategory = HOTKEY_CATEGORIES.indexOf(a.category) - HOTKEY_CATEGORIES.indexOf(b.category);
        if (byCategory !== 0) return byCategory;
        if (a.name === b.name) return 0;
        return a.name < b.name ? -1 : 1;
    });
}

export function applyHotkeyOverrides(bindings: AppCommandBinding[], overrides: HotkeyOverride[]): AppCommandBinding[] {
    if (overrides.length === 0) return bindings;
    const overridden = new Set(overrides.filter((override) => !override.removed).map((override) => override.id));
    const changed = new Map<string, HotkeyEntry>();
    for (const entry of resolveHotkeys(overrides)) if (entry.action && overridden.has(entry.name)) changed.set(entry.action, entry);
    const removed = new Set(
        DEFAULT_HOTKEYS.filter((entry) => entry.action && overrides.some((override) => override.id === entry.name && override.removed)).map((entry) => entry.action as string),
    );
    const result: AppCommandBinding[] = [];
    const seen = new Set<string>();
    for (const binding of bindings) {
        if (removed.has(binding.id)) continue;
        const entry = changed.get(binding.id);
        const key = entry ? toBindingKey(entry.key) : undefined;
        if (!entry || !key) {
            result.push(binding);
            continue;
        }
        if (seen.has(binding.id)) continue;
        seen.add(binding.id);
        result.push({ ...binding, key });
    }
    for (const [action, entry] of changed) {
        const key = toBindingKey(entry.key);
        const known = bindings.some((binding) => binding.id === action);
        if (!known && key) result.push({ id: action, key });
    }
    return result;
}
