import type {
    Account,
    AccountsState,
    Channel,
    ChatCore,
    ConnectionStatus,
    FilterCheck,
    LoginCredentials,
    LoginResult,
    SendResult,
    Settings,
    SplitViewOptions,
    Store,
    UserInfo,
    WindowLayout,
} from "./api";
import { accountFromCredentials, credentialErrors, fetchTokenScopes, validateToken } from "./accounts";
import { DEFAULT_PING_SOUND } from "./assets";
import { parseIvrBadges } from "./badges/twitch";
import { ChatChannel } from "./channel/chat-channel";
import { MentionsChannel } from "./channel/mentions-channel";
import { SplitChannelView, type BufferedChannel } from "./channel/split-view";
import { WhispersChannel } from "./channel/whispers-channel";
import { ChannelRegistry } from "./core/channels";
import { IrcDispatcher } from "./core/dispatch";
import { anonymousLiveSource, helixLiveSource, LivePoller } from "./core/live";
import { channelKey, defaultSocketFactory, defaultStorage, defaultTimers } from "./core/runtime";
import { Sender, type BlockOutcome } from "./core/sender";
import { StreamerModeWatcher } from "./core/streamer";
import { parseHelixCheermotes, type CheermoteSet } from "./emotes/cheermotes";
import { buildHighlightChecker, type HighlightChecker } from "./filters/highlights";
import { buildIgnoreFilter, type IgnoreFilter } from "./filters/ignores";
import { checkFilterText, compileFilter } from "./filters/lang/filter";
import { buildNicknameMatcher, type NicknameMatcher } from "./filters/nicknames";
import { GlobalResources } from "./globals";
import type { SocketFactory, Timers } from "./irc/connection";
import type { IrcMessage } from "./irc/message";
import type { GlobalContext } from "./messages/context";
import type { ChatMessage } from "./messages/model";
import type { RenderOptions } from "./messages/render";
import { buildReceivedWhisper, buildSentWhisper, type WhisperDeps } from "./messages/whisper";
import { loadAccounts, loadLayout, loadSettings, save, STORAGE_KEYS, type StorageLike } from "./persistence";
import type { PlatformHooks } from "./platform";
import { createStore } from "./store";
import { TwitchConnections } from "./twitch/connections";
import { expandCustomCommand } from "./twitch/custom-commands";
import { Helix } from "./twitch/helix";
import { themePalette } from "./theme";
import { fetchPronouns, fetchUserInfo } from "./users";
import { requestJson, type FetchLike } from "./util/http";

export type ChatCoreOptions = {
    storage?: StorageLike;
    fetch?: FetchLike;
    socketFactory?: SocketFactory;
    timers?: Timers;
    platform?: PlatformHooks;
    connect?: boolean;
    ircUrl?: string;
    loadGlobals?: boolean;
};

export type MessageMenuCommand = { trigger: string };

export type ChatCoreExtras = {
    readonly streamerMode: Store<boolean>;
    readonly lastWhisperer: Store<string | undefined>;
    reconnect(): void;
    ready(): Promise<void>;
    runModerationAction(channel: string, index: number, messageId: string): void;
    messageMenuCommands(): MessageMenuCommand[];
    runMessageCommand(channel: string, trigger: string, messageId: string, selection?: string, inputText?: string): void;
    readClipboard(): Promise<string> | undefined;
    clearClipboard(): void;
    playSound(path?: string): void;
    canSpawnProcesses(): boolean;
    canOpenCustomScheme(): boolean;
};

const RENDER_KEYS: Array<keyof Settings> = [
    "theme",
    "timestampFormat",
    "showBadges",
    "showDeletedMessages",
    "showBadgesGlobalAuthority",
    "showBadgesPredictions",
    "showBadgesChannelAuthority",
    "showBadgesSubscription",
    "showBadgesVanity",
    "showBadgesChatterino",
    "showBadgesFfz",
    "showBadgesSevenTV",
    "showBadgesBttv",
    "enableEmoteImages",
    "removeSpacesBetweenEmotes",
    "emotesTooltipPreview",
    "emojiSet",
    "hideReplyContext",
    "hideScrollbarHighlights",
    "colorUsernames",
    "boldUsernames",
    "hideModerationActions",
    "hideDeletionActions",
    "streamerModeHideModActions",
    "hideSimilar",
    "highlightInlineWhispers",
    "enableFirstMessageHighlight",
    "firstMessageHighlightColor",
    "enableElevatedMessageHighlight",
    "elevatedMessageHighlightColor",
    "enableRedeemedHighlight",
    "redeemedHighlightColor",
    "enableSubHighlight",
    "subHighlightColor",
    "enableWatchStreakHighlight",
    "watchStreakHighlightColor",
    "whisperHighlightColor",
];

