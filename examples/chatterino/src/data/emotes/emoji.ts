import type { EmojiStyle } from "../api";
import { EMOJI_DATA } from "./emoji-data";
import type { Emote } from "./types";

const IMAGE_BASE = "https://pajbot.com/static/emoji-v2/img/twitter/64/";
const DISPLAY_SIZE = 64 * 0.35;

type EmojiEntry = { sequence: string; emote: Emote };

type EmojiIndex = { byFirstChar: Map<string, EmojiEntry[]>; byShortCode: Map<string, Emote>; all: Emote[] };

let index: EmojiIndex | undefined;

function sequenceFromHex(hex: string): string {
    return String.fromCodePoint(...hex.split("-").map((part) => parseInt(part, 16)));
}

function firstChar(sequence: string): string {
    return String.fromCodePoint(sequence.codePointAt(0) as number);
}

function buildIndex(): EmojiIndex {
    const byFirstChar = new Map<string, EmojiEntry[]>();
    const byShortCode = new Map<string, Emote>();
    const all: Emote[] = [];
    const add = (sequence: string, emote: Emote) => {
        const key = firstChar(sequence);
        const list = byFirstChar.get(key);
        if (list) list.push({ sequence, emote });
        else byFirstChar.set(key, [{ sequence, emote }]);
    };
    for (const line of EMOJI_DATA.split("\n")) {
        const [unified, nonQualified, shortCode] = line.split("|");
        if (!unified) continue;
        const value = sequenceFromHex(unified);
        const url = `${IMAGE_BASE}${unified}.png`;
        const emote: Emote = {
            id: unified,
            name: value,
            url,
            tooltipImage: url,
            width: DISPLAY_SIZE,
            height: DISPLAY_SIZE,
            provider: "emoji",
            scope: "global",
            tooltip: `:${shortCode}:\nEmoji`,
        };
        all.push(emote);
        byShortCode.set(shortCode, emote);
        add(value, emote);
        if (nonQualified) add(sequenceFromHex(nonQualified), emote);
    }
    for (const list of byFirstChar.values()) list.sort((a, b) => b.sequence.length - a.sequence.length);
    return { byFirstChar, byShortCode, all };
}

function getIndex(): EmojiIndex {
    if (!index) index = buildIndex();
    return index;
}

export type EmojiSegment = string | Emote;

const MAYBE_EMOJI = /[©®‼-㊙\ud83c-\ud83e#*0-9]/;

export function parseEmoji(text: string): EmojiSegment[] {
    if (!MAYBE_EMOJI.test(text)) return [text];
    const { byFirstChar } = getIndex();
    const segments: EmojiSegment[] = [];
    let plainStart = 0;
    let i = 0;
    while (i < text.length) {
        const codePoint = text.codePointAt(i) as number;
        const char = String.fromCodePoint(codePoint);
        const candidates = byFirstChar.get(char);
        const match = candidates?.find((entry) => text.startsWith(entry.sequence, i));
        if (!match) {
            i += char.length;
            continue;
        }
        if (i > plainStart) segments.push(text.slice(plainStart, i));
        segments.push(match.emote);
        i += match.sequence.length;
        plainStart = i;
    }
    if (plainStart < text.length) segments.push(text.slice(plainStart));
    return segments;
}

export function emojiByShortCode(shortCode: string): Emote | undefined {
    return getIndex().byShortCode.get(shortCode);
}

export function emojiShortCodes(): Array<[string, Emote]> {
    return [...getIndex().byShortCode.entries()];
}

export function emojiUrl(url: string, style: EmojiStyle): string {
    if (style === "twitter") return url;
    return url.replace("/emoji-v2/img/twitter/", `/emoji-v2/img/${style}/`);
}
