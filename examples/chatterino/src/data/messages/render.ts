import type { ChatListElement, ChatListMessage } from "react-native-gpui";
import type { Settings, ThemeName } from "../api";
import { emojiUrl } from "../emotes/emoji";
import type { Emote } from "../emotes/types";
import {
    colorOr,
    COLOR_ELEVATED,
    COLOR_FIRST_MESSAGE,
    COLOR_SELF_HIGHLIGHT,
    COLOR_REDEEMED,
    COLOR_SUBSCRIPTION,
    COLOR_WATCH_STREAK,
} from "../filters/highlights";
import { badgeGroupVisible } from "./privmsg";
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
    settings?: Settings;
    streamerMode?: boolean;
    ignoreHighlights?: boolean;
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

function showsThumbnails(options: RenderOptions): boolean {
    return options.settings?.emotesTooltipPreview !== "dontShow";
}

function emoteElement(emote: Emote, zeroWidth: boolean, noSpace: boolean, options: RenderOptions): ChatListElement {
    if (options.settings?.enableEmoteImages === false) {
        const text: ChatListElement = { kind: "text", text: emote.name };
        if (noSpace) text.trailingSpace = false;
        return text;
    }
    const style = options.settings?.emojiSet ?? "twitter";
    const isEmoji = emote.provider === "emoji";
    const url = isEmoji ? emojiUrl(emote.url, style) : emote.url;
    const element: ChatListElement = {
        kind: "emote",
        name: emote.name,
        url,
        width: emote.width,
        height: emote.height,
        tooltip: emote.tooltip,
    };
    const tooltipImage = emote.tooltipImage && isEmoji ? emojiUrl(emote.tooltipImage, style) : emote.tooltipImage;
    if (tooltipImage && showsThumbnails(options)) element.tooltipImage = tooltipImage;
    if (emote.homePage) element.link = emote.homePage;
    if (zeroWidth) element.zeroWidth = true;
    if (noSpace) element.trailingSpace = false;
    return element;
}

function nextIsEmote(pieces: Piece[], index: number): boolean {
    return pieces[index + 1]?.kind === "emote";
}

function pieceElements(piece: Piece, options: RenderOptions, out: ChatListElement[], beforeEmote = false): void {
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
            const mention = piece.mention;
            const colorMentions = options.settings?.colorUsernames !== false;
            const boldMentions = options.settings?.boldUsernames !== false;
            const tint = mention && !colorMentions ? mention.fallback : piece.tint;
            const bold = mention ? boldMentions : !!piece.bold;
            const element: ChatListElement = { kind: "user", text: piece.text, login: piece.login, bold };
            const color = resolveTint(tint, options.theme);
            if (color) element.color = color;
            if (piece.noSpace) element.trailingSpace = false;
            out.push(element);
            return;
        }
        case "emote": {
            const removeSpace = !!options.settings?.removeSpacesBetweenEmotes && beforeEmote;
            const layers = piece.layers ?? [];
            const lastIndex = layers.length;
            out.push(emoteElement(piece.emote, false, !!piece.noSpace || (removeSpace && lastIndex === 0), options));
            layers.forEach((layer, index) => out.push(emoteElement(layer, true, removeSpace && index === lastIndex - 1, options)));
            return;
        }
        case "badge": {
            if (!options.showBadges) return;
            if (options.settings && !badgeGroupVisible(piece.group, options.settings)) return;
            const { badge } = piece;
            const element: ChatListElement = {
                kind: "badge",
                name: badge.name,
                url: badge.url,
                width: badge.width,
                height: badge.height,
                tooltip: piece.tooltip,
            };
            if (badge.tooltipImage && showsThumbnails(options)) element.tooltipImage = badge.tooltipImage;
            if (badge.background) element.background = badge.background;
            out.push(element);
        }
    }
}

function renderPieces(pieces: Piece[], options: RenderOptions): ChatListElement[] {
    const out: ChatListElement[] = [];
    pieces.forEach((piece, index) => pieceElements(piece, options, out, nextIsEmote(pieces, index)));
    return out;
}

type FlagColors = { elevated?: string; firstMessage?: string; watchStreak?: string; subscription?: string; redeemed?: string };

