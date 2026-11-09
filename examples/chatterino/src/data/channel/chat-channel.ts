import type { ChatListMessage } from "react-native-gpui";
import type { Channel, ChannelEvent, ChannelInfo, ChannelModes, Completion, EmoteInfo, SendResult, Settings } from "../api";
import type { BadgeMap } from "../badges/twitch";
import type { UserBadgeMap } from "../badges/thirdparty";
import { complete, RecentChatters, type EmoteCandidate } from "../completion";
import type { CheermoteSet } from "../emotes/cheermotes";
import { toEmoteInfo, type Badge, type Emote } from "../emotes/types";
import { isAction, stripAction, unescapeZeroWidthJoiner, type IrcMessage, type IrcTags } from "../irc/message";
import type { ChannelContext, GlobalContext } from "../messages/context";
import type { ChatMessage, Tint } from "../messages/model";
import { applyClearChat, applyClearMsg } from "../messages/moderation";
import type { NoticeResult } from "../messages/notice";
import { buildPrivmsg } from "../messages/privmsg";
import { renderMessage, type RenderOptions } from "../messages/render";
import type { MessageSink } from "../messages/sink";
import { markSimilar } from "../messages/similarity";
import {
    makeBannedMessage,
    makeLiveMessage,
    makeOfflineMessage,
    makeSystemMessage,
    makeUserListMessage,
} from "../messages/system";
import { buildUserNotice } from "../messages/usernotice";
import { COMMAND_NAMES } from "../twitch/commands";
import type { FetchLike } from "../util/http";
import { MessageBuffer, type BufferTimers } from "./buffer";
import { ChannelEmotes, visibleEmotes, type GlobalEmoteSets } from "./channel-emotes";

const TWITCH_DEFAULT_COMMANDS = [
    "/help", "/w", "/me", "/disconnect", "/mods", "/vips", "/color", "/commercial", "/mod", "/unmod", "/vip",
    "/unvip", "/ban", "/unban", "/timeout", "/untimeout", "/slow", "/slowoff", "/r9kbeta", "/r9kbetaoff",
    "/emoteonly", "/emoteonlyoff", "/clear", "/subscribers", "/subscribersoff", "/followers", "/followersoff",
    "/host", "/unhost", "/raid", "/unraid", "/delete", "/announce", "/requests", "/warn",
];

const USER_COLOR_LIMIT = 5000;
const HIGH_RATE_LIMIT_BADGES = ["moderator", "lead_moderator", "vip", "broadcaster"];

function hasHighRateLimit(tags: IrcTags): boolean {
    const badges = (tags.badges ?? "").split(",").map((badge) => badge.split("/")[0]);
    return tags.mod === "1" || HIGH_RATE_LIMIT_BADGES.some((key) => badges.includes(key));
}

export type ChannelDeps = {
    fetch: FetchLike;
    timers: BufferTimers;
    settings: () => Settings;
    global: () => GlobalContext;
    globalEmotes: () => GlobalEmoteSets;
    globalBadges: () => BadgeMap;
    userBadges: () => UserBadgeMap[];
    renderOptions: () => Omit<RenderOptions, "showChannelName">;
    send: (channel: ChatChannel, text: string) => Promise<SendResult>;
    onMessage: (channel: ChatChannel, message: ChatMessage) => void;
    onMessageChanged: (message: ChatMessage) => void;
    loadCheermotes?: (roomId: string) => Promise<CheermoteSet[] | undefined>;
    loadBadges?: (login: string, roomId: string | undefined) => Promise<BadgeMap> | undefined;
    twitchEmotes: () => Emote[];
    onEmotesChanged?: (channel: ChatChannel) => void;
};

const JOIN_PART_MERGE_MS = 500;

export class ChatChannel implements Channel, ChannelContext {
    readonly buffer: MessageBuffer;
    readonly emoteSets: ChannelEmotes;
    readonly chatters = new RecentChatters();
    refs = 0;
    highRateLimit = false;
    private state: ChannelInfo;
    private readonly userColors = new Map<string, string>();
    private readonly threads = new Set<string>();
    private loadingHistory = false;
    private moderator = false;
    private readonly pendingJoins: string[] = [];
    private readonly pendingParts: string[] = [];
    private joinTimer: unknown;
    private partTimer: unknown;

    constructor(
        readonly name: string,
        private readonly deps: ChannelDeps,
    ) {
        this.state = { name, connected: false, modes: {} };
        this.buffer = new MessageBuffer(
            (message) => renderMessage(message, { ...deps.renderOptions(), showChannelName: false }),
            deps.timers,
            () => deps.settings().messageLimit,
            (message) => deps.onMessageChanged(message),
        );
        this.emoteSets = new ChannelEmotes({
            fetch: deps.fetch,
            globals: deps.globalEmotes,
            globalBadges: deps.globalBadges,
            systemMessage: (text) => this.addSystemMessage(text),
            loadCheermotes: deps.loadCheermotes,
            loadBadges: deps.loadBadges,
            settings: deps.settings,
            onChanged: () => deps.onEmotesChanged?.(this),
        });
    }

