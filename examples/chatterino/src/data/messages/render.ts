import type { ChatListElement, ChatListMessage } from "react-native-gpui";
import type { ThemeName } from "../api";
import type { Emote } from "../emotes/types";
import {
    COLOR_ELEVATED,
    COLOR_FIRST_MESSAGE,
    COLOR_REDEEMED,
    COLOR_SUBSCRIPTION,
    COLOR_WATCH_STREAK,
} from "../filters/highlights";
import { channelLink } from "../links/internal";
import { themePalette } from "../theme";
import { blendColors, formatColor, normalizeColor, opaque, parseColor } from "../util/colors";
import { formatTimestamp } from "../util/time";
import type { ChatMessage, Piece, Tint } from "./model";

export type RenderOptions = {
    theme: ThemeName;
    timestampFormat: string;
    showBadges: boolean;
    showChannelName: boolean;
    hideModerated: boolean;
};

const tintCache = new Map<string, string | undefined>();

function baseColor(tint: Tint, theme: ThemeName): string {
    const palette = themePalette(theme);
    if (tint === "system") return palette.system;
    if (tint === "link") return palette.link;
    if (tint === "text") return palette.text;
    return tint;
}

export function resolveTint(tint: Tint, theme: ThemeName): string | undefined {
    if (tint === "text") return undefined;
    const key = `${theme}|${tint}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const palette = themePalette(theme);
    const parsed = parseColor(baseColor(tint, theme));
    const resolved = parsed ? formatColor(normalizeColor(parsed, palette.isLight)) : undefined;
    tintCache.set(key, resolved);
    return resolved;
}

function emoteElement(emote: Emote, zeroWidth: boolean, noSpace = false): ChatListElement {
    const element: ChatListElement = {
        kind: "emote",
        name: emote.name,
        url: emote.url,
        width: emote.width,
        height: emote.height,
        tooltip: emote.tooltip,
    };
    if (emote.tooltipImage) element.tooltipImage = emote.tooltipImage;
    if (emote.homePage) element.link = emote.homePage;
    if (zeroWidth) element.zeroWidth = true;
    if (noSpace) element.trailingSpace = false;
    return element;
}

function pieceElements(piece: Piece, options: RenderOptions, out: ChatListElement[]): void {
    switch (piece.kind) {
        case "text": {
            const element: ChatListElement = { kind: "text", text: piece.text };
            const color = resolveTint(piece.tint, options.theme);
            if (color) element.color = color;
            if (piece.bold) element.bold = true;
            if (piece.italic) element.italic = true;
            if (piece.link) element.link = piece.link;
            if (piece.noSpace) element.trailingSpace = false;
            out.push(element);
            return;
        }
        case "user": {
            const element: ChatListElement = { kind: "user", text: piece.text, login: piece.login, bold: !!piece.bold };
            const color = resolveTint(piece.tint, options.theme);
            if (color) element.color = color;
            if (piece.noSpace) element.trailingSpace = false;
            out.push(element);
            return;
        }
        case "emote":
            out.push(emoteElement(piece.emote, false, !!piece.noSpace));
            for (const layer of piece.layers ?? []) out.push(emoteElement(layer, true));
            return;
        case "badge": {
            if (!options.showBadges) return;
            const { badge } = piece;
            const element: ChatListElement = {
                kind: "badge",
                name: badge.name,
                url: badge.url,
                width: badge.width,
                height: badge.height,
                tooltip: piece.tooltip,
            };
            if (badge.tooltipImage) element.tooltipImage = badge.tooltipImage;
            if (badge.background) element.background = badge.background;
            out.push(element);
        }
    }
}

function renderPieces(pieces: Piece[], options: RenderOptions): ChatListElement[] {
    const out: ChatListElement[] = [];
    for (const piece of pieces) pieceElements(piece, options, out);
    return out;
}

function highlightSource(message: ChatMessage): string | undefined {
    const { flags } = message;
    if (flags.elevated) return COLOR_ELEVATED;
    if (flags.firstMessage) return COLOR_FIRST_MESSAGE;
    if (flags.watchStreak) return COLOR_WATCH_STREAK;
    if (flags.highlighted && message.highlightColor) return message.highlightColor;
    if (flags.subscription) return COLOR_SUBSCRIPTION;
    if (flags.redeemed) return COLOR_REDEEMED;
    return undefined;
}

const backgroundCache = new Map<string, string | undefined>();

function backgroundColor(message: ChatMessage, theme: ThemeName): string | undefined {
    const source = highlightSource(message);
    if (!source) return undefined;
    const key = `${theme}|${source}`;
    if (backgroundCache.has(key)) return backgroundCache.get(key);
    const base = parseColor(themePalette(theme).background);
    const highlight = parseColor(source);
    const blended = base && highlight ? formatColor(blendColors(base, highlight)) : undefined;
    backgroundCache.set(key, blended);
    return blended;
}

function markerSource(message: ChatMessage): string | undefined {
    const { flags } = message;
    if (flags.highlighted && message.highlightColor) return message.highlightColor;
    if (flags.watchStreak) return COLOR_WATCH_STREAK;
    if (flags.subscription) return COLOR_SUBSCRIPTION;
    if (flags.redeemed) return COLOR_REDEEMED;
    if (flags.elevated) return COLOR_ELEVATED;
    if (flags.firstMessage) return COLOR_FIRST_MESSAGE;
    return undefined;
}

function markerColor(message: ChatMessage): string | undefined {
    const parsed = parseColor(markerSource(message));
    return parsed ? formatColor(opaque(parsed)) : undefined;
}

export function renderMessage(message: ChatMessage, options: RenderOptions): ChatListMessage {
    const elements: ChatListElement[] = [];
    const showChannel = options.showChannelName && !message.flags.system;
    if (showChannel) {
        const color = resolveTint("system", options.theme);
        elements.push({ kind: "text", text: `#${message.channel}`, color, link: channelLink(message.channel) });
    }
    elements.push(...renderPieces(message.pieces, options));
    const rendered: ChatListMessage = {
        id: message.id,
        timestamp: formatTimestamp(message.time, options.timestampFormat),
        elements,
    };
    if (message.reply && message.reply.length > 0) rendered.reply = renderPieces(message.reply, options);
    const background = backgroundColor(message, options.theme);
    if (background) rendered.background = background;
    const marker = markerColor(message);
    if (marker) rendered.marker = marker;
    if (message.flags.disabled) rendered.disabled = true;
    if (message.flags.disabled && options.hideModerated) rendered.hidden = true;
    if (message.flags.historical) rendered.historical = true;
    return rendered;
}
