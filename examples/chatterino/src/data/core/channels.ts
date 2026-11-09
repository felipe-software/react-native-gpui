import type { ChatListMessage } from "react-native-gpui";
import type { Settings } from "../api";
import type { ChatChannel } from "../channel/chat-channel";
import type { MentionsChannel } from "../channel/mentions-channel";
import { buildHistory, fetchHistory } from "../history";
import type { IrcMessage } from "../irc/message";
import type { Timers } from "../irc/connection";
import type { ChatMessage } from "../messages/model";
import type { TwitchConnections } from "../twitch/connections";
import { fetchUsers, liveStatusOf } from "../users";
import type { FetchLike } from "../util/http";
import { markTiming } from "../util/timing";
import { channelKey, waitAtMost } from "./runtime";

const LEAVE_GRACE_MS = 5_000;
const CACHED_EMOTES_WAIT_MS = 500;
const REBUILD_DELAY_MS = 30;
const PREFETCH_TAIL_MESSAGES = 20;

export type RoomIdCache = {
    get(channel: string): string | undefined;
    set(channel: string, roomId: string): void;
};

export type ChannelRegistryDeps = {
    create: (name: string) => ChatChannel;
    fetch: FetchLike;
    timers: Timers;
    settings: () => Settings;
    connections: TwitchConnections;
    mentions: MentionsChannel;
    onJoined?: (channel: ChatChannel) => void;
    loggedIn?: () => boolean;
    globalsCached: () => Promise<void>;
    globalsVersion: () => number;
    recentMessagesUrl?: string;
    roomIds?: RoomIdCache;
    prefetchImages?: (urls: string[]) => void;
};

type HistoryState = { lines: IrcMessage[]; stamp: string };

export function imageUrls(messages: readonly ChatListMessage[]): string[] {
    const urls = new Set<string>();
    for (const message of messages) {
        for (const element of message.elements) {
            if (element.kind === "emote" || element.kind === "badge") urls.add(element.url);
        }
    }
    return [...urls];
}

export class ChannelRegistry {
    readonly channels = new Map<string, ChatChannel>();
    private readonly leaveTimers = new Map<string, unknown>();
    private readonly histories = new Map<ChatChannel, HistoryState>();
    private readonly rebuildTimers = new Map<ChatChannel, unknown>();
    private disposed = false;

    constructor(private readonly deps: ChannelRegistryDeps) {}

    get(name: string): ChatChannel | undefined {
        return this.channels.get(name);
    }

    values(): IterableIterator<ChatChannel> {
        return this.channels.values();
    }

    join(name: string): ChatChannel {
        const key = channelKey(name);
        const pendingLeave = this.leaveTimers.get(key);
        if (pendingLeave !== undefined) {
            this.deps.timers.clearTimeout(pendingLeave);
            this.leaveTimers.delete(key);
        }
        let channel = this.channels.get(key);
        if (!channel) {
            channel = this.deps.create(key);
            this.channels.set(key, channel);
            this.init(channel);
        }
        channel.refs += 1;
        return channel;
    }

    leave(name: string): void {
        const key = channelKey(name);
        const channel = this.channels.get(key);
        if (!channel) return;
        channel.refs = Math.max(0, channel.refs - 1);
        if (channel.refs > 0 || this.leaveTimers.has(key)) return;
        const timer = this.deps.timers.setTimeout(() => {
            this.leaveTimers.delete(key);
            if (channel.refs > 0 || this.channels.get(key) !== channel) return;
            this.channels.delete(key);
            this.forgetHistory(channel);
            this.deps.connections.read.part(key);
            channel.dispose();
        }, LEAVE_GRACE_MS);
        this.leaveTimers.set(key, timer);
    }

    applyRoomId(channel: ChatChannel, roomId: string): void {
        this.deps.roomIds?.set(channel.name, roomId);
        void channel.emoteSets.loadForRoom(roomId, channel.displayName());
        if (this.deps.loggedIn?.()) void channel.emoteSets.loadBadges(channel.name, roomId);
    }

    emotesChanged(channel?: ChatChannel): void {
        const targets = channel ? [channel] : [...this.histories.keys()];
        for (const target of targets) {
            if (!this.histories.has(target) || this.rebuildTimers.has(target)) continue;
            const timer = this.deps.timers.setTimeout(() => {
                this.rebuildTimers.delete(target);
                this.rebuildHistory(target);
            }, REBUILD_DELAY_MS);
            this.rebuildTimers.set(target, timer);
        }
    }

