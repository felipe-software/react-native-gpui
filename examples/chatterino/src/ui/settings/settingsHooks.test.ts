import { describe, expect, test } from "bun:test";
import type { ChatListMessage } from "react-native-gpui";
import { HOTKEYS } from "../hotkeys";
import { messageMenuEntries, type MessageMenuActions } from "../splits/messageMenu";
import type { MenuEntry } from "../state/overlays";
import { applyHotkeyOverrides, toBindingKey } from "./hotkeyCatalog";

const message: ChatListMessage = { id: "m-1", timestamp: "17:04", elements: [{ kind: "text", text: "hello" }] };
const base = { message, copyMessage: "hello", copyFullMessage: "17:04 hello", shift: false, canReply: false, replyable: false, inThread: false };
const actions: MessageMenuActions = { openUrl: () => undefined, copy: () => undefined, openPlayer: () => undefined };

function lastEntry(entries: MenuEntry[]): MenuEntry | undefined {
    return entries[entries.length - 1];
}

describe("hotkey overrides", () => {
    test("converts Chatterino key names to binding keys", () => {
        expect(toBindingKey("Ctrl+Shift+T")).toBe("secondary-shift-t");
        expect(toBindingKey("Alt+Left")).toBe("alt-left");
    });

    test("rebinds and removes the bound action, leaving the others alone", () => {
        const rebound = applyHotkeyOverrides(HOTKEYS, [{ id: "open settings", key: "Ctrl+O" }]);
        expect(rebound.find((binding) => binding.id === "openSettings")?.key).toBe("secondary-o");
        expect(rebound.find((binding) => binding.id === "newSplit")?.key).toBe("secondary-t");
        const removed = applyHotkeyOverrides(HOTKEYS, [{ id: "open settings", key: "Ctrl+P", removed: true }]);
        expect(removed.some((binding) => binding.id === "openSettings")).toBe(false);
        expect(applyHotkeyOverrides(HOTKEYS, [])).toBe(HOTKEYS);
    });
});

describe("Execute command menu", () => {
    test("lists commands marked for the message menu as the last submenu", () => {
        const ran: string[] = [];
        const commands = [{ label: "/quote", run: () => ran.push("/quote") }];
        const entries = messageMenuEntries({ ...base, event: { target: "text" } }, { ...actions, commands });
        const last = lastEntry(entries);
        expect(last).toMatchObject({ kind: "submenu", label: "Execute command" });
        if (last?.kind === "submenu") {
            const [first] = last.entries;
            if (first?.kind === "item") first.onSelect();
        }
        expect(ran).toEqual(["/quote"]);
    });

    test("is absent without commands or without a message", () => {
        const plain = messageMenuEntries({ ...base, event: { target: "text" } }, actions);
        expect(plain.some((entry) => entry.kind === "submenu" && entry.label === "Execute command")).toBe(false);
        const commands = [{ label: "/quote", run: () => undefined }];
        const noMessage = messageMenuEntries({ ...base, message: undefined, event: { target: "text" } }, { ...actions, commands });
        expect(noMessage.some((entry) => entry.kind === "submenu" && entry.label === "Execute command")).toBe(false);
    });
});