    info(): ChannelInfo {
        return this.state;
    }

    snapshot(): ChatListMessage[] {
        return this.buffer.snapshot();
    }

    subscribe(listener: (event: ChannelEvent) => void): () => void {
        return this.buffer.subscribe(listener);
    }

    send(text: string): Promise<SendResult> {
        return this.deps.send(this, text);
    }

    emotes(): EmoteInfo[] {
        return this.emoteSets.channelEmoteList().map(toEmoteInfo);
    }

    complete(word: string, atStartOfMessage: boolean): Completion[] {
        const settings = this.deps.settings();
        const customTriggers = settings.commands.map((command) => command.trigger).filter((trigger) => /^[/.]/.test(trigger));
        return complete(word, atStartOfMessage, {
            emotes: () => this.completionEmotes(),
            users: () => this.completionUsers(),
            commands: () => [...new Set([...COMMAND_NAMES, ...TWITCH_DEFAULT_COMMANDS, ...customTriggers])].sort(),
            mentionWithComma: settings.mentionUsersWithComma,
            prefixOnly: settings.prefixOnlyEmoteCompletion,
            usersOnlyWithAt: settings.userCompletionOnlyWithAt,
        });
    }

    isModerator(): boolean {
        return this.moderator;
    }

    isBroadcaster(): boolean {
        return this.deps.global().selfLogin?.toLowerCase() === this.name;
    }

    userMessages(login: string): ChatListMessage[] {
        const lower = login.toLowerCase();
        return this.buffer
            .messages()
            .filter((message) => message.login === lower && !message.flags.system)
            .map((message) => this.buffer.rendered(message));
    }

    search(query: string): ChatListMessage[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        return this.buffer
            .messages()
            .filter((message) => message.searchText.toLowerCase().includes(needle))
            .map((message) => this.buffer.rendered(message));
    }

    clear(): void {
        this.buffer.clear();
    }

    rebuildHistorical(rebuilt: ChatMessage[]): ChatMessage[] {
        const replaced: ChatMessage[] = [];
        for (const message of rebuilt) {
            const existing = this.buffer.findById(message.id);
            if (!existing?.flags.historical) continue;
            if (existing.flags.disabled) message.flags.disabled = true;
            if (this.buffer.replaceIfChanged(existing, message)) replaced.push(message);
        }
        return replaced;
    }

    displayName(): string {
        return this.state.displayName ?? this.name;
    }

    lookupEmote(name: string): Emote | undefined {
        return this.emoteSets.lookup(name);
    }

    cheermotes(): CheermoteSet[] {
        return this.emoteSets.cheermotes;
    }

    twitchBadge(setId: string, version: string): Badge | undefined {
        return this.emoteSets.twitchBadge(setId, version);
    }

    customModBadge(): Badge | undefined {
        return this.emoteSets.modBadge;
    }

    customVipBadge(): Badge | undefined {
        return this.emoteSets.vipBadge;
    }

    userBadges(userId: string): Badge[] {
        const badges: Badge[] = [];
        for (const map of this.deps.userBadges()) {
            const badge = map.get(userId);
            if (badge) badges.push(badge);
        }
        return badges;
    }

    userColor(login: string): string | undefined {
        return this.userColors.get(login.toLowerCase());
    }

    setUserColor(login: string, color: string): void {
        const key = login.toLowerCase();
        this.userColors.delete(key);
        this.userColors.set(key, color);
        if (this.userColors.size > USER_COLOR_LIMIT) {
            this.userColors.delete(this.userColors.keys().next().value as string);
        }
    }

    findMessage(id: string): ChatMessage | undefined {
        return this.buffer.findById(id);
    }

    isThreadSubscribed(rootId: string): boolean {
        return this.threads.has(rootId);
    }

    subscribeThread(rootId: string): void {
        this.threads.add(rootId);
    }

    tintFor(login: string): Tint {
        return (this.userColor(login) as Tint | undefined) ?? "system";
    }

    updateInfo(patch: Partial<ChannelInfo>): void {
        this.state = { ...this.state, ...patch, name: this.name };
        this.buffer.setInfo(this.state);
    }

    updateModes(modes: ChannelModes): void {
        this.updateInfo({ modes: { ...this.state.modes, ...modes } });
    }