    dispose(): void {
        this.disposed = true;
        for (const timer of this.leaveTimers.values()) this.deps.timers.clearTimeout(timer);
        for (const timer of this.rebuildTimers.values()) this.deps.timers.clearTimeout(timer);
        this.leaveTimers.clear();
        this.rebuildTimers.clear();
        this.histories.clear();
        for (const channel of this.channels.values()) channel.dispose();
        this.channels.clear();
    }

    private isCurrent(channel: ChatChannel): boolean {
        return !this.disposed && this.channels.get(channel.name) === channel;
    }

    private init(channel: ChatChannel): void {
        markTiming("channel:join", { channel: channel.name });
        this.deps.connections.read.join(channel.name);
        void channel.emoteSets.loadBadges(channel.name);
        const cachedRoomId = this.deps.roomIds?.get(channel.name);
        if (cachedRoomId) this.applyRoomId(channel, cachedRoomId);
        void this.lookup(channel);
        void this.loadHistory(channel);
        this.deps.onJoined?.(channel);
    }

    private async lookup(channel: ChatChannel): Promise<void> {
        try {
            const [user] = await fetchUsers(this.deps.fetch, [channel.name]);
            markTiming("channel:lookup", { channel: channel.name, roomId: user?.id });
            if (!user || !this.isCurrent(channel)) return;
            const patch: { displayName?: string; roomId?: string } = {};
            if (user.displayName) patch.displayName = user.displayName;
            if (user.id && !channel.info().roomId) patch.roomId = user.id;
            channel.updateInfo(patch);
            const roomId = channel.info().roomId;
            if (roomId) this.applyRoomId(channel, roomId);
            channel.setLive(liveStatusOf(user));
        } catch (error) {
            console.warn(`failed to look up channel ${channel.name}`, error);
        }
    }

    private stampOf(channel: ChatChannel): string {
        return `${this.deps.globalsVersion()}:${channel.emoteSets.version}`;
    }

    private prefetch(channel: ChatChannel, messages: readonly ChatMessage[]): void {
        const prefetchImages = this.deps.prefetchImages;
        if (!prefetchImages || messages.length === 0) return;
        const tail = messages.slice(-PREFETCH_TAIL_MESSAGES).map((message) => channel.buffer.rendered(message));
        const urls = imageUrls(tail);
        if (urls.length > 0) prefetchImages(urls);
    }

    private async loadHistory(channel: ChatChannel): Promise<void> {
        const settings = this.deps.settings();
        if (!settings.loadHistoryOnJoin || !channel.beginHistory()) return;
        try {
            const { lines, notice } = await fetchHistory(this.deps.fetch, channel.name, settings.historyLimit, this.deps.recentMessagesUrl);
            markTiming("history:fetched", { channel: channel.name, lines: lines.length });
            if (!this.isCurrent(channel)) return;
            const cached = Promise.all([this.deps.globalsCached(), channel.emoteSets.cached()]);
            await waitAtMost(cached, CACHED_EMOTES_WAIT_MS, this.deps.timers);
            if (!this.isCurrent(channel)) return;
            const stamp = this.stampOf(channel);
            const accepted = channel.buffer.prepend(buildHistory(channel, lines, this.deps.timers.now()));
            this.prefetch(channel, accepted);
            channel.buffer.flushNow();
            markTiming("history:prepended", { channel: channel.name, messages: accepted.length });
            this.histories.set(channel, { lines, stamp });
            for (const message of accepted) {
                if (!message.flags.system && message.displayName) channel.chatters.add(message.displayName);
            }
            this.deps.mentions.fillIn(accepted.filter((message) => message.flags.highlighted && message.flags.showInMentions));
            if (notice) channel.addSystemMessage(notice);
        } finally {
            channel.endHistory();
        }
    }

    private rebuildHistory(channel: ChatChannel): void {
        const history = this.histories.get(channel);
        if (!history || !this.isCurrent(channel)) return;
        const stamp = this.stampOf(channel);
        if (stamp === history.stamp) return;
        history.stamp = stamp;
        const replaced = channel.rebuildHistorical(buildHistory(channel, history.lines, this.deps.timers.now()));
        if (replaced.length === 0) return;
        this.prefetch(channel, replaced);
        channel.buffer.flushNow();
        markTiming("history:rebuilt", { channel: channel.name, messages: replaced.length });
    }

    private forgetHistory(channel: ChatChannel): void {
        this.histories.delete(channel);
        const timer = this.rebuildTimers.get(channel);
        if (timer !== undefined) this.deps.timers.clearTimeout(timer);
        this.rebuildTimers.delete(channel);
    }
}
