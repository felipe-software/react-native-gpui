import type { AppCommandBinding } from "react-native-gpui";
import { selectedTab } from "./layout/tabs";
import { findNode, splitLeaves } from "./layout/tree";
import type { AppServices } from "./state/AppContext";
import { inputRegistry, type InputCommand } from "./state/inputs";
import { isModal } from "./state/overlays";
import { overlayWindowFor } from "./overlays/overlayWindows";
import { SETTINGS_SEARCH_KEY } from "./settings/SettingsSearchField";
import { popupKeys } from "./state/popupKeys";
import { uiScaleOf, zoomedScale, type ZoomDirection } from "./zoom";

const TAB_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const HOTKEYS: AppCommandBinding[] = [
    { id: "openSettings", key: "secondary-p" },
    { id: "newSplit", key: "secondary-t" },
    ...TAB_NUMBERS.map((number) => ({ id: `selectTab:${number}`, key: `secondary-${number}` })),
    { id: "nextTab", key: "ctrl-tab" },
    { id: "previousTab", key: "ctrl-shift-tab" },
    { id: "newTab", key: "secondary-shift-t" },
    { id: "closeTab", key: "secondary-shift-w" },
    { id: "reopenSplit", key: "secondary-g" },
    { id: "toggleTabs", key: "secondary-u" },
    { id: "closeSplit", key: "secondary-w" },
    { id: "changeChannel", key: "secondary-r" },
    { id: "search", key: "secondary-f" },
    { id: "searchAll", key: "secondary-shift-f" },
    { id: "reconnect", key: "secondary-f5" },
    { id: "focusLeft", key: "alt-left" },
    { id: "focusRight", key: "alt-right" },
    { id: "focusUp", key: "alt-up" },
    { id: "focusDown", key: "alt-down" },
    { id: "scrollToBottom", key: "secondary-end" },
    { id: "emotePopup", key: "secondary-e" },
    { id: "escape", key: "escape" },
    { id: "input:complete", key: "tab", context: "Input" },
    { id: "input:completeBack", key: "shift-tab", context: "Input" },
    { id: "input:previous", key: "up", context: "Input" },
    { id: "input:next", key: "down", context: "Input" },
    { id: "input:sendKeep", key: "secondary-enter", context: "Input" },
    { id: "input:newline", key: "shift-enter", context: "Input" },
    { id: "zoomIn", key: "secondary-+" },
    { id: "zoomIn", key: "secondary-shift-=" },
    { id: "zoomOut", key: "secondary--" },
    { id: "zoomReset", key: "secondary-0" },
    { id: "popupSplit", key: "secondary-n" },
    { id: "quickSwitcher", key: "secondary-k" },
];

const INPUT_COMMANDS: Record<string, InputCommand> = {
    "input:complete": "complete",
    "input:completeBack": "completeBack",
    "input:previous": "previous",
    "input:next": "next",
    "input:sendKeep": "sendKeep",
    "input:newline": "newline",
};

const ZOOM_DIRECTIONS: Record<string, ZoomDirection> = { zoomIn: "in", zoomOut: "out", zoomReset: "reset" };

const FOCUS_DIRECTIONS = {
    focusLeft: "left",
    focusRight: "right",
    focusUp: "above",
    focusDown: "below",
} as const;

function focusedSplit(services: AppServices) {
    const layout = services.core.layout.get();
    const tab = selectedTab(layout);
    if (!tab?.focusedSplitId) return undefined;
    const node = findNode(tab.root, tab.focusedSplitId);
    if (!node || node.type !== "split") return undefined;
    return { tab, split: node };
}

function closeTopOverlay(services: AppServices): boolean {
    const inWindow = services.overlays.filter((overlay) => overlayWindowFor(overlay) === null);
    const top = inWindow[inWindow.length - 1];
    if (!top) return false;
    services.closeOverlay(top.id);
    if (top.kind === "selectChannel" && top.isNew) services.actions.discardSplit(top.splitId);
    return true;
}

function focusedPopup(services: AppServices) {
    const key = inputRegistry.focused();
    return services.overlays.find((overlay) => overlay.kind === "splitPopup" && overlay.id === key);
}

