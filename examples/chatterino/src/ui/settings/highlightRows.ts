import type { HighlightBadge, HighlightPhrase, HighlightUser, Settings } from "../../data/api";
import {
    COLOR_AUTOMOD,
    COLOR_ELEVATED,
    COLOR_FIRST_MESSAGE,
    COLOR_REDEEMED,
    COLOR_SELF_HIGHLIGHT,
    COLOR_SELF_MESSAGE,
    COLOR_SUBSCRIPTION,
    COLOR_THREAD,
    COLOR_WATCH_STREAK,
} from "../../data/filters/highlights";

type BoolKey = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
type StringKey = { [K in keyof Settings]-?: Settings[K] extends string ? K : never }[keyof Settings];

export type BuiltinRow = {
    label: string;
    enabled: BoolKey;
    mentions?: BoolKey;
    taskbar?: BoolKey;
    sound?: BoolKey;
    soundUrl?: StringKey;
    color: StringKey;
    fallbackColor: string;
};

export const MESSAGE_BUILTINS: BuiltinRow[] = [
    {
        label: "Your username (automatic)",
        enabled: "highlightSelfMentions",
        mentions: "showSelfHighlightInMentions",
        taskbar: "enableSelfHighlightTaskbar",
        sound: "mentionSound",
        soundUrl: "selfHighlightSoundUrl",
        color: "selfHighlightColor",
        fallbackColor: COLOR_SELF_HIGHLIGHT,
    },
    {
        label: "Whispers",
        enabled: "enableWhisperHighlight",
        taskbar: "enableWhisperHighlightTaskbar",
        sound: "enableWhisperHighlightSound",
        soundUrl: "whisperHighlightSoundUrl",
        color: "whisperHighlightColor",
        fallbackColor: COLOR_SELF_HIGHLIGHT,
    },
    {
        label: "Subscriptions",
        enabled: "enableSubHighlight",
        taskbar: "enableSubHighlightTaskbar",
        sound: "enableSubHighlightSound",
        soundUrl: "subHighlightSoundUrl",
        color: "subHighlightColor",
        fallbackColor: COLOR_SUBSCRIPTION,
    },
    { label: "Highlights redeemed with Channel Points", enabled: "enableRedeemedHighlight", color: "redeemedHighlightColor", fallbackColor: COLOR_REDEEMED },
    { label: "First Messages", enabled: "enableFirstMessageHighlight", color: "firstMessageHighlightColor", fallbackColor: COLOR_FIRST_MESSAGE },
    { label: "Hype Chats", enabled: "enableElevatedMessageHighlight", color: "elevatedMessageHighlightColor", fallbackColor: COLOR_ELEVATED },
    {
        label: "Subscribed Reply Threads",
        enabled: "enableThreadHighlight",
        mentions: "showThreadHighlightInMentions",
        taskbar: "enableThreadHighlightTaskbar",
        sound: "enableThreadHighlightSound",
        soundUrl: "threadHighlightSoundUrl",
        color: "threadHighlightColor",
        fallbackColor: COLOR_THREAD,
    },
    {
        label: "AutoMod Caught Messages",
        enabled: "enableAutomodHighlight",
        mentions: "showAutomodInMentions",
        taskbar: "enableAutomodHighlightTaskbar",
        sound: "enableAutomodHighlightSound",
        soundUrl: "automodHighlightSoundUrl",
        color: "automodHighlightColor",
        fallbackColor: COLOR_AUTOMOD,
    },
    { label: "Watch Streaks", enabled: "enableWatchStreakHighlight", color: "watchStreakHighlightColor", fallbackColor: COLOR_WATCH_STREAK },
];

export const USER_BUILTINS: BuiltinRow[] = [
    {
        label: "Your messages (automatic)",
        enabled: "enableSelfMessageHighlight",
        mentions: "showSelfMessageHighlightInMentions",
        color: "selfMessageHighlightColor",
        fallbackColor: COLOR_SELF_MESSAGE,
    },
];

export type MessageRow = { kind: "builtin"; row: BuiltinRow } | { kind: "phrase"; phrase: HighlightPhrase };
export type UserRow = { kind: "builtin"; row: BuiltinRow } | { kind: "user"; user: HighlightUser };

export const AVAILABLE_BADGES: Array<{ displayName: string; name: string }> = [
    { displayName: "Broadcaster", name: "broadcaster" },
    { displayName: "Admin", name: "admin" },
    { displayName: "Staff", name: "staff" },
    { displayName: "Moderator", name: "moderator" },
    { displayName: "Lead Moderator", name: "lead_moderator" },
    { displayName: "Verified", name: "partner" },
    { displayName: "VIP", name: "vip" },
    { displayName: "Founder", name: "founder" },
    { displayName: "Subscriber", name: "subscriber" },
    { displayName: "Predicted Blue", name: "predictions/blue-1,predictions/blue-2" },
    { displayName: "Predicted Pink", name: "predictions/pink-2,predictions/pink-1" },
];

export function newPhrase(color: string): HighlightPhrase {
    return { pattern: "my phrase", showInMentions: true, alert: true, playSound: false, isRegex: false, caseSensitive: false, color };
}

export function newHighlightUser(color: string): HighlightUser {
    return { login: "highlighted user", showInMentions: true, alert: true, playSound: false, color };
}

export function newHighlightBadge(badge: { displayName: string; name: string }, color: string): HighlightBadge {
    return { name: badge.name, displayName: badge.displayName, showInMentions: false, alert: false, playSound: false, color };
}

export function fileName(path: string | undefined): string {
    if (!path) return "";
    const clean = path.replace(/^file:\/\//, "");
    return clean.slice(clean.lastIndexOf("/") + 1);
}

export const HIGHLIGHT_LABELS = {
    messages: "Play notification sounds and highlight messages based on certain patterns.\nMessage highlights are prioritized over badge highlights and user highlights.",
    users: "Play notification sounds and highlight messages from certain users.\nUser highlights are prioritized over badge highlights, but under message highlights.",
    badges: "Play notification sounds and highlight messages based on user badges.\nBadge highlights are prioritzed under user and message highlights.",
    blacklist: "Disable notification sounds and highlights from certain users (e.g. bots).",
    alwaysPlay: "Play highlight sound even when Chatterino is focused",
    longAlerts: "Flash taskbar only stops highlighting when Chatterino is focused",
};

export function defaultSoundLabel(path: string): string {
    return path ? `Default sound: ${fileName(path)}` : "Default sound: Chatterino Ping";
}
