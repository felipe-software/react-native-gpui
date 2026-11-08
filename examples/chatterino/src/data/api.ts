import type { ChatListMessage, ChatListMessagePatch } from "react-native-gpui";

export type ThemeName = "white" | "light" | "dark" | "black";

export type HighlightPhrase = {
    pattern: string;
    isRegex: boolean;
    caseSensitive: boolean;
    color?: string;
    playSound: boolean;
    alert: boolean;
    showInMentions: boolean;
};

export type HighlightUser = {
    login: string;
    color?: string;
    playSound: boolean;
    alert: boolean;
    showInMentions: boolean;
};

export type IgnoredPhrase = {
    pattern: string;
    isRegex: boolean;
    caseSensitive: boolean;
    replaceWith?: string;
};

export type Settings = {
    theme: ThemeName;
    fontFamily?: string;
    fontSize: number;
    showTimestamps: boolean;
    timestampFormat: string;
    showBadges: boolean;
    emoteScale: number;
    animateEmotes: boolean;
    showMessageSeparators: boolean;
    alternateMessageBackground: boolean;
    pauseChatOnHover: boolean;
    loadHistoryOnJoin: boolean;
    historyLimit: number;
    messageLimit: number;
    highlightSelfMentions: boolean;
    highlightPhrases: HighlightPhrase[];
    highlightUsers: HighlightUser[];
    ignoredUsers: string[];
    ignoredPhrases: IgnoredPhrase[];
    mentionSound: boolean;
    mentionNotification: boolean;
    liveNotifications: boolean;
    streamerMode: "off" | "on" | "auto";
    showLinkPreviews: boolean;
    showDeletedMessages: boolean;
};

export type SplitLeaf = { type: "split"; id: string; channel: string };

export type SplitContainer = {
    type: "container";
    id: string;
    direction: "horizontal" | "vertical";
    children: SplitNode[];
    sizes: number[];
};

export type SplitNode = SplitLeaf | SplitContainer;

export type TabLayout = {
    id: string;
    title?: string;
    root: SplitNode | null;
    focusedSplitId?: string;
};

export type WindowLayout = {
    tabs: TabLayout[];
    selectedTabId: string;
};

export type Account = {
    login: string;
    userId: string;
    clientId: string;
    token: string;
    scopes: string[];
};

export type AccountsState = {
    accounts: Account[];
    current?: string;
};

export type ConnectionStatus = {
    connected: boolean;
    anonymous: boolean;
    login?: string;
};

export type ChannelModes = {
    slowSeconds?: number;
    subOnly?: boolean;
    emoteOnly?: boolean;
    followersOnlyMinutes?: number;
    r9k?: boolean;
};

export type LiveStatus = {
    live: boolean;
    title?: string;
    game?: string;
    viewers?: number;
    startedAt?: number;
};

export type ChannelInfo = {
    name: string;
    displayName?: string;
    roomId?: string;
    connected: boolean;
    modes: ChannelModes;
    live?: LiveStatus;
};

export type ChannelEvent =
    | { type: "append"; messages: ChatListMessage[] }
    | { type: "prepend"; messages: ChatListMessage[] }
    | { type: "update"; patches: ChatListMessagePatch[] }
    | { type: "clear" }
    | { type: "info"; info: ChannelInfo };

export type EmoteProvider = "twitch" | "bttv" | "ffz" | "7tv" | "emoji";

export type EmoteInfo = {
    name: string;
    url: string;
    tooltipImage?: string;
    width: number;
    height: number;
    provider: EmoteProvider;
    scope: "global" | "channel" | "subscriber" | "follower";
    zeroWidth?: boolean;
    animated?: boolean;
};

export type Completion = {
    text: string;
    display: string;
    kind: "emote" | "user" | "command";
    emote?: EmoteInfo;
};

export type UserInfo = {
    login: string;
    displayName: string;
    id?: string;
    avatarUrl?: string;
    bio?: string;
    createdAt?: number;
    followers?: number;
    followedAt?: number;
    color?: string;
    banned?: boolean;
};

export type SendResult = { ok: true } | { ok: false; reason: string };

export interface Store<T> {
    get(): T;
    set(next: T | ((current: T) => T)): void;
    subscribe(listener: (value: T) => void): () => void;
}

export interface Channel {
    readonly name: string;
    info(): ChannelInfo;
    snapshot(): ChatListMessage[];
    subscribe(listener: (event: ChannelEvent) => void): () => void;
    send(text: string): Promise<SendResult>;
    emotes(): EmoteInfo[];
    complete(word: string, atStartOfMessage: boolean): Completion[];
    userMessages(login: string): ChatListMessage[];
    search(query: string): ChatListMessage[];
    clear(): void;
}

export interface ChatCore {
    readonly settings: Store<Settings>;
    readonly layout: Store<WindowLayout>;
    readonly accounts: Store<AccountsState>;
    readonly status: Store<ConnectionStatus>;
    readonly mentions: Channel;
    join(name: string): Channel;
    leave(name: string): void;
    globalEmotes(): EmoteInfo[];
    userInfo(login: string, channel?: string): Promise<UserInfo>;
    addAccount(token: string): Promise<Account>;
    removeAccount(login: string): void;
    selectAccount(login?: string): void;
    dispose(): void;
}
