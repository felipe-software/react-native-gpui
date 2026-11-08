import { describe, expect, test } from "bun:test";
import { defaultLayout, defaultSettings } from "../defaults";
import {
    loadAccounts,
    loadLayout,
    loadSettings,
    memoryStorage,
    sanitizeLayout,
    sanitizeSettings,
    STORAGE_KEYS,
} from "../persistence";
import { createStore } from "../store";

describe("defaults", () => {
    test("match Chatterino's defaults", () => {
        const settings = defaultSettings("linux");
        expect(settings).toMatchObject({
            theme: "dark",
            fontSize: 11,
            showTimestamps: true,
            timestampFormat: "h:mm",
            emoteScale: 1,
            animateEmotes: true,
            loadHistoryOnJoin: true,
            historyLimit: 800,
            messageLimit: 1000,
            highlightSelfMentions: true,
            mentionSound: true,
            streamerMode: "auto",
            showDeletedMessages: true,
        });
        expect(defaultSettings("darwin").fontSize).toBe(12);
    });

    test("default layout has Main and More tabs with the requested splits", () => {
        const layout = defaultLayout();
        expect(layout.tabs.map((tab) => tab.title)).toEqual(["Main", "More"]);
        expect(layout.selectedTabId).toBe(layout.tabs[0].id);
        expect(layout.tabs[0].root).toMatchObject({
            type: "container",
            direction: "horizontal",
            children: [
                { type: "split", channel: "xqc" },
                {
                    type: "container",
                    direction: "vertical",
                    children: [
                        { type: "split", channel: "forsen" },
                        { type: "split", channel: "sodapoppin" },
                    ],
                },
            ],
        });
        expect(layout.tabs[1].root).toMatchObject({
            type: "container",
            direction: "horizontal",
            children: [{ channel: "lirik" }, { channel: "kaicenat" }, { channel: "hasanabi" }],
        });
    });
});

describe("storage", () => {
    test("uses versioned keys and round-trips through stores", () => {
        expect(STORAGE_KEYS).toEqual({
            settings: "chatterino-gpui/v1/settings",
            layout: "chatterino-gpui/v1/layout",
            accounts: "chatterino-gpui/v1/accounts",
        });
        const storage = memoryStorage();
        const store = createStore(loadSettings(storage), (value) => storage.setItem(STORAGE_KEYS.settings, JSON.stringify(value)));
        store.set((current) => ({ ...current, theme: "light", fontSize: 14 }));
        expect(loadSettings(storage)).toMatchObject({ theme: "light", fontSize: 14 });
    });

    test("falls back to defaults on corrupt JSON", () => {
        const storage = memoryStorage();
        storage.setItem(STORAGE_KEYS.settings, "{not json");
        storage.setItem(STORAGE_KEYS.layout, "[]");
        expect(loadSettings(storage)).toEqual(defaultSettings());
        expect(loadLayout(storage)).toEqual(defaultLayout());
    });

    test("migrates partial or invalid settings field by field", () => {
        const migrated = sanitizeSettings({
            theme: "neon",
            fontSize: -3,
            timestampFormat: "HH:mm",
            highlightPhrases: [{ pattern: "pog", isRegex: true }, { pattern: "" }, "junk"],
            highlightUsers: [{ login: "SomeOne", showInMentions: true }],
            ignoredUsers: ["Spammer", 3],
            ignoredPhrases: [{ pattern: "x", replaceWith: "y" }],
            unknownField: true,
        });
        expect(migrated.theme).toBe("dark");
        expect(migrated.fontSize).toBe(defaultSettings().fontSize);
        expect(migrated.timestampFormat).toBe("HH:mm");
        expect(migrated.highlightPhrases).toEqual([
            { pattern: "pog", isRegex: true, caseSensitive: false, playSound: false, alert: false, showInMentions: true },
        ]);
        expect(migrated.highlightUsers).toEqual([{ login: "someone", playSound: false, alert: false, showInMentions: true }]);
        expect(migrated.ignoredUsers).toEqual(["spammer"]);
        expect(migrated.ignoredPhrases).toEqual([{ pattern: "x", isRegex: false, caseSensitive: false, replaceWith: "y" }]);
        expect("unknownField" in migrated).toBe(false);
    });

    test("repairs layouts: duplicate ids, single-child containers, sizes and selection", () => {
        const layout = sanitizeLayout({
            selectedTabId: "missing",
            tabs: [
                {
                    id: "t1",
                    root: {
                        type: "container",
                        id: "c1",
                        direction: "vertical",
                        sizes: [3, -1],
                        children: [
                            { type: "split", id: "s1", channel: "#XQC " },
                            { type: "split", id: "s1", channel: "dup" },
                            { type: "container", id: "c2", children: [{ type: "split", id: "s2", channel: "forsen" }] },
                        ],
                    },
                    focusedSplitId: "nope",
                },
                { id: "t1", root: null },
            ],
        });
        expect(layout.selectedTabId).toBe("t1");
        expect(layout.tabs).toHaveLength(1);
        expect(layout.tabs[0].focusedSplitId).toBe("s1");
        expect(layout.tabs[0].root).toEqual({
            type: "container",
            id: "c1",
            direction: "vertical",
            children: [
                { type: "split", id: "s1", channel: "xqc" },
                { type: "split", id: "s2", channel: "forsen" },
            ],
            sizes: [0.75, 0.25],
        });
    });

    test("keeps valid accounts and drops the current selection when it is gone", () => {
        const storage = memoryStorage();
        storage.setItem(
            STORAGE_KEYS.accounts,
            JSON.stringify({
                current: "ghost",
                accounts: [
                    { login: "Me", userId: "1", clientId: "c", token: "oauth:abc", scopes: ["chat:read", 4] },
                    { login: "broken" },
                    { login: "me", userId: "1", clientId: "c", token: "dup" },
                ],
            }),
        );
        expect(loadAccounts(storage)).toEqual({ accounts: [{ login: "me", userId: "1", clientId: "c", token: "abc", scopes: ["chat:read"] }] });
    });
});
