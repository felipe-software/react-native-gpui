import { describe, expect, test } from "bun:test";
import { closeOverlay, isModal, openOverlay, type Overlay } from "./overlays";

const menu = { kind: "menu" as const, x: 0, y: 0, entries: [] };

describe("overlay stack", () => {
    test("singletons replace their previous instance", () => {
        let stack: Overlay[] = [];
        stack = openOverlay(stack, { kind: "settings" }, "a");
        stack = openOverlay(stack, { kind: "settings", page: "Accounts" }, "b");
        expect(stack.map((overlay) => overlay.id)).toEqual(["b"]);
    });

    test("user cards stack, menus close when something else opens", () => {
        let stack: Overlay[] = [];
        stack = openOverlay(stack, { kind: "userCard", login: "a", channel: "c", x: 0, y: 0 }, "1");
        stack = openOverlay(stack, menu, "2");
        stack = openOverlay(stack, { kind: "userCard", login: "b", channel: "c", x: 0, y: 0 }, "3");
        expect(stack.map((overlay) => overlay.id)).toEqual(["1", "3"]);
    });

    test("closing removes only that overlay", () => {
        const stack = openOverlay(openOverlay([], { kind: "settings" }, "a"), { kind: "emotes", splitId: "s", channel: "c" }, "b");
        expect(closeOverlay(stack, "a").map((overlay) => overlay.id)).toEqual(["b"]);
    });

    test("dialogs that need an answer are modal", () => {
        const dialog = openOverlay([], { kind: "selectChannel", splitId: "s", isNew: true }, "a")[0];
        const card = openOverlay([], { kind: "userCard", login: "a", channel: "c", x: 0, y: 0 }, "b")[0];
        expect(isModal(dialog)).toBe(true);
        expect(isModal(card)).toBe(false);
    });
});
