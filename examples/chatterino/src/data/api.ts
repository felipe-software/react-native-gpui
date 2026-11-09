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
    soundUrl?: string;
};

export type HighlightUser = {
    login: string;
    color?: string;
    playSound: boolean;
    alert: boolean;
    showInMentions: boolean;
    isRegex?: boolean;
    caseSensitive?: boolean;
    soundUrl?: string;
};

export type HighlightBadge = {
    name: string;
    displayName: string;
    showInMentions: boolean;
    alert: boolean;
    playSound: boolean;
    soundUrl?: string;
    color?: string;
};

export type BlacklistedUser = { pattern: string; isRegex: boolean };

export type IgnoredPhrase = {
    pattern: string;
    isRegex: boolean;
    caseSensitive: boolean;
    replaceWith?: string;
    isBlock?: boolean;
};

export type Nickname = { name: string; replace: string; isRegex: boolean; caseSensitive: boolean };

export type CustomCommand = { trigger: string; command: string; showInMessageMenu: boolean };

export type FilterRecord = { id: string; name: string; filter: string };

export type ModerationAction = { action: string; iconPath?: string };

export type TimeoutUnit = "s" | "m" | "h" | "d" | "w";

export type TimeoutButton = { unit: TimeoutUnit; value: number };

export type HotkeyOverride = { id: string; key: string; removed?: boolean; action?: string; category?: "Popup Windows" | "Split" | "Split input box" | "Window" };

export type TabDirection = "top" | "left" | "right" | "bottom";
export type TabStyle = "normal" | "compact";
export type KeyModifier = "none" | "shift" | "control" | "alt" | "meta";
export type RightClickBehavior = "reply" | "mention" | "ignore";
export type MessageOverflow = "highlight" | "prevent" | "allow";
export type LastMessageLineStyle = "solid" | "dotted";
export type ThumbnailPreviewMode = "dontShow" | "alwaysShow" | "showOnShift";
export type EmoteTooltipScale = "small" | "medium" | "large" | "huge";
export type EmojiStyle = "twitter" | "facebook" | "apple" | "google";
export type SoundBackend = "miniaudio" | "null";
export type UsernameDisplayMode = "username" | "localizedName" | "usernameAndLocalizedName";
export type ShowModerationState = "always" | "never";
export type ChatSendProtocol = "default" | "irc" | "helix";
export type TimeoutStackStyle = "stack" | "stackUntilTimeout" | "dontStack";
export type BlockedUsersVisibility = "never" | "moderator" | "broadcaster";
export type StreamlinkQuality = "choose" | "source" | "high" | "medium" | "low" | "audioOnly";

