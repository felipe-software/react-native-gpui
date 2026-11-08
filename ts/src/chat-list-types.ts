import type { ViewProps } from "./types";

export type ChatListTextElement = {
    kind: "text";
    text: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    link?: string;
    trailingSpace?: boolean;
};

export type ChatListUserElement = {
    kind: "user";
    text: string;
    login: string;
    color?: string;
    bold?: boolean;
    trailingSpace?: boolean;
};

export type ChatListEmoteElement = {
    kind: "emote";
    name: string;
    url: string;
    width: number;
    height: number;
    zeroWidth?: boolean;
    tooltip?: string;
    tooltipImage?: string;
    link?: string;
    trailingSpace?: boolean;
};

export type ChatListBadgeElement = {
    kind: "badge";
    name: string;
    url: string;
    width: number;
    height: number;
    background?: string;
    tooltip?: string;
    tooltipImage?: string;
    trailingSpace?: boolean;
};

export type ChatListElement = ChatListTextElement | ChatListUserElement | ChatListEmoteElement | ChatListBadgeElement;

export type ChatListMessage = {
    id: string;
    timestamp?: string;
    elements: ChatListElement[];
    reply?: ChatListElement[];
    background?: string;
    marker?: string;
    disabled?: boolean;
    historical?: boolean;
    hidden?: boolean;
};

export type ChatListMessagePatch = { id: string } & Partial<Omit<ChatListMessage, "id">>;

export type ChatListTargetKind = "user" | "link" | "emote" | "badge" | "message";

export type ChatListPressEvent = {
    target: ChatListTargetKind;
    messageId: string;
    button: "left" | "right" | "middle";
    x: number;
    y: number;
    login?: string;
    url?: string;
    name?: string;
    link?: string;
    tooltip?: string;
    tooltipImage?: string;
};

export type ChatListHoverEvent = {
    target: Exclude<ChatListTargetKind, "message">;
    messageId: string;
    name?: string;
    tooltip?: string;
    tooltipImage?: string;
    url?: string;
    login?: string;
    link?: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ChatListScrollState = {
    atBottom: boolean;
    paused: boolean;
    unseen: number;
};

export type ChatListProps = ViewProps & {
    fontSize?: number;
    fontFamily?: string;
    textColor?: string;
    mutedColor?: string;
    linkColor?: string;
    selectionColor?: string;
    separatorColor?: string;
    alternateBackground?: string;
    scrollbarColor?: string;
    disabledOpacity?: number;
    historicalOpacity?: number;
    showTimestamps?: boolean;
    emoteScale?: number;
    animateEmotes?: boolean;
    maxMessages?: number;
    pauseOnHover?: boolean;
    onPress?: (event: { nativeEvent: ChatListPressEvent }) => void;
    onHover?: (event: { nativeEvent: ChatListHoverEvent | null }) => void;
    onScrollState?: (event: { nativeEvent: ChatListScrollState }) => void;
};

export interface ChatListHandle {
    append(messages: ChatListMessage[]): void;
    prepend(messages: ChatListMessage[]): void;
    update(patches: ChatListMessagePatch[]): void;
    clear(): void;
    scrollToBottom(): void;
}
