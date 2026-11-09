import { describe, expect, test } from "bun:test";
import type { Completion, EmoteInfo } from "../../data/api";
import { caretAfterEdit, caretAfterKey } from "./caret";
import {
    filterEmotes,
    insertAt,
    insertWithSpacing,
    popupQuery,
    providerLabel,
    replaceRange,
    startTabCycle,
    stepTabCycle,
    tabCycleCursor,
    tabCycleText,
    wordAtEnd,
    wordBefore,
} from "./completion";
import { emptyHistory, nextMessage, previousMessage, recordSent } from "./history";
import { applyOverflowMode, keepsReplyPrefix, replyBody, splitAtLimit, textWithReplyPrefix, textWithoutReplyPrefix } from "./reply";

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
        expect(popupQuery("hey :")).toEqual({ kind: "emote", query: "", start: 4, end: 5 });
        expect(popupQuery("hey @fo")).toEqual({ kind: "user", query: "fo", start: 4, end: 7 });
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

describe("completion at the cursor (ResizingTextEdit::textUnderCursor)", () => {
    const complete = (word: string) => completions.filter((entry) => entry.text.toLowerCase().startsWith(word.toLowerCase()));

    test("completes the word before the cursor and keeps the rest", () => {
        const cycle = startTabCycle("hi LU there", complete, false, 5);
        expect(cycle && tabCycleText(cycle)).toBe("hi LUL  there");
        expect(cycle && tabCycleCursor(cycle)).toBe(7);
        expect(wordBefore("ab cd ef", 5)).toEqual({ start: 3, word: "cd" });
    });

    test("the popup query uses the cursor too", () => {
        expect(popupQuery("hey :pe there", 7)).toEqual({ kind: "emote", query: "pe", start: 4, end: 7 });
        expect(popupQuery("hey :pe there", 13)).toBeUndefined();
        expect(replaceRange("hey :pe there", 4, 7, "Pepe ")).toEqual({ text: "hey Pepe  there", cursor: 9 });
    });

    test("emote popup inserts at the cursor with a leading space when needed", () => {
        expect(insertAt("ab", 1, "Kappa")).toEqual({ text: "a Kappa b", cursor: 8 });
        expect(insertAt("a b", 2, "Kappa")).toEqual({ text: "a Kappa b", cursor: 8 });
    });
});

describe("caret tracking from edits and keys", () => {
    test("typing and deleting anywhere puts the caret after the change", () => {
        expect(caretAfterEdit("hello world", "hello, world")).toBe(6);
        expect(caretAfterEdit("hello world", "hello worl")).toBe(10);
        expect(caretAfterEdit("hello world", "hllo world")).toBe(1);
        expect(caretAfterEdit("", "abc")).toBe(3);
        expect(caretAfterEdit("aaa", "aaaa")).toBe(4);
    });

    test("arrows, word jumps, Home and End", () => {
        expect(caretAfterKey("ab cd", 5, { key: "ArrowLeft" })).toBe(4);
        expect(caretAfterKey("ab cd", 5, { key: "ArrowLeft", ctrlKey: true })).toBe(3);
        expect(caretAfterKey("ab cd", 0, { key: "ArrowRight", ctrlKey: true })).toBe(2);
        expect(caretAfterKey("ab cd", 2, { key: "Home" })).toBe(0);
        expect(caretAfterKey("ab cd", 2, { key: "End" })).toBe(5);
        expect(caretAfterKey("ab cd", 2, { key: "a" })).toBeUndefined();
    });
});

describe("reply mode (SplitInput::setReply)", () => {
    test("prefixes @name and strips an existing mention", () => {
        expect(textWithReplyPrefix("", "Forsen")).toBe("@Forsen ");
        expect(textWithReplyPrefix("hello", "Forsen")).toBe("@Forsen hello ");
        expect(textWithReplyPrefix("@Forsen, hi", "Forsen")).toBe("@Forsen hi ");
        expect(textWithReplyPrefix("@ForsenFan hi", "Forsen")).toBe("@Forsen @ForsenFan hi ");
    });

    test("the reply ends when the prefix is broken", () => {
        expect(keepsReplyPrefix("@Forsen hi", "Forsen")).toBe(true);
        expect(keepsReplyPrefix("@Forsen", "Forsen")).toBe(true);
        expect(keepsReplyPrefix("@Forse hi", "Forsen")).toBe(false);
        expect(keepsReplyPrefix("@ForsenX", "Forsen")).toBe(false);
    });

    test("cancelling removes the prefix, sending strips it", () => {
        expect(textWithoutReplyPrefix("@Forsen hello ", "Forsen")).toBe("hello");
        expect(replyBody("@Forsen hello\nthere", "Forsen")).toBe("hello there");
        expect(replyBody("@Forsen", "Forsen")).toBe("");
    });

    test("500 character limit", () => {
        const long = "a".repeat(503);
        expect(splitAtLimit(long)).toEqual({ allowed: "a".repeat(500), overflow: "aaa" });
        expect(applyOverflowMode(long, "prevent")).toHaveLength(500);
        expect(applyOverflowMode(long, "highlight")).toHaveLength(503);
    });
});