export type ExtendedSettings = {
    systemTheme: boolean;
    darkSystemTheme: ThemeName;
    lightSystemTheme: ThemeName;
    uiScale: number;
    tabDirection: TabDirection;
    tabStyle: TabStyle;
    fontWeight: number;
    hideReplyContext: boolean;
    showReplyButton: boolean;
    windowTopMost: boolean;
    hidePreferencesButton: boolean;
    hideUserButton: boolean;
    pauseOnHoverDuration: number;
    pauseChatModifier: KeyModifier;
    mouseScrollMultiplier: number;
    enableSmoothScrolling: boolean;
    enableSmoothScrollingNewMessages: boolean;
    showEmptyInput: boolean;
    showSendWaitTimer: boolean;
    allowDuplicateMessages: boolean;
    messageOverflow: MessageOverflow;
    usernameRightClickBehavior: RightClickBehavior;
    usernameRightClickModifierBehavior: RightClickBehavior;
    usernameRightClickModifier: Exclude<KeyModifier, "none">;
    hideScrollbarThumb: boolean;
    hideScrollbarHighlights: boolean;
    pulseTextInputOnSelfMessage: boolean;
    collapseMessagesMinLines: number;
    deletedMessageLengthLimit: number;
    showLastMessageIndicator: boolean;
    lastMessagePattern: LastMessageLineStyle;
    lastMessageColor: string;
    enableEmoteImages: boolean;
    animationsWhenFocused: boolean;
    enableZeroWidthEmotes: boolean;
    emoteCompletionWithColon: boolean;
    useSmartEmoteCompletion: boolean;
    removeSpacesBetweenEmotes: boolean;
    showUnlistedSevenTVEmotes: boolean;
    emotesTooltipPreview: ThumbnailPreviewMode;
    emoteTooltipScale: EmoteTooltipScale;
    emojiSet: EmojiStyle;
    enableBTTVGlobalEmotes: boolean;
    enableBTTVChannelEmotes: boolean;
    enableBTTVLiveUpdates: boolean;
    sendBTTVActivity: boolean;
    enableFFZGlobalEmotes: boolean;
    enableFFZChannelEmotes: boolean;
    enableSevenTVGlobalEmotes: boolean;
    enableSevenTVChannelEmotes: boolean;
    enableSevenTVEventAPI: boolean;
    sendSevenTVActivity: boolean;
    streamerModeHideUsercardAvatars: boolean;
    streamerModeHideLinkThumbnails: boolean;
    streamerModeHideViewerCountAndDuration: boolean;
    streamerModeHideModActions: boolean;
    streamerModeHideRestrictedUsers: boolean;
    streamerModeHideBlockedTermText: boolean;
    streamerModeMuteMentions: boolean;
    streamerModeSuppressLiveNotifications: boolean;
    streamerModeSuppressInlineWhispers: boolean;
    thumbnailSize: number;
    thumbnailSizeStream: number;
    betaUpdates: boolean;
    additionalExtensionIDs: string;
    cachePath: string;
    soundBackend: SoundBackend;
    soundMiniaudioKeepEngineAlive: boolean;
    headerUptime: boolean;
    headerViewerCount: boolean;
    headerGame: boolean;
    headerStreamTitle: boolean;
    similarityEnabled: boolean;
    hideSimilar: boolean;
    hideSimilarBySameUser: boolean;
    hideSimilarMyself: boolean;
    shownSimilarTriggerHighlights: boolean;
    similarityPercentage: number;
    hideSimilarMaxDelay: number;
    hideSimilarMaxMessagesToCheck: number;
    showBadgesGlobalAuthority: boolean;
    showBadgesPredictions: boolean;
    showBadgesChannelAuthority: boolean;
    showBadgesSubscription: boolean;
    showBadgesVanity: boolean;
    showBadgesChatterino: boolean;
    showBadgesFfz: boolean;
    showBadgesSevenTV: boolean;
    showBadgesBttv: boolean;
    useCustomFfzModeratorBadges: boolean;
    useCustomFfzVipBadges: boolean;
    overlayScaleFactor: number;
    overlayBackgroundOpacity: number;
    enableOverlayShadow: boolean;
    overlayShadowOpacity: number;
    overlayShadowColor: string;
    overlayShadowRadius: number;
    overlayShadowOffsetX: number;
    overlayShadowOffsetY: number;
    searchEnabled: boolean;
    searchEngineUrl: string;
    searchEngineName: string;
    restartOnCrash: boolean;
    useKeyring: boolean;
    hideModerationActions: boolean;
    hideDeletionActions: boolean;
    colorizeNicknames: boolean;
    mentionUsersWithComma: boolean;
    showJoins: boolean;
    showParts: boolean;
    autoCloseUserPopup: boolean;
    autoCloseThreadPopup: boolean;
    lowercaseDomains: boolean;
    showPronouns: boolean;
    showTitleInLiveMessage: boolean;
    boldUsernames: boolean;
    colorUsernames: boolean;
    findAllUsernames: boolean;
    showUsernameCompletionMenu: boolean;
    alwaysIncludeBroadcasterInUserCompletions: boolean;
    usernameDisplayMode: UsernameDisplayMode;
    boldScale: number;
    linksDoubleClickOnly: boolean;
    unshortLinks: boolean;
    prefixOnlyEmoteCompletion: boolean;
    userCompletionOnlyWithAt: boolean;
    inlineWhispers: boolean;
    highlightInlineWhispers: boolean;
    autoSubToParticipatedThreads: boolean;
    scrollbackUsercardLimit: number;
    showBlockedTermAutomodMessages: ShowModerationState;
    timeoutStackStyle: TimeoutStackStyle;
    stackBits: boolean;
    highlightMentions: boolean;
    stripReplyMention: boolean;
    chatSendProtocol: ChatSendProtocol;
    showSendButton: boolean;
    enableExperimentalEventSub: boolean;
    disableTabRenamingOnClick: boolean;
    nicknames: Nickname[];
    commands: CustomCommand[];
    highlightBadges: HighlightBadge[];
    blacklistedUsers: BlacklistedUser[];
    showSelfHighlightInMentions: boolean;
    enableSelfHighlightTaskbar: boolean;
    selfHighlightSoundUrl: string;
    selfHighlightColor: string;
    enableSelfMessageHighlight: boolean;
    showSelfMessageHighlightInMentions: boolean;
    selfMessageHighlightColor: string;
    enableWhisperHighlight: boolean;
    enableWhisperHighlightSound: boolean;
    enableWhisperHighlightTaskbar: boolean;
    whisperHighlightSoundUrl: string;
    whisperHighlightColor: string;
    enableSubHighlight: boolean;
    enableSubHighlightSound: boolean;
    enableSubHighlightTaskbar: boolean;
    subHighlightSoundUrl: string;
    subHighlightColor: string;
    enableRedeemedHighlight: boolean;
    redeemedHighlightColor: string;
    enableFirstMessageHighlight: boolean;
    firstMessageHighlightColor: string;
    enableElevatedMessageHighlight: boolean;
    elevatedMessageHighlightColor: string;
    enableThreadHighlight: boolean;
    showThreadHighlightInMentions: boolean;
    enableThreadHighlightSound: boolean;
    enableThreadHighlightTaskbar: boolean;
    threadHighlightSoundUrl: string;
    threadHighlightColor: string;
    enableAutomodHighlight: boolean;
    showAutomodInMentions: boolean;
    enableAutomodHighlightSound: boolean;
    enableAutomodHighlightTaskbar: boolean;
    automodHighlightSoundUrl: string;
    automodHighlightColor: string;
    enableWatchStreakHighlight: boolean;
    watchStreakHighlightColor: string;
    pathHighlightSound: string;
    highlightAlwaysPlaySound: boolean;
    longAlerts: boolean;
    mutedChannels: string[];
    enableTwitchBlockedUsers: boolean;
    showBlockedUsersMessages: BlockedUsersVisibility;
    filters: FilterRecord[];
    excludeUserMessagesFromFilter: boolean;
    hotkeyOverrides: HotkeyOverride[];
    enableLogging: boolean;
    logPath: string;
    logTimestampFormat: string;
    tryUseTwitchTimestamps: boolean;
    onlyLogListedChannels: boolean;
    separatelyStoreStreamLogs: boolean;
    loggedChannels: string[];
    moderationActions: ModerationAction[];
    timeoutButtons: TimeoutButton[];
    notificationChannels: string[];
    notificationFlashTaskbar: boolean;
    notificationPlaySound: boolean;
    notificationOnAnyChannel: boolean;
    suppressInitialLiveNotification: boolean;
    notificationCustomSound: boolean;
    notificationPathSound: string;
    streamlinkUseCustomPath: boolean;
    streamlinkPath: string;
    streamlinkQuality: StreamlinkQuality;
    streamlinkOptions: string;
    customURIScheme: string;
    imageUploaderEnabled: boolean;
    askOnImageUpload: boolean;
    imageUploaderUrl: string;
    imageUploaderFormField: string;
    imageUploaderHeaders: string;
    imageUploaderLink: string;
    imageUploaderDeletionLink: string;
    enableSpellChecking: boolean;
    nSpellCheckingSuggestions: number;
    spellCheckingDefaultDictionary: string;
    pluginsEnabled: boolean;
};