function runSplitCommand(id: string, services: AppServices): boolean {
    const popup = focusedPopup(services);
    if (popup && id === "closeSplit") {
        services.closeOverlay(popup.id);
        return true;
    }
    const current = focusedSplit(services);
    if (id === "newSplit") {
        services.actions.newSplit();
        return true;
    }
    if (!current) return false;
    const { split, tab } = current;
    switch (id) {
        case "closeSplit":
            services.actions.closeSplit(split.id);
            return true;
        case "changeChannel":
            services.openOverlay({ kind: "selectChannel", splitId: split.id, isNew: false });
            return true;
        case "search":
            services.openOverlay({ kind: "search", splitId: split.id, channels: [split.channel] });
            return true;
        case "searchAll":
            services.openOverlay({ kind: "search", splitId: split.id, channels: splitLeaves(tab.root).map((leaf) => leaf.channel) });
            return true;
        case "emotePopup":
            services.openOverlay({ kind: "emotes", splitId: split.id, channel: split.channel });
            return true;
        case "reconnect":
            services.core.reconnect();
            return true;
        case "scrollToBottom":
            inputRegistry.get(split.id)?.scrollToBottom();
            return true;
        case "popupSplit":
            if (split.channel) services.openOverlay({ kind: "splitPopup", channel: split.channel });
            return true;
    }
    return false;
}

function runWindowCommand(id: string, services: AppServices): boolean {
    const { actions } = services;
    if (id.startsWith("selectTab:")) {
        actions.selectTabByNumber(Number(id.slice("selectTab:".length)));
        return true;
    }
    switch (id) {
        case "openSettings":
            services.openOverlay({ kind: "settings" });
            return true;
        case "nextTab":
            actions.stepTab(1);
            return true;
        case "previousTab":
            actions.stepTab(-1);
            return true;
        case "newTab":
            actions.newTab();
            return true;
        case "closeTab": {
            const tab = selectedTab(services.core.layout.get());
            if (tab) actions.closeTab(tab.id);
            return true;
        }
        case "reopenSplit":
            actions.reopenSplit();
            return true;
        case "quickSwitcher":
            services.openOverlay({ kind: "quickSwitcher" });
            return true;
        case "toggleTabs":
            services.prefsStore.set((prefs) => ({ ...prefs, tabVisibility: prefs.tabVisibility === "none" ? "all" : "none" }));
            return true;
    }
    const zoom = ZOOM_DIRECTIONS[id];
    if (zoom) {
        services.core.settings.set((settings) => ({ ...settings, uiScale: zoomedScale(uiScaleOf(settings), zoom) }));
        return true;
    }
    if (id in FOCUS_DIRECTIONS) {
        actions.moveFocus(FOCUS_DIRECTIONS[id as keyof typeof FOCUS_DIRECTIONS]);
        return true;
    }
    return false;
}

function runPopupCommand(id: string, focusedInput: string | undefined): boolean {
    const popup = popupKeys.get(focusedInput);
    if (!popup) return false;
    if (id.startsWith("selectTab:")) {
        const number = Number(id.slice("selectTab:".length));
        popup.selectTab(number === 9 ? "last" : number - 1);
        return true;
    }
    switch (id) {
        case "nextTab":
            popup.stepTab(1);
            return true;
        case "previousTab":
            popup.stepTab(-1);
            return true;
        case "search":
            popup.focusSearch();
            return true;
    }
    return false;
}

export function runHotkey(id: string, services: AppServices): void {
    const focusedInput = inputRegistry.focused();
    if (runPopupCommand(id, focusedInput)) return;
    const inputCommand = INPUT_COMMANDS[id];
    if (inputCommand) {
        if (focusedInput) inputRegistry.get(focusedInput)?.command(inputCommand);
        return;
    }
    if (id === "escape") {
        const handledByInput = !!focusedInput && !!inputRegistry.get(focusedInput)?.command("escape");
        if (!handledByInput) closeTopOverlay(services);
        return;
    }
    const settingsOpen = services.overlays.some((overlay) => overlay.kind === "settings");
    if (id === "search" && settingsOpen) {
        inputRegistry.get(SETTINGS_SEARCH_KEY)?.focus();
        return;
    }
    const blockedByModal = services.overlays.some(isModal);
    if (blockedByModal) return;
    if (runWindowCommand(id, services)) return;
    runSplitCommand(id, services);
}