    addSystemMessage(text: string): void {
        this.addMessage(makeSystemMessage(this.name, text, this.deps.global().now()));
    }

    addMessage(message: ChatMessage): void {
        const global = this.deps.global();
        const settings = this.deps.settings();
        markSimilar(message, this.buffer.messages(), settings, global.selfLogin, global.now());
        const silenced = message.flags.similar && !(settings.shownSimilarTriggerHighlights && !settings.hideSimilar);
        if (silenced && message.alert) message.alert = { playSound: false, windowAlert: false };
        this.buffer.add(message);
        if (!message.flags.system && message.displayName) this.chatters.add(message.displayName);
        this.deps.onMessage(this, message);
    }

    addInlineMessage(message: ChatMessage): void {
        this.buffer.add(message);
    }

    contextFor(sink: MessageSink): ChannelContext {
        return {
            name: this.name,
            displayName: () => this.displayName(),
            lookupEmote: (name) => this.lookupEmote(name),
            cheermotes: () => this.cheermotes(),
            twitchBadge: (setId, version) => this.twitchBadge(setId, version),
            customModBadge: () => this.customModBadge(),
            customVipBadge: () => this.customVipBadge(),
            userBadges: (userId) => this.userBadges(userId),
            userColor: (login) => this.userColor(login),
            setUserColor: (login, color) => this.setUserColor(login, color),
            findMessage: (id) => sink.findById(id) ?? this.buffer.findById(id),
            isThreadSubscribed: (rootId) => this.isThreadSubscribed(rootId),
            subscribeThread: (rootId) => this.subscribeThread(rootId),
            isKnownChatter: (login) => this.chatters.has(login),
            isModerator: () => this.isModerator(),
            isBroadcaster: () => this.isBroadcaster(),
        };
    }

    handlePrivmsg(irc: IrcMessage, sink: MessageSink = this.liveSink()): ChatMessage | undefined {
        const raw = unescapeZeroWidthJoiner(irc.params[1] ?? "");
        const action = isAction(raw);
        const content = action ? stripAction(raw) : raw;
        const message = buildPrivmsg(irc, this.contextFor(sink), this.deps.global(), {
            content,
            isAction: action,
            isSubscription: false,
            allowIgnore: true,
        });
        if (!message) return undefined;
        if (message.flags.self && !message.flags.historical) this.highRateLimit = hasHighRateLimit(irc.tags);
        sink.add(message);
        return message;
    }

    handleUserNotice(irc: IrcMessage, sink: MessageSink = this.liveSink()): ChatMessage[] {
        const messages = buildUserNotice(irc, this.contextFor(sink), this.deps.global());
        for (const message of messages) sink.add(message);
        return messages;
    }

    handleClearChat(irc: IrcMessage, sink: MessageSink = this.liveSink()): void {
        applyClearChat(sink, irc, this.deps.global().now(), this.deps.settings().timeoutStackStyle);
    }

    handleClearMsg(irc: IrcMessage, sink: MessageSink = this.liveSink()): void {
        applyClearMsg(sink, irc, this.deps.global().now(), this.deps.settings().deletedMessageLengthLimit);
    }

    handleRoomState(irc: IrcMessage): string | undefined {
        const { tags } = irc;
        const modes: ChannelModes = {};
        if ("emote-only" in tags) modes.emoteOnly = tags["emote-only"] === "1";
        if ("subs-only" in tags) modes.subOnly = tags["subs-only"] === "1";
        if ("slow" in tags) modes.slowSeconds = Number(tags.slow) || 0;
        if ("r9k" in tags) modes.r9k = tags.r9k === "1";
        if ("followers-only" in tags) modes.followersOnlyMinutes = Number(tags["followers-only"]);
        const roomId = tags["room-id"];
        const patch: Partial<ChannelInfo> = { modes: { ...this.state.modes, ...modes } };
        if (roomId && !this.state.roomId) patch.roomId = roomId;
        this.updateInfo(patch);
        return roomId;
    }

    handleUserState(irc: IrcMessage): void {
        this.highRateLimit = hasHighRateLimit(irc.tags);
        const badges = (irc.tags.badges ?? "").split(",").map((badge) => badge.split("/")[0]);
        this.moderator = irc.tags.mod === "1" || badges.includes("moderator") || badges.includes("broadcaster");
    }

