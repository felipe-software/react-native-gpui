import type { AppCommandBinding } from "react-native-gpui";
import { selectedTab } from "./layout/tabs";
import { findNode, splitLeaves } from "./layout/tree";
import type { AppServices } from "./state/AppContext";
import { inputRegistry, type InputCommand } from "./state/inputs";
import { isModal } from "./state/overlays";

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
];

const INPUT_COMMANDS: Record<string, InputCommand> = {
    "input:complete": "complete",
    "input:completeBack": "completeBack",
    "input:previous": "previous",
    "input:next": "next",
    "input:sendKeep": "sendKeep",
};

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
    const top = services.overlays[services.overlays.length - 1];
    if (!top) return false;
    services.closeOverlay(top.id);
    if (top.kind === "selectChannel" && top.isNew) services.actions.discardSplit(top.splitId);
    return true;
}

function runSplitCommand(id: string, services: AppServices): boolean {
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
        case "toggleTabs":
            services.prefsStore.set((prefs) => ({ ...prefs, tabVisibility: prefs.tabVisibility === "none" ? "all" : "none" }));
            return true;
    }
    if (id in FOCUS_DIRECTIONS) {
        actions.moveFocus(FOCUS_DIRECTIONS[id as keyof typeof FOCUS_DIRECTIONS]);
        return true;
    }
    return false;
}

export function runHotkey(id: string, services: AppServices): void {
    const focusedInput = inputRegistry.focused();
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
    const blockedByModal = services.overlays.some(isModal);
    if (blockedByModal) return;
    if (runWindowCommand(id, services)) return;
    runSplitCommand(id, services);
}