const STREAMLINK_QUALITY: Record<Settings["streamlinkQuality"], string> = {
    choose: "best",
    source: "best",
    high: "high",
    medium: "medium",
    low: "low",
    audioOnly: "audio_only",
};

function changed(value: Settings, previous: Settings, keys: Array<keyof Settings>): boolean {
    return keys.some((key) => value[key] !== previous[key]);
}

function splitArguments(text: string): string[] {
    return text.match(/"[^"]*"|\S+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

export function createChatCore(options: ChatCoreOptions = {}): ChatCore & ChatCoreExtras {
    const storage = options.storage ?? defaultStorage();
    const fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const timers = options.timers ?? defaultTimers();
    const platform = options.platform ?? {};
    const connect = options.connect !== false;
    const globals = new GlobalResources(fetchFn);
    let ignoreFilter: IgnoreFilter;
    let highlightChecker: HighlightChecker;
    let nicknameMatcher: NicknameMatcher = () => undefined;
    let hadDisconnect = false;
    let selfEmoteSets = "";
    let disposed = false;
    let settingsReady = false;

    const blockedUsers = createStore<string[]>([]);
    const lastWhisperer = createStore<string | undefined>(undefined);
    const settings = createStore<Settings>(loadSettings(storage), (value, previous) => {
        save(storage, STORAGE_KEYS.settings, value);
        if (settingsReady) onSettingsChanged(value, previous);
    });
    const layout = createStore<WindowLayout>(loadLayout(storage), (value) => save(storage, STORAGE_KEYS.layout, value));
    const accounts = createStore<AccountsState>(loadAccounts(storage), (value) => save(storage, STORAGE_KEYS.accounts, value));
    const status = createStore<ConnectionStatus>({ connected: false, anonymous: true });
    const streamerMode = createStore<boolean>(settings.get().streamerMode === "on");
    const streamerWatcher = new StreamerModeWatcher(streamerMode, platform, timers);

    function currentAccount(): Account | undefined {
        const state = accounts.get();
        return state.accounts.find((account) => account.login === state.current);
    }

    function rebuildFilters(): void {
        const value = settings.get();
        ignoreFilter = buildIgnoreFilter(value, blockedUsers.get());
        highlightChecker = buildHighlightChecker(value, currentAccount()?.login);
        nicknameMatcher = buildNicknameMatcher(value.nicknames);
    }
    rebuildFilters();

    const globalContext = (): GlobalContext => ({
        selfLogin: currentAccount()?.login,
        ignores: ignoreFilter,
        highlights: highlightChecker,
        now: () => timers.now(),
        settings: settings.get(),
        nickname: nicknameMatcher,
    });

    const renderOptions = (): Omit<RenderOptions, "showChannelName"> => {
        const value = settings.get();
        return {
            theme: value.theme,
            timestampFormat: value.timestampFormat,
            showBadges: value.showBadges,
            hideModerated: !value.showDeletedMessages,
            settings: value,
            streamerMode: streamerMode.get(),
        };
    };

    const mentions = new MentionsChannel(timers, () => settings.get(), renderOptions);

    function updateStatus(connected: boolean): void {
        const account = currentAccount();
        const next: ConnectionStatus = { connected, anonymous: !account };
        if (account) next.login = account.login;
        status.set(next);
    }

    function soundPath(path?: string): string {
        return path || settings.get().pathHighlightSound || DEFAULT_PING_SOUND;
    }

    function playSound(path?: string): void {
        if (settings.get().soundBackend === "null") return;
        platform.playSound?.(soundPath(path));
    }

    function alertWindow(): void {
        platform.requestAttention?.(settings.get().longAlerts);
    }

    const connections = new TwitchConnections(
        options.socketFactory ?? defaultSocketFactory(),
        timers,
        {
            onReadMessage: (message) => dispatcher.handleRead(message),
            onWriteMessage: (message) => dispatcher.handleWrite(message),
            onReadRegistered: () => {
                for (const channel of registry.values()) channel.markConnected(hadDisconnect);
                hadDisconnect = false;
                updateStatus(true);
            },
            onReadDisconnected: (announcement) => {
                hadDisconnect = true;
                for (const channel of registry.values()) {
                    if (announcement) channel.addSystemMessage(announcement);
                    channel.markDisconnected();
                }
                updateStatus(false);
            },
        },
        options.ircUrl,
    );

    const whisperDeps: WhisperDeps = {
        lookupEmote: (name) => {
            const value = settings.get();
            const emote = globals.emotes.ffz.get(name) ?? globals.emotes.bttv.get(name);
            const twitch = globals.twitchEmotes.find((entry) => entry.name === name);
            if (twitch) return twitch;
            const ffzOn = value.enableFFZGlobalEmotes && globals.emotes.ffz.has(name);
            const bttvOn = value.enableBTTVGlobalEmotes && globals.emotes.bttv.has(name);
            return ffzOn || bttvOn ? emote : undefined;
        },
        userColor: (login) => {
            for (const channel of registry.values()) {
                const color = channel.userColor(login);
                if (color) return color;
            }
            return undefined;
        },
        selfColor: () => undefined,
    };

    function inlineWhispers(message: ChatMessage): void {
        const value = settings.get();
        const suppressed = streamerMode.get() && value.streamerModeSuppressInlineWhispers;
        if (!value.inlineWhispers || suppressed) return;
        for (const channel of registry.values()) channel.addInlineMessage(message);
    }

    function onWhisperSent(target: string, text: string): void {
        const message = buildSentWhisper(target, text, whisperDeps, globalContext());
        whispers.add(message);
        inlineWhispers(message);
    }

    async function block(login: string, shouldBlock: boolean): Promise<BlockOutcome> {
        const account = currentAccount();
        if (!account) return "error";
        const helix = new Helix(fetchFn, account);
        let id: string | undefined;
        try {
            id = await helix.userId(login);
        } catch {
            return "error";
        }
        if (!id) return "notFound";
        try {
            if (shouldBlock) await helix.block(id);
            else await helix.unblock(id);
        } catch {
            return "error";
        }
        const current = blockedUsers.get();
        const lower = login.toLowerCase();
        const next = shouldBlock ? [...new Set([...current, lower])] : current.filter((entry) => entry !== lower);
        blockedUsers.set(next);
        return "ok";
    }

    const sender = new Sender({
        fetch: fetchFn,
        connections,
        now: () => timers.now(),
        currentAccount,
        settings: () => settings.get(),
        onWhisperSent,
        block,
    });

    const whispers = new WhispersChannel(
        timers,
        () => settings.get(),
        renderOptions,
        (text) => sender.whisper({ name: "/whispers", isTwitch: true, addSystemMessage: (line) => whispers.addSystemMessage(line) }, text),
        () => timers.now(),
    );

    function notifyHighlight(channel: ChatChannel | undefined, message: ChatMessage): void {
        const alert = message.alert;
        if (!alert || message.flags.historical) return;
        const value = settings.get();
        const muted = !!channel && value.mutedChannels.includes(channel.name);
        const streamerMuted = streamerMode.get() && value.streamerModeMuteMentions;
        if (muted || streamerMuted) return;
        const focused = platform.isAppActive?.() ?? false;
        const soundAllowed = !focused || value.highlightAlwaysPlaySound;
        if (alert.playSound && soundAllowed) playSound(alert.soundUrl);
        if (alert.windowAlert) alertWindow();
        if (alert.windowAlert && value.mentionNotification) {
            const where = channel ? `#${channel.name}` : "Whisper";
            platform.notify?.(where, `${message.displayName}: ${message.text}`);
        }
    }

    function onMessage(channel: ChatChannel, message: ChatMessage): void {
        const showInMentions = message.flags.highlighted && message.flags.showInMentions;
        if (showInMentions && !message.flags.historical) mentions.add(message);
        notifyHighlight(channel, message);
    }

    function onWhisper(irc: IrcMessage): void {
        const message = buildReceivedWhisper(irc, whisperDeps, globalContext());
        if (!message) return;
        lastWhisperer.set(message.login);
        if (message.flags.highlighted && message.flags.showInMentions) mentions.add(message);
        whispers.add(message);
        notifyHighlight(undefined, message);
        inlineWhispers({ ...message, flags: { ...message.flags, doNotNotify: true } });
    }

    function loadCheermotes(roomId: string): Promise<CheermoteSet[] | undefined> {
        const account = currentAccount();
        if (!account) return Promise.resolve(undefined);
        return new Helix(fetchFn, account).cheermotes(roomId).then(parseHelixCheermotes);
    }

    async function loadChannelBadges(login: string, roomId: string | undefined) {
        const account = currentAccount();
        if (account && roomId) return parseIvrBadges(await new Helix(fetchFn, account).channelBadges(roomId));
        return parseIvrBadges(await requestJson(fetchFn, `https://api.ivr.fi/v2/twitch/badges/channel?login=${encodeURIComponent(login)}`));
    }

    const registry = new ChannelRegistry({
        create: (name) =>
            new ChatChannel(name, {
                fetch: fetchFn,
                timers,
                settings: () => settings.get(),
                global: globalContext,
                globalEmotes: () => globals.emotes,
                globalBadges: () => globals.badges,
                userBadges: () => globals.userBadges,
                renderOptions,
                send: (channel, text) => sender.send(channel, text),
                onMessage,
                onMessageChanged: (message) => mentions.changed(message),
                loadCheermotes,
                loadBadges: loadChannelBadges,
                twitchEmotes: () => globals.twitchEmotes,
            }),
        fetch: fetchFn,
        timers,
        settings: () => settings.get(),
        connections,
        mentions,
        globalsReady: () => globals.ready(),
        onJoined: () => livePoller.poke(),
        loggedIn: () => !!currentAccount(),
    });

    const dispatcher = new IrcDispatcher({
        channel: (name) => registry.get(name),
        channels: () => registry.values(),
        mentions,
        connections,
        selfLogin: () => currentAccount()?.login,
        now: () => timers.now(),
        onRoomId: (channel, roomId) => registry.applyRoomId(channel, roomId),
        onEmoteSets: (sets) => {
            const key = sets.join(",");
            if (key === selfEmoteSets) return;
            selfEmoteSets = key;
            void globals.loadTwitchEmotes(currentAccount(), sets);
        },
        onWhisper,
    });

    const liveDisplayNames = new Map<string, string>();

    function liveNotification(login: string, title: string | undefined, initial: boolean): void {
        const value = settings.get();
        if (initial && value.suppressInitialLiveNotification) return;
        if (streamerMode.get() && value.streamerModeSuppressLiveNotifications) return;
        const selected = value.notificationChannels.includes(login);
        let played = false;
        const name = registry.get(login)?.displayName() ?? liveDisplayNames.get(login) ?? login;
        const customSound = value.notificationCustomSound && value.notificationPathSound ? value.notificationPathSound : DEFAULT_PING_SOUND;
        if (selected) {
            if (value.liveNotifications) platform.notify?.(`${name} is live!`, title ?? "");
            if (value.notificationPlaySound) {
                playSound(customSound);
                played = true;
            }
            if (value.notificationFlashTaskbar) alertWindow();
        }
        if (value.notificationOnAnyChannel && !played) playSound(customSound);
    }

    const liveStates = new Map<string, boolean>();

    const livePoller = new LivePoller({
        timers,
        source: () => {
            const account = currentAccount();
            return account ? helixLiveSource(fetchFn, account) : anonymousLiveSource(fetchFn);
        },
        targets: () => [...registry.channels.keys(), ...settings.get().notificationChannels],
        onStatus: (login, live, initial) => {
            const channel = registry.get(login);
            if (channel) channel.setLive(live);
            const wasLive = liveStates.get(login) ?? false;
            liveStates.set(login, live.live);
            if (live.live && !wasLive) liveNotification(login, live.title, initial);
        },
    });

    function onSettingsChanged(value: Settings, previous: Settings): void {
        rebuildFilters();
        if (changed(value, previous, RENDER_KEYS)) {
            for (const channel of registry.values()) channel.buffer.invalidateAll();
            mentions.buffer.invalidateAll();
            whispers.buffer.invalidateAll();
        }
        if (value.streamerMode !== previous.streamerMode) streamerWatcher.refresh(value.streamerMode);
        if (value.systemTheme !== previous.systemTheme || value.darkSystemTheme !== previous.darkSystemTheme || value.lightSystemTheme !== previous.lightSystemTheme) {
            applySystemTheme();
        }
        syncLocalBlocks(value.ignoredUsers, previous.ignoredUsers);
        if (value.notificationChannels !== previous.notificationChannels) livePoller.poke();
    }

    function syncLocalBlocks(next: string[], previous: string[]): void {
        if (next === previous || !currentAccount()) return;
        for (const login of next) if (!previous.includes(login)) void block(login, true);
        for (const login of previous) if (!next.includes(login)) void block(login, false);
    }

    function applySystemTheme(): void {
        const value = settings.get();
        if (!value.systemTheme) return;
        const scheme = platform.colorScheme?.();
        const theme = scheme === "light" ? value.lightSystemTheme : value.darkSystemTheme;
        if (theme !== value.theme) settings.set({ ...value, theme });
    }

    async function loadBlocks(): Promise<void> {
        const account = currentAccount();
        if (!account) {
            blockedUsers.set([]);
            return;
        }
        try {
            const blocks = await new Helix(fetchFn, account).blocks(account.userId);
            if (currentAccount() !== account) return;
            blockedUsers.set(blocks.slice(0, 1000).map((entry) => entry.user_login.toLowerCase()));
        } catch (error) {
            console.warn("failed to load blocked users", error);
        }
    }

    blockedUsers.subscribe(() => rebuildFilters());

    function onAccountChanged(): void {
        rebuildFilters();
        selfEmoteSets = "";
        globals.twitchEmotes = [];
        updateStatus(false);
        if (connect) connections.switchAccount(currentAccount());
        void loadBlocks();
        const account = currentAccount();
        if (account && options.loadGlobals !== false) {
            void globals.loadGlobalBadges(account);
            void globals.loadUserEmotes(account);
        }
        livePoller.reset();
    }

    function selectAccount(login?: string): void {
        const target = login?.toLowerCase();
        const state = accounts.get();
        const exists = !target || state.accounts.some((account) => account.login === target);
        if (!exists || state.current === target) return;
        const next: AccountsState = { accounts: state.accounts };
        if (target) next.current = target;
        accounts.set(next);
        onAccountChanged();
    }

    function storeAccount(account: Account): void {
        const state = accounts.get();
        const others = state.accounts.filter((existing) => existing.login !== account.login);
        const next: AccountsState = { accounts: [...others, account] };
        if (state.current) next.current = state.current;
        accounts.set(next);
    }

    async function addAccount(token: string): Promise<Account> {
        const account = await validateToken(fetchFn, token);
        storeAccount(account);
        const current = accounts.get().current;
        if (!current) selectAccount(account.login);
        else if (current === account.login) onAccountChanged();
        return account;
    }

    function addAccountWithCredentials(credentials: LoginCredentials): LoginResult {
        const errors = credentialErrors(credentials);
        if (errors.length > 0) return { ok: false, errors };
        const account = accountFromCredentials(credentials);
        storeAccount(account);
        const state = accounts.get();
        accounts.set({ ...state, current: account.login });
        onAccountChanged();
        void fetchTokenScopes(fetchFn, account.token).then((scopes) => {
            if (!scopes) return;
            const latest = accounts.get();
            accounts.set({
                ...latest,
                accounts: latest.accounts.map((entry) => (entry.login === account.login ? { ...entry, scopes } : entry)),
            });
        });
        return { ok: true, account };
    }

    function removeAccount(login: string): void {
        const target = login.toLowerCase();
        const state = accounts.get();
        const remaining = state.accounts.filter((account) => account.login !== target);
        if (state.current !== target) {
            accounts.set({ ...state, accounts: remaining });
            return;
        }
        accounts.set({ accounts: remaining });
        onAccountChanged();
    }

    async function userInfo(login: string, channel?: string): Promise<UserInfo> {
        const account = currentAccount();
        let info: UserInfo | undefined;
        if (account) {
            try {
                const helix = new Helix(fetchFn, account);
                const [user] = await helix.users({ login: [login.toLowerCase()] });
                if (user) {
                    info = { login: user.login, displayName: user.display_name || user.login, id: user.id };
                    if (user.profile_image_url) info.avatarUrl = user.profile_image_url;
                    if (user.description) info.bio = user.description;
                    const created = user.created_at ? Date.parse(user.created_at) : NaN;
                    if (Number.isFinite(created)) info.createdAt = created;
                    const followers = await helix.followerCount(user.id).catch(() => undefined);
                    if (followers !== undefined) info.followers = followers;
                }
            } catch {
                info = undefined;
            }
        }
        info ??= await fetchUserInfo(fetchFn, login);
        if (channel) {
            try {
                const url = `https://api.ivr.fi/v2/twitch/subage/${encodeURIComponent(info.login)}/${encodeURIComponent(channelKey(channel))}`;
                const subage = await requestJson<{ followedAt?: string | null }>(fetchFn, url);
                const followedAt = subage.followedAt ? Date.parse(subage.followedAt) : NaN;
                if (Number.isFinite(followedAt)) info.followedAt = followedAt;
            } catch {}
        }
        if (settings.get().showPronouns) {
            const pronouns = await fetchPronouns(fetchFn, info.login).catch(() => undefined);
            if (pronouns) info.pronouns = pronouns;
        }
        return info;
    }

    async function blockUser(login: string): Promise<SendResult> {
        const lower = login.toLowerCase();
        if (!currentAccount()) {
            settings.set((current) => (current.ignoredUsers.includes(lower) ? current : { ...current, ignoredUsers: [...current.ignoredUsers, lower] }));
            return { ok: true };
        }
        const outcome = await block(lower, true);
        return outcome === "ok" ? { ok: true } : { ok: false, reason: outcome === "notFound" ? "No user with that name found." : "An unknown error occurred." };
    }

    async function unblockUser(login: string): Promise<SendResult> {
        const lower = login.toLowerCase();
        settings.set((current) => (current.ignoredUsers.includes(lower) ? { ...current, ignoredUsers: current.ignoredUsers.filter((entry) => entry !== lower) } : current));
        if (!currentAccount()) return { ok: true };
        const outcome = await block(lower, false);
        return outcome === "ok" ? { ok: true } : { ok: false, reason: "An unknown error occurred." };
    }

    function splitView(channel: Channel, viewOptions: SplitViewOptions): Channel {
        const buffered = channel as BufferedChannel;
        const filterIds = viewOptions.filters ?? [];
        const needsView = filterIds.length > 0 || !!viewOptions.moderationMode;
        if (!needsView || !("buffer" in buffered)) return channel;
        const records = settings.get().filters.filter((record) => filterIds.includes(record.id));
        return new SplitChannelView(buffered, {
            filters: records.length > 0 ? records.map((record) => compileFilter(record.filter)) : undefined,
            excludeSelf: () => settings.get().excludeUserMessagesFromFilter,
            selfLogin: () => currentAccount()?.login,
            moderationMode: !!viewOptions.moderationMode,
            moderationActions: () => settings.get().moderationActions,
            systemColor: () => themePalette(settings.get().theme).system,
        });
    }

    function checkFilter(text: string): FilterCheck {
        return checkFilterText(text);
    }

    function commandMessage(channelName: string, messageId: string) {
        const message = registry.get(channelKey(channelName))?.findMessage(messageId) ?? mentions.buffer.findById(messageId) ?? whispers.buffer.findById(messageId);
        return message ? { login: message.login, id: message.id, text: message.text } : undefined;
    }

    function runExpanded(channelName: string, text: string): void {
        const channel = registry.get(channelKey(channelName));
        if (!channel) return;
        void sender.sendExpanded(channel, text);
    }

    function runModerationAction(channelName: string, index: number, messageId: string): void {
        const action = settings.get().moderationActions[index];
        const channel = registry.get(channelKey(channelName));
        if (!action || !channel) return;
        const vars = { ...sender.variables({ name: channel.name, isTwitch: true, roomId: channel.info().roomId, addSystemMessage: () => undefined }), message: commandMessage(channelName, messageId) };
        runExpanded(channelName, expandCustomCommand(action.action, [], vars).trim());
    }

    function runMessageCommand(channelName: string, trigger: string, messageId: string, selection?: string, inputText?: string): void {
        const command = settings.get().commands.find((entry) => entry.trigger === trigger);
        const channel = registry.get(channelKey(channelName));
        const message = commandMessage(channelName, messageId);
        if (!command || !channel) return;
        const words = `${trigger} ${selection ?? message?.text ?? ""}`.split(" ");
        const vars = {
            ...sender.variables({ name: channel.name, isTwitch: true, roomId: channel.info().roomId, addSystemMessage: () => undefined }),
            message,
            context: { "input.text": inputText ?? "" },
        };
        runExpanded(channelName, expandCustomCommand(command.command, words, vars).trim());
    }

    async function openInStreamlink(channelName: string): Promise<SendResult> {
        const spawn = platform.spawn;
        if (!spawn) return { ok: false, reason: "This runtime cannot start streamlink yet." };
        const value = settings.get();
        const binary = value.streamlinkUseCustomPath && value.streamlinkPath ? `${value.streamlinkPath.replace(/\/$/, "")}/streamlink` : "streamlink";
        const args = [...splitArguments(value.streamlinkOptions), `https://twitch.tv/${channelKey(channelName)}`, STREAMLINK_QUALITY[value.streamlinkQuality]];
        const result = await spawn(binary, args);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    }

    function customPlayerUrl(channelName: string): string | undefined {
        const scheme = settings.get().customURIScheme.trim();
        if (!scheme) return undefined;
        return `${scheme}https://twitch.tv/${channelKey(channelName)}`;
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        connections.stop();
        livePoller.stop();
        streamerWatcher.stop();
        stopSchemeListener?.();
        registry.dispose();
        mentions.dispose();
        whispers.dispose();
    }

    const globalsReady = options.loadGlobals === false ? Promise.resolve() : globals.load();
    streamerWatcher.refresh(settings.get().streamerMode);
    streamerMode.subscribe(() => {
        for (const channel of registry.values()) channel.buffer.invalidateAll();
    });
    const stopSchemeListener = platform.onColorSchemeChange?.(() => applySystemTheme());
    settingsReady = true;
    applySystemTheme();
    if (connect) {
        connections.start(currentAccount());
        livePoller.start();
    }
    updateStatus(false);
    const startAccount = currentAccount();
    if (startAccount) {
        void loadBlocks();
        if (options.loadGlobals !== false) {
            void globals.loadGlobalBadges(startAccount);
            void globals.loadUserEmotes(startAccount);
        }
    }

    return {
        settings,
        layout,
        accounts,
        status,
        mentions,
        whispers,
        blockedUsers,
        streamerMode,
        lastWhisperer,
        join: (name) => registry.join(name),
        leave: (name) => registry.leave(name),
        globalEmotes: () => globals.emoteInfos(settings.get(), settings.get().emojiSet),
        userInfo,
        addAccount,
        addAccountWithCredentials,
        removeAccount,
        selectAccount,
        blockUser,
        unblockUser,
        splitView,
        checkFilter,
        openInStreamlink,
        customPlayerUrl,
        runModerationAction,
        messageMenuCommands: () => settings.get().commands.filter((command) => command.showInMessageMenu).map((command) => ({ trigger: command.trigger })),
        runMessageCommand,
        readClipboard: () => platform.readClipboard?.(),
        clearClipboard: () => platform.writeClipboard?.(""),
        playSound,
        canSpawnProcesses: () => !!platform.spawn,
        canOpenCustomScheme: () => false,
        dispose,
        reconnect: () => connections.switchAccount(currentAccount()),
        ready: () => globalsReady,
    };
}