export type Settings = ExtendedSettings & {
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

export type SplitLeaf = { type: "split"; id: string; channel: string; filters?: string[]; moderationMode?: boolean };

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

export type LoginCredentials = { username: string; userId: string; clientId: string; oauthToken: string };

export type LoginResult = { ok: true; account: Account } | { ok: false; errors: string[] };

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
    ownerId?: string;
    setId?: string;
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
    pronouns?: string;
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

export type SplitViewOptions = { filters?: string[]; moderationMode?: boolean };

export type FilterCheck = { valid: boolean; message: string; detail: string };

export interface ChatCore {
    readonly settings: Store<Settings>;
    readonly layout: Store<WindowLayout>;
    readonly accounts: Store<AccountsState>;
    readonly status: Store<ConnectionStatus>;
    readonly mentions: Channel;
    readonly whispers: Channel;
    readonly blockedUsers: Store<string[]>;
    addAccountWithCredentials(credentials: LoginCredentials): LoginResult;
    blockUser(login: string): Promise<SendResult>;
    unblockUser(login: string): Promise<SendResult>;
    splitView(channel: Channel, options: SplitViewOptions): Channel;
    checkFilter(text: string): FilterCheck;
    openInStreamlink(channel: string): Promise<SendResult>;
    customPlayerUrl(channel: string): string | undefined;
    join(name: string): Channel;
    leave(name: string): void;
    globalEmotes(): EmoteInfo[];
    userInfo(login: string, channel?: string): Promise<UserInfo>;
    addAccount(token: string): Promise<Account>;
    removeAccount(login: string): void;
    selectAccount(login?: string): void;
    dispose(): void;
}
