import type { Completion, EmoteInfo } from "../../data/api";

export const MIN_TAB_WORD = 2;
export const POPUP_LIMIT = 200;

export type WordAtEnd = { start: number; word: string };

export function wordBefore(text: string, cursor: number): WordAtEnd {
    const head = text.slice(0, cursor);
    const start = head.lastIndexOf(" ") + 1;
    return { start, word: head.slice(start) };
}

export function wordAtEnd(text: string): WordAtEnd {
    return wordBefore(text, text.length);
}

export function isFirstWord(text: string, start: number): boolean {
    return text.slice(0, start).trim().length === 0;
}

export type TabCycle = { prefix: string; suffix: string; candidates: Completion[]; index: number };

export function startTabCycle(
    text: string,
    complete: (word: string, atStartOfMessage: boolean) => Completion[],
    backwards = false,
    cursor = text.length,
): TabCycle | undefined {
    const { start, word } = wordBefore(text, cursor);
    if (word.length < MIN_TAB_WORD) return undefined;
    const candidates = complete(word, isFirstWord(text, start));
    if (candidates.length === 0) return undefined;
    const index = backwards ? candidates.length - 1 : 0;
    return { prefix: text.slice(0, start), suffix: text.slice(cursor), candidates, index };
}

export function stepTabCycle(cycle: TabCycle, step: 1 | -1): TabCycle {
    const count = cycle.candidates.length;
    return { ...cycle, index: (cycle.index + step + count) % count };
}

export function tabCycleText(cycle: TabCycle): string {
    return cycle.prefix + cycle.candidates[cycle.index].text + cycle.suffix;
}

export function tabCycleCursor(cycle: TabCycle): number {
    return cycle.prefix.length + cycle.candidates[cycle.index].text.length;
}

export type PopupQuery = { kind: "emote" | "user"; query: string; start: number; end: number };

export function popupQuery(text: string, cursor = text.length): PopupQuery | undefined {
    const { start, word } = wordBefore(text, cursor);
    if (word.startsWith(":")) return { kind: "emote", query: word.slice(1), start, end: cursor };
    if (word.startsWith("@") && word.length > 1) return { kind: "user", query: word.slice(1), start, end: cursor };
    return undefined;
}

export type Replacement = { text: string; cursor: number };

export function replaceRange(text: string, start: number, end: number, insertion: string): Replacement {
    return { text: text.slice(0, start) + insertion + text.slice(end), cursor: start + insertion.length };
}

const PROVIDER_NAMES: Record<EmoteInfo["provider"], string> = {
    twitch: "Twitch",
    bttv: "BetterTTV",
    ffz: "FrankerFaceZ",
    "7tv": "7TV",
    emoji: "Emoji",
};

export function providerLabel(emote: EmoteInfo): string {
    if (emote.provider === "emoji") return "Emoji";
    if (emote.provider === "twitch") return emote.scope === "follower" ? "Local Twitch Emotes" : "Twitch Emote";
    const scope = emote.scope === "channel" ? "Channel" : "Global";
    return `${scope} ${PROVIDER_NAMES[emote.provider]}`;
}

export function filterEmotes(emotes: EmoteInfo[], rawQuery: string, limit = POPUP_LIMIT): EmoteInfo[] {
    const zeroWidthOnly = rawQuery.startsWith("~");
    const query = (zeroWidthOnly ? rawQuery.slice(1) : rawQuery).toLowerCase();
    const seen = new Set<string>();
    const exact: EmoteInfo[] = [];
    const matches: EmoteInfo[] = [];
    for (const emote of emotes) {
        if (seen.has(emote.name)) continue;
        if (zeroWidthOnly && !emote.zeroWidth) continue;
        const name = emote.name.toLowerCase();
        if (!name.includes(query)) continue;
        seen.add(emote.name);
        if (name === query) exact.push(emote);
        else matches.push(emote);
    }
    matches.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return [...exact, ...matches].slice(0, limit);
}

export function insertWithSpacing(text: string, insertion: string): string {
    return insertAt(text, text.length, insertion).text;
}

export function insertAt(text: string, cursor: number, insertion: string): Replacement {
    const before = text.slice(0, cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const separator = needsSpace ? " " : "";
    return replaceRange(text, cursor, cursor, `${separator}${insertion} `);
}
