import { describe, expect, test } from "bun:test";
import type { Completion, EmoteInfo } from "../../data/api";
import {
    filterEmotes,
    insertWithSpacing,
    popupQuery,
    providerLabel,
    startTabCycle,
    stepTabCycle,
    tabCycleText,
    wordAtEnd,
} from "./completion";
import { emptyHistory, nextMessage, previousMessage, recordSent } from "./history";

function emote(name: string, extra: Partial<EmoteInfo> = {}): EmoteInfo {
    return { name, url: "", width: 28, height: 28, provider: "bttv", scope: "global", ...extra };
}

const completions: Completion[] = [
    { text: "LUL ", display: "LUL - Twitch Emote", kind: "emote" },
    { text: "LULW ", display: "LULW - Global BetterTTV", kind: "emote" },
    { text: "Lulu, ", display: "Lulu", kind: "user" },
];

describe("send history (SplitInput previousMessage/nextMessage)", () => {
    test("blank and repeated messages are not stored", () => {
        let history = recordSent(emptyHistory(), "hello");
        history = recordSent(history, "hello");
        history = recordSent(history, "   ");
        expect(history.entries).toEqual(["hello"]);
    });

    test("Up walks back, Down returns to the unsent draft", () => {
        let history = recordSent(recordSent(emptyHistory(), "first"), "second");
        let step = previousMessage(history, "draft");
        expect(step.text).toBe("second");
        step = previousMessage(step.history, step.text);
        expect(step.text).toBe("first");
        step = previousMessage(step.history, step.text);
        expect(step.text).toBe("first");
        step = nextMessage(step.history, step.text);
        expect(step.text).toBe("second");
        step = nextMessage(step.history, step.text);
        expect(step.text).toBe("draft");
        history = step.history;
        expect(history.index).toBe(2);
    });

    test("Down with no history leaves the text alone", () => {
        expect(nextMessage(emptyHistory(), "typing").text).toBe("typing");
    });
});

describe("tab completion", () => {
    const complete = (word: string) => completions.filter((entry) => entry.text.toLowerCase().startsWith(word.toLowerCase()));

    test("needs two characters", () => {
        expect(startTabCycle("hi L", complete)).toBeUndefined();
    });

    test("cycles forward and wraps, Shift+Tab goes back", () => {
        let cycle = startTabCycle("hi LU", complete);
        expect(cycle && tabCycleText(cycle)).toBe("hi LUL ");
        cycle = stepTabCycle(cycle!, 1);
        expect(tabCycleText(cycle)).toBe("hi LULW ");
        cycle = stepTabCycle(stepTabCycle(cycle, 1), 1);
        expect(tabCycleText(cycle)).toBe("hi LUL ");
        expect(tabCycleText(stepTabCycle(cycle, -1))).toBe("hi Lulu, ");
    });

    test("the first word is flagged as the start of the message", () => {
        let seen = false;
        startTabCycle("LU", (_, atStart) => {
            seen = atStart;
            return completions;
        });
        expect(seen).toBe(true);
    });

    test("wordAtEnd", () => {
        expect(wordAtEnd("a b cd")).toEqual({ start: 4, word: "cd" });
    });
});

describe("completion popup", () => {
    test("opens on : and @", () => {
        expect(popupQuery("hey :")).toEqual({ kind: "emote", query: "", start: 4 });
        expect(popupQuery("hey @fo")).toEqual({ kind: "user", query: "fo", start: 4 });
        expect(popupQuery("hey @")).toBeUndefined();
        expect(popupQuery("hey : ")).toBeUndefined();
    });

    test("emotes match by substring with the exact match first", () => {
        const list = [emote("PepeLaugh"), emote("pepe"), emote("Clap"), emote("peepoPepe")];
        expect(filterEmotes(list, "pepe").map((entry) => entry.name)).toEqual(["pepe", "peepoPepe", "PepeLaugh"]);
    });

    test(":~ shows only zero-width emotes", () => {
        const list = [emote("SoSnowy", { zeroWidth: true }), emote("Snowman")];
        expect(filterEmotes(list, "~sno").map((entry) => entry.name)).toEqual(["SoSnowy"]);
    });

    test("provider labels follow EmoteSource.cpp", () => {
        expect(providerLabel(emote("a", { provider: "bttv", scope: "channel" }))).toBe("Channel BetterTTV");
        expect(providerLabel(emote("a", { provider: "7tv", scope: "global" }))).toBe("Global 7TV");
        expect(providerLabel(emote("a", { provider: "twitch", scope: "subscriber" }))).toBe("Twitch Emote");
        expect(providerLabel(emote("a", { provider: "emoji" }))).toBe("Emoji");
    });

    test("emote popup clicks insert with spacing", () => {
        expect(insertWithSpacing("", "Kappa")).toBe("Kappa ");
        expect(insertWithSpacing("hi", "Kappa")).toBe("hi Kappa ");
        expect(insertWithSpacing("hi ", "Kappa")).toBe("hi Kappa ");
    });
});
