import { matchCheer, type CheermoteSet } from "../emotes/cheermotes";
import { parseEmoji } from "../emotes/emoji";
import { twitchEmote } from "../emotes/twitch";
import type { Emote } from "../emotes/types";
import type { EmoteOccurrence } from "../filters/ignores";
import type { PieceBuilder } from "./builder";
import type { Tint } from "./model";

export type WordContext = {
    textTint: Tint;
    lookupEmote(name: string): Emote | undefined;
    userColor(login: string): string | undefined;
    cheermotes: CheermoteSet[];
    bits: number;
};

type CheerState = { bitsLeft: number; hasBits: boolean };

const MENTION_RE = /^@(\w+)[.,!?;:]*?$/u;

function tryCheer(builder: PieceBuilder, word: string, ctx: WordContext, state: CheerState): boolean {
    if (!state.hasBits || state.bitsLeft <= 0) return false;
    const match = matchCheer(ctx.cheermotes, word);
    if (!match) return false;
    if (match.amount > state.bitsLeft) {
        const prefixLength = word.length - String(match.amount).length;
        const reduced = word.slice(0, prefixLength) + String(match.amount - state.bitsLeft);
        return tryCheer(builder, reduced, ctx, state);
    }
    state.bitsLeft -= match.amount;
    builder.emote(match.tier.image, false);
    builder.text(String(match.amount), match.tier.color as Tint);
    return true;
}

function tryMention(builder: PieceBuilder, word: string, ctx: WordContext): boolean {
    if (!word.startsWith("@")) return false;
    const match = MENTION_RE.exec(word);
    if (!match) return false;
    const username = match[1];
    const color = ctx.userColor(username.toLowerCase());
    const tint = (color as Tint | undefined) ?? ctx.textTint;
    const mention = `@${username}`;
    const remainder = word.slice(mention.length);
    builder.user(mention, username.toLowerCase(), tint, true);
    if (remainder) {
        builder.noSpaceAfterLast();
        builder.text(remainder, ctx.textTint);
    }
    return true;
}

function addTextOrEmote(builder: PieceBuilder, word: string, ctx: WordContext, state: CheerState): void {
    if (tryCheer(builder, word, ctx, state)) return;
    const emote = ctx.lookupEmote(word);
    if (emote) {
        builder.emote(emote, true);
        return;
    }
    if (builder.link(word, ctx.textTint)) return;
    if (tryMention(builder, word, ctx)) return;
    builder.appendText(word, ctx.textTint);
}

function addSegments(builder: PieceBuilder, text: string, ctx: WordContext, state: CheerState): void {
    for (const segment of parseEmoji(text)) {
        if (typeof segment === "string") addTextOrEmote(builder, segment, ctx, state);
        else builder.emote(segment, false);
    }
}

export function addWords(
    builder: PieceBuilder,
    content: string,
    twitchEmotes: EmoteOccurrence[],
    ctx: WordContext,
): void {
    const state: CheerState = { bitsLeft: ctx.bits, hasBits: ctx.bits > 0 };
    let cursor = 0;
    let emoteIndex = 0;
    for (const original of content.split(" ")) {
        let word = original;
        if (!word) {
            cursor++;
            continue;
        }
        while (emoteIndex < twitchEmotes.length) {
            const occurrence = twitchEmotes[emoteIndex];
            const wordEnd = cursor + word.length;
            const fits = occurrence.start >= cursor && occurrence.end < wordEnd;
            if (!fits) break;
            if (occurrence.start === cursor) {
                builder.emote(twitchEmote(occurrence.id, occurrence.name), false);
                const length = occurrence.name.length;
                cursor += length;
                word = word.slice(length);
                emoteIndex++;
                if (!word) break;
                builder.noSpaceAfterLast();
                continue;
            }
            const preText = word.slice(0, occurrence.start - cursor);
            addSegments(builder, preText, ctx, state);
            cursor += preText.length;
            word = word.slice(preText.length);
        }
        if (!word) {
            cursor++;
            continue;
        }
        addSegments(builder, word, ctx, state);
        cursor += word.length + 1;
    }
}
