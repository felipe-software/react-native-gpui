import type { Badge, Emote } from "../emotes/types";

export type Tint = "text" | "system" | "link" | `#${string}`;

export type TextPiece = {
    kind: "text";
    text: string;
    tint: Tint;
    bold?: boolean;
    italic?: boolean;
    link?: string;
    noSpace?: boolean;
};

export type UserPiece = {
    kind: "user";
    text: string;
    login: string;
    tint: Tint;
    bold?: boolean;
    noSpace?: boolean;
    mention?: { fallback: Tint };
};

export type EmotePiece = { kind: "emote"; emote: Emote; layers?: Emote[]; noSpace?: boolean };

export type BadgePiece = { kind: "badge"; badge: Badge; tooltip: string; group?: BadgeGroup };

export type BadgeGroup =
    | "globalAuthority"
    | "predictions"
    | "channelAuthority"
    | "subscription"
    | "vanity"
    | "chatterino"
    | "ffz"
    | "bttv"
    | "seventv";

export type Piece = TextPiece | UserPiece | EmotePiece | BadgePiece;

export type MessageFlags = {
    system?: boolean;
    action?: boolean;
    highlighted?: boolean;
    showInMentions?: boolean;
    subscription?: boolean;
    watchStreak?: boolean;
    redeemed?: boolean;
    firstMessage?: boolean;
    elevated?: boolean;
    cheer?: boolean;
    timeout?: boolean;
    clearChat?: boolean;
    moderation?: boolean;
    disabled?: boolean;
    historical?: boolean;
    reply?: boolean;
    connected?: boolean;
    disconnected?: boolean;
    self?: boolean;
    announcement?: boolean;
    doNotNotify?: boolean;
    whisper?: boolean;
    receivedWhisper?: boolean;
    similar?: boolean;
    automod?: boolean;
    join?: boolean;
};

export type ChatMessage = {
    id: string;
    channel: string;
    time: number;
    login: string;
    displayName: string;
    localizedName?: string;
    userId?: string;
    userColor?: string;
    pieces: Piece[];
    reply?: Piece[];
    replyParentId?: string;
    flags: MessageFlags;
    highlightColor?: string;
    text: string;
    searchText: string;
    timeoutUser?: string;
    count: number;
    badges?: string[];
    twitchBadges?: Array<{ key: string; value: string }>;
    badgeInfos?: Record<string, string>;
    rewardTitle?: string;
    rewardCost?: number;
    rewardId?: string;
    alert?: HighlightAlert;
};

export type HighlightAlert = { playSound: boolean; windowAlert: boolean; soundUrl?: string };