function flagColors(settings: Settings | undefined): FlagColors {
    if (!settings) {
        return {
            elevated: COLOR_ELEVATED,
            firstMessage: COLOR_FIRST_MESSAGE,
            watchStreak: COLOR_WATCH_STREAK,
            subscription: COLOR_SUBSCRIPTION,
            redeemed: COLOR_REDEEMED,
        };
    }
    const colors: FlagColors = {};
    if (settings.enableElevatedMessageHighlight) colors.elevated = colorOr(settings.elevatedMessageHighlightColor, COLOR_ELEVATED);
    if (settings.enableFirstMessageHighlight) colors.firstMessage = colorOr(settings.firstMessageHighlightColor, COLOR_FIRST_MESSAGE);
    if (settings.enableWatchStreakHighlight) colors.watchStreak = colorOr(settings.watchStreakHighlightColor, COLOR_WATCH_STREAK);
    if (settings.enableSubHighlight) colors.subscription = colorOr(settings.subHighlightColor, COLOR_SUBSCRIPTION);
    if (settings.enableRedeemedHighlight) colors.redeemed = colorOr(settings.redeemedHighlightColor, COLOR_REDEEMED);
    return colors;
}

function inlineWhisperColor(message: ChatMessage, settings: Settings | undefined): string | undefined {
    if (!message.flags.receivedWhisper || !settings?.highlightInlineWhispers) return undefined;
    return colorOr(settings.whisperHighlightColor, COLOR_SELF_HIGHLIGHT);
}

function highlightSource(message: ChatMessage, colors: FlagColors): string | undefined {
    const { flags } = message;
    if (flags.elevated && colors.elevated) return colors.elevated;
    if (flags.firstMessage && colors.firstMessage) return colors.firstMessage;
    if (flags.watchStreak && colors.watchStreak) return colors.watchStreak;
    if (flags.highlighted && message.highlightColor) return message.highlightColor;
    if (flags.subscription && colors.subscription) return colors.subscription;
    if (flags.redeemed && colors.redeemed) return colors.redeemed;
    return undefined;
}

const backgroundCache = new Map<string, string | undefined>();

function backgroundColor(message: ChatMessage, theme: ThemeName, colors: FlagColors, override?: string): string | undefined {
    const source = highlightSource(message, colors) ?? override;
    if (!source) return undefined;
    const key = `${theme}|${source}`;
    if (backgroundCache.has(key)) return backgroundCache.get(key);
    const base = parseColor(themePalette(theme).background);
    const highlight = parseColor(source);
    const blended = base && highlight ? formatColor(blendColors(base, highlight)) : undefined;
    backgroundCache.set(key, blended);
    return blended;
}

function markerSource(message: ChatMessage, colors: FlagColors): string | undefined {
    const { flags } = message;
    if (flags.highlighted && message.highlightColor) return message.highlightColor;
    if (flags.watchStreak) return colors.watchStreak;
    if (flags.subscription) return colors.subscription;
    if (flags.redeemed) return colors.redeemed;
    if (flags.elevated) return colors.elevated;
    if (flags.firstMessage) return colors.firstMessage;
    return undefined;
}

function markerColor(message: ChatMessage, colors: FlagColors): string | undefined {
    const parsed = parseColor(markerSource(message, colors));
    return parsed ? formatColor(opaque(parsed)) : undefined;
}

function isHiddenModeration(message: ChatMessage, options: RenderOptions): boolean {
    const settings = options.settings;
    if (!settings || !message.flags.moderation) return false;
    const isDeletion = !!message.timeoutUser?.startsWith("msg:");
    if (isDeletion) return settings.hideDeletionActions;
    const hideForStreamer = !!options.streamerMode && settings.streamerModeHideModActions;
    return settings.hideModerationActions || hideForStreamer;
}

function isHidden(message: ChatMessage, options: RenderOptions): boolean {
    if (message.flags.disabled && options.hideModerated) return true;
    if (message.flags.similar && options.settings?.hideSimilar) return true;
    return isHiddenModeration(message, options);
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
    const showReply = !options.settings?.hideReplyContext;
    if (showReply && message.reply && message.reply.length > 0) rendered.reply = renderPieces(message.reply, options);
    const colors = flagColors(options.settings);
    const whisperColor = inlineWhisperColor(message, options.settings);
    const background = options.ignoreHighlights ? undefined : backgroundColor(message, options.theme, colors, whisperColor);
    if (background) rendered.background = background;
    const marker = options.settings?.hideScrollbarHighlights ? undefined : markerColor(message, colors);
    if (marker) rendered.marker = marker;
    if (message.flags.disabled) rendered.disabled = true;
    if (isHidden(message, options)) rendered.hidden = true;
    if (message.flags.historical) rendered.historical = true;
    return rendered;
}
