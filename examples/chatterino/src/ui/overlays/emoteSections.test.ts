import { describe, expect, test } from "bun:test";
import type { EmoteInfo } from "../../data/api";
import { layoutEmoteGrid, visibleRows } from "./emoteGridLayout";
import { compareEmoteNames, emoteSections, searchSections } from "./emoteSections";
import { normalizeChannelName, stepSelection, switcherItems } from "./switcherItems";

function emote(name: string, provider: EmoteInfo["provider"], scope: EmoteInfo["scope"], width = 28): EmoteInfo {
    return { name, url: `https://example.com/${name}`, width, height: 28, provider, scope };
}

const emotes = [
    emote("Kappa", "twitch", "global"),
    emote("forsenE", "twitch", "subscriber"),
    emote("OMEGALUL", "bttv", "channel"),
    emote("catJAM", "7tv", "channel"),
    emote("PogU", "ffz", "global"),
    emote("Clap", "bttv", "global"),
    emote("smile", "emoji", "global"),
];

function titles(sections: ReturnType<typeof emoteSections>): string[] {
    return sections.map((section) => (section.emotes.length > 0 ? section.title : `${section.title}: ${section.empty}`));
}

describe("emote popup sections (EmotePopup::loadChannel)", () => {
    test("Channel tab always lists BetterTTV, FrankerFaceZ and 7TV", () => {
        expect(titles(emoteSections("Channel", emotes, "forsen"))).toEqual(["BetterTTV", "FrankerFaceZ: no emotes available", "7TV"]);
        expect(emoteSections("Channel", emotes, "/mentions", false)).toEqual([]);
    });

    test("Global tab starts with Twitch when there are Twitch globals", () => {
        expect(titles(emoteSections("Global", emotes, "forsen"))).toEqual(["Twitch", "BetterTTV", "FrankerFaceZ", "7TV: no emotes available"]);
    });

    test("Subs says so when empty, Emojis lists emoji", () => {
        expect(titles(emoteSections("Subs", [], "forsen"))).toEqual([": no subscription emotes available"]);
        expect(emoteSections("Subs", emotes, "forsen")[0].emotes.map((entry) => entry.name)).toEqual(["forsenE"]);
        expect(emoteSections("Emojis", emotes, "forsen")[0].emotes.map((entry) => entry.name)).toEqual(["smile"]);
    });

    test("search groups globals before channel emotes", () => {
        expect(searchSections(emotes, "a", "forsen").map((section) => section.title)).toEqual([
            "Twitch",
            "BetterTTV (Global)",
            "BetterTTV (Channel)",
            "7TV (Channel)",
        ]);
    });

    test("names sort case-insensitively with LuL before LUL", () => {
        expect(["LUL", "LuL", "abc"].sort(compareEmoteNames)).toEqual(["abc", "LuL", "LUL"]);
    });
});

describe("emote grid layout (centered messages)", () => {
    const metrics = { width: 300, textLine: 16.4, space: 4, scale: 1 };

    test("titles take one text line and emote lines wrap and center", () => {
        const many = Array.from({ length: 10 }, (_, index) => emote(`e${index}`, "bttv", "channel"));
        const layout = layoutEmoteGrid([{ title: "BetterTTV", emotes: many }], metrics);
        const [title, first, second] = layout.rows;
        expect(title).toMatchObject({ kind: "title", y: 0, height: 24 });
        expect(first.kind === "emotes" && first.items.length).toBe(9);
        expect(first.kind === "emotes" && first.items[0].x).toBe(8);
        expect(second.kind === "emotes" && second.items.map((item) => item.x)).toEqual([136]);
        expect(first).toMatchObject({ y: 24, height: 32 });
        expect(second).toMatchObject({ y: 56, height: 32 });
        expect(layout.height).toBe(88);
    });

    test("empty sections show their text and only nearby rows render", () => {
        const layout = layoutEmoteGrid([{ title: "7TV", emotes: [], empty: "no emotes available" }], metrics);
        expect(layout.rows.map((row) => row.kind)).toEqual(["title", "empty"]);
        expect(visibleRows(layout, 1000, 100, 0)).toEqual([]);
    });
});

describe("quick switcher (QuickSwitcherPopup::updateSuggestions)", () => {
    const layout = {
        selectedTabId: "a",
        tabs: [
            { id: "a", title: "Main", root: { type: "split" as const, id: "s1", channel: "forsen" } },
            { id: "b", root: { type: "split" as const, id: "s2", channel: "xqc" } },
            { id: "c", title: "Games", root: null },
        ],
    };

    test("first matching split per tab, then tab titles, then open rows", () => {
        const items = switcherItems(layout, "Fo", (channel) => channel);
        expect(items.map((item) => item.kind)).toEqual(["split", "newTab", "newPopup"]);
        expect(items[1]).toMatchObject({ channel: "fo", label: 'Open channel "Fo" in new tab' });
        expect(switcherItems(layout, "gam", (channel) => channel).map((item) => item.kind)).toEqual(["tab", "newTab", "newPopup"]);
        expect(switcherItems(layout, "", (channel) => channel).map((item) => item.key)).toEqual(["split-s1", "split-s2", "tab-c"]);
    });

    test("selection wraps", () => {
        expect(stepSelection(0, 3, -1)).toBe(2);
        expect(stepSelection(2, 3, 1)).toBe(0);
        expect(normalizeChannelName("#Forsen")).toBe("forsen");
    });
});