    handleJoinPart(nick: string, joined: boolean): void {
        const settings = this.deps.settings();
        const enabled = joined ? settings.showJoins : settings.showParts;
        if (!enabled) return;
        const viewer = { isModerator: this.isModerator(), isBroadcaster: this.isBroadcaster() };
        if (this.deps.global().ignores.isIgnoredUser(nick, viewer)) return;
        const pending = joined ? this.pendingJoins : this.pendingParts;
        pending.push(nick);
        const timer = joined ? this.joinTimer : this.partTimer;
        if (timer !== undefined) return;
        const flush = () => {
            if (joined) this.joinTimer = undefined;
            else this.partTimer = undefined;
            const users = pending.splice(0).sort((a, b) => a.localeCompare(b));
            if (users.length === 0) return;
            const prefix = joined ? "Users joined:" : "Users parted:";
            this.addMessage(makeUserListMessage(this.name, prefix, users, (login) => this.tintFor(login)));
        };
        const handle = this.deps.timers.setTimeout(flush, JOIN_PART_MERGE_MS);
        if (joined) this.joinTimer = handle;
        else this.partTimer = handle;
    }

    handleNotice(result: NoticeResult): void {
        if (result.message) this.addMessage({ ...result.message, channel: this.name });
    }

    handleSelfJoin(): void {
        this.updateInfo({ connected: true });
        this.addSystemMessage("joined channel");
    }

    handleSelfPart(): void {
        this.updateInfo({ connected: false });
        this.addMessage(makeBannedMessage(this.name, false));
    }

    markConnected(reconnected: boolean): void {
        const last = this.buffer.last();
        if (reconnected && last?.flags.disconnected) {
            const replacement = makeSystemMessage(this.name, "reconnected", this.deps.global().now());
            replacement.flags.connected = true;
            this.buffer.replace(last, replacement);
            return;
        }
        const message = makeSystemMessage(this.name, "connected", this.deps.global().now());
        message.flags.connected = true;
        this.addMessage(message);
    }

    markDisconnected(): void {
        const message = makeSystemMessage(this.name, "disconnected", this.deps.global().now());
        message.flags.disconnected = true;
        this.addMessage(message);
        this.updateInfo({ connected: false });
    }

    setLive(live: ChannelInfo["live"]): void {
        const wasLive = !!this.state.live?.live;
        const isLive = !!live?.live;
        this.updateInfo({ live });
        const title = this.deps.settings().showTitleInLiveMessage ? live?.title : undefined;
        if (isLive && !wasLive) this.addMessage(makeLiveMessage(this.name, this.displayName(), Date.now(), title));
        else if (!isLive && wasLive) this.addMessage(makeOfflineMessage(this.name, this.displayName()));
    }

    beginHistory(): boolean {
        if (this.loadingHistory) return false;
        this.loadingHistory = true;
        return true;
    }

    endHistory(): void {
        this.loadingHistory = false;
    }

    dispose(): void {
        if (this.joinTimer !== undefined) this.deps.timers.clearTimeout(this.joinTimer);
        if (this.partTimer !== undefined) this.deps.timers.clearTimeout(this.partTimer);
        this.buffer.dispose();
    }

    private liveSink(): MessageSink {
        return {
            messages: () => this.buffer.messages(),
            add: (message) => this.addMessage(message),
            replace: (previous, replacement) => this.buffer.replace(previous, replacement),
            findById: (id) => this.buffer.findById(id),
            changed: (message) => this.buffer.changed(message),
        };
    }

    private completionEmotes(): EmoteCandidate[] {
        const candidates: EmoteCandidate[] = [];
        const push = (emotes: Iterable<Emote>, provider: string) => {
            for (const emote of emotes) candidates.push({ emote, provider });
        };
        const globals = this.deps.globalEmotes();
        const settings = this.deps.settings();
        const unlisted = settings.showUnlistedSevenTVEmotes;
        push(this.deps.twitchEmotes(), "Twitch Emote");
        push(visibleEmotes(this.emoteSets.bttv, settings.enableBTTVChannelEmotes, unlisted), "Channel BetterTTV");
        push(visibleEmotes(this.emoteSets.ffz, settings.enableFFZChannelEmotes, unlisted), "Channel FrankerFaceZ");
        push(visibleEmotes(this.emoteSets.seventv, settings.enableSevenTVChannelEmotes, unlisted), "Channel 7TV");
        push(visibleEmotes(globals.bttv, settings.enableBTTVGlobalEmotes, unlisted), "Global BetterTTV");
        push(visibleEmotes(globals.ffz, settings.enableFFZGlobalEmotes, unlisted), "Global FrankerFaceZ");
        push(visibleEmotes(globals.seventv, settings.enableSevenTVGlobalEmotes, unlisted), "Global 7TV");
        return candidates;
    }

    private completionUsers() {
        const users = this.chatters.all();
        const includeBroadcaster = this.deps.settings().alwaysIncludeBroadcasterInUserCompletions;
        if (includeBroadcaster && !this.chatters.has(this.name)) users.push({ login: this.name, displayName: this.displayName() });
        return users;
    }
}
