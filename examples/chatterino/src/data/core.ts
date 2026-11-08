import type { Account, AccountsState, ChatCore, ConnectionStatus, Settings, Store, UserInfo, WindowLayout } from "./api";
import { validateToken } from "./accounts";
import { ChatChannel } from "./channel/chat-channel";
import { MentionsChannel } from "./channel/mentions-channel";
import { ChannelRegistry } from "./core/channels";
import { IrcDispatcher } from "./core/dispatch";
import { LivePoller } from "./core/live";
import { channelKey, defaultSocketFactory, defaultStorage, defaultTimers } from "./core/runtime";
import { Sender } from "./core/sender";
import { StreamerModeWatcher } from "./core/streamer";
import { parseHelixCheermotes, type CheermoteSet } from "./emotes/cheermotes";
import { buildHighlightChecker, type HighlightChecker } from "./filters/highlights";
import { buildIgnoreFilter, type IgnoreFilter } from "./filters/ignores";
import { GlobalResources } from "./globals";
import type { SocketFactory, Timers } from "./irc/connection";
import type { GlobalContext } from "./messages/context";
import type { ChatMessage } from "./messages/model";
import type { RenderOptions } from "./messages/render";
import { loadAccounts, loadLayout, loadSettings, save, STORAGE_KEYS, type StorageLike } from "./persistence";
import type { PlatformHooks } from "./platform";
import { createStore } from "./store";
import { TwitchConnections } from "./twitch/connections";
import { Helix } from "./twitch/helix";
import { fetchUserInfo } from "./users";
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

export type ChatCoreExtras = {
    readonly streamerMode: Store<boolean>;
    reconnect(): void;
    ready(): Promise<void>;
};

function isVisualChange(value: Settings, previous: Settings): boolean {
    return (
        value.theme !== previous.theme ||
        value.timestampFormat !== previous.timestampFormat ||
        value.showBadges !== previous.showBadges ||
        value.showDeletedMessages !== previous.showDeletedMessages
    );
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
    let hadDisconnect = false;
    let selfEmoteSets = "";
    let disposed = false;

    const settings = createStore<Settings>(loadSettings(storage), (value, previous) => {
        save(storage, STORAGE_KEYS.settings, value);
        onSettingsChanged(value, previous);
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
        ignoreFilter = buildIgnoreFilter(settings.get());
        highlightChecker = buildHighlightChecker(settings.get(), currentAccount()?.login);
    }
    rebuildFilters();

    const globalContext = (): GlobalContext => ({
        selfLogin: currentAccount()?.login,
        ignores: ignoreFilter,
        highlights: highlightChecker,
        now: () => timers.now(),
    });

    const renderOptions = (): Omit<RenderOptions, "showChannelName"> => {
        const value = settings.get();
        return {
            theme: value.theme,
            timestampFormat: value.timestampFormat,
            showBadges: value.showBadges,
            hideModerated: !value.showDeletedMessages,
        };
    };

    const mentions = new MentionsChannel(timers, () => settings.get(), renderOptions);

    function updateStatus(connected: boolean): void {
        const account = currentAccount();
        const next: ConnectionStatus = { connected, anonymous: !account };
        if (account) next.login = account.login;
        status.set(next);
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

    const sender = new Sender({ fetch: fetchFn, connections, now: () => timers.now(), currentAccount });

    function notifyHighlight(channel: ChatChannel, message: ChatMessage): void {
        const alert = message.alert;
        if (!alert || message.flags.historical || streamerMode.get()) return;
        const value = settings.get();
        if (alert.playSound && value.mentionSound) platform.playSound?.("ping");
        if (alert.windowAlert && value.mentionNotification) {
            platform.notify?.(`#${channel.name}`, `${message.displayName}: ${message.text}`);
        }
    }

    function onMessage(channel: ChatChannel, message: ChatMessage): void {
        const showInMentions = message.flags.highlighted && message.flags.showInMentions;
        if (showInMentions && !message.flags.historical) mentions.add(message);
        notifyHighlight(channel, message);
    }

    function loadCheermotes(roomId: string): Promise<CheermoteSet[] | undefined> {
        const account = currentAccount();
        if (!account) return Promise.resolve(undefined);
        return new Helix(fetchFn, account).cheermotes(roomId).then(parseHelixCheermotes);
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
                twitchEmotes: () => globals.twitchEmotes,
            }),
        fetch: fetchFn,
        timers,
        settings: () => settings.get(),
        connections,
        mentions,
        globalsReady: () => globals.ready(),
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
    });

    const livePoller = new LivePoller({
        fetch: fetchFn,
        timers,
        channels: () => registry.channels,
        onWentLive: (channel, title) => {
            if (!settings.get().liveNotifications || streamerMode.get()) return;
            platform.notify?.(`${channel.displayName()} is live`, title ?? "");
        },
    });

    function onSettingsChanged(value: Settings, previous: Settings): void {
        rebuildFilters();
        if (isVisualChange(value, previous)) {
            for (const channel of registry.values()) channel.buffer.invalidateAll();
            mentions.buffer.invalidateAll();
        }
        if (value.streamerMode !== previous.streamerMode) streamerWatcher.refresh(value.streamerMode);
    }

    function selectAccount(login?: string): void {
        const target = login?.toLowerCase();
        const state = accounts.get();
        const exists = !target || state.accounts.some((account) => account.login === target);
        if (!exists || state.current === target) return;
        const next: AccountsState = { accounts: state.accounts };
        if (target) next.current = target;
        accounts.set(next);
        rebuildFilters();
        selfEmoteSets = "";
        globals.twitchEmotes = [];
        updateStatus(false);
        if (connect) connections.switchAccount(currentAccount());
    }

    async function addAccount(token: string): Promise<Account> {
        const account = await validateToken(fetchFn, token);
        const state = accounts.get();
        const others = state.accounts.filter((existing) => existing.login !== account.login);
        const next: AccountsState = { accounts: [...others, account] };
        if (state.current) next.current = state.current;
        accounts.set(next);
        if (!state.current) selectAccount(account.login);
        else if (state.current === account.login && connect) connections.switchAccount(account);
        return account;
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
        rebuildFilters();
        updateStatus(false);
        if (connect) connections.switchAccount(undefined);
    }

    async function userInfo(login: string, channel?: string): Promise<UserInfo> {
        const info = await fetchUserInfo(fetchFn, login);
        if (!channel) return info;
        try {
            const url = `https://api.ivr.fi/v2/twitch/subage/${encodeURIComponent(info.login)}/${encodeURIComponent(channelKey(channel))}`;
            const subage = await requestJson<{ followedAt?: string | null }>(fetchFn, url);
            const followedAt = subage.followedAt ? Date.parse(subage.followedAt) : NaN;
            if (Number.isFinite(followedAt)) info.followedAt = followedAt;
        } catch {}
        return info;
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        connections.stop();
        livePoller.stop();
        streamerWatcher.stop();
        registry.dispose();
        mentions.dispose();
    }

    const globalsReady = options.loadGlobals === false ? Promise.resolve() : globals.load();
    streamerWatcher.refresh(settings.get().streamerMode);
    if (connect) {
        connections.start(currentAccount());
        livePoller.start();
    }
    updateStatus(false);

    return {
        settings,
        layout,
        accounts,
        status,
        mentions,
        streamerMode,
        join: (name) => registry.join(name),
        leave: (name) => registry.leave(name),
        globalEmotes: () => globals.emoteInfos(),
        userInfo,
        addAccount,
        removeAccount,
        selectAccount,
        dispose,
        reconnect: () => connections.switchAccount(currentAccount()),
        ready: () => globalsReady,
    };
}
