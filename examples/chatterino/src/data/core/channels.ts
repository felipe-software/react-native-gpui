import type { Settings } from "../api";
import type { ChatChannel } from "../channel/chat-channel";
import type { MentionsChannel } from "../channel/mentions-channel";
import { buildHistory, fetchHistory } from "../history";
import type { Timers } from "../irc/connection";
import type { TwitchConnections } from "../twitch/connections";
import { fetchUsers, liveStatusOf } from "../users";
import type { FetchLike } from "../util/http";
import { channelKey, waitAtMost } from "./runtime";

const LEAVE_GRACE_MS = 5_000;
const HISTORY_EMOTE_WAIT_MS = 5_000;

export type ChannelRegistryDeps = {
    create: (name: string) => ChatChannel;
    fetch: FetchLike;
    timers: Timers;
    settings: () => Settings;
    connections: TwitchConnections;
    mentions: MentionsChannel;
    globalsReady: () => Promise<void>;
    onJoined?: (channel: ChatChannel) => void;
    loggedIn?: () => boolean;
};

export class ChannelRegistry {
    readonly channels = new Map<string, ChatChannel>();
    private readonly leaveTimers = new Map<string, unknown>();
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
            this.deps.connections.read.part(key);
            channel.dispose();
        }, LEAVE_GRACE_MS);
        this.leaveTimers.set(key, timer);
    }

    applyRoomId(channel: ChatChannel, roomId: string): void {
        void channel.emoteSets.loadForRoom(roomId, channel.displayName());
        if (this.deps.loggedIn?.()) void channel.emoteSets.loadBadges(channel.name, roomId);
    }

    dispose(): void {
        this.disposed = true;
        for (const timer of this.leaveTimers.values()) this.deps.timers.clearTimeout(timer);
        this.leaveTimers.clear();
        for (const channel of this.channels.values()) channel.dispose();
        this.channels.clear();
    }

    private isCurrent(channel: ChatChannel): boolean {
        return !this.disposed && this.channels.get(channel.name) === channel;
    }

    private init(channel: ChatChannel): void {
        this.deps.connections.read.join(channel.name);
        void channel.emoteSets.loadBadges(channel.name);
        void this.lookup(channel);
        void this.loadHistory(channel);
        this.deps.onJoined?.(channel);
    }

    private async lookup(channel: ChatChannel): Promise<void> {
        try {
            const [user] = await fetchUsers(this.deps.fetch, [channel.name]);
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

    private async loadHistory(channel: ChatChannel): Promise<void> {
        const settings = this.deps.settings();
        if (!settings.loadHistoryOnJoin || !channel.beginHistory()) return;
        try {
            const { lines, notice } = await fetchHistory(this.deps.fetch, channel.name, settings.historyLimit);
            if (!this.isCurrent(channel)) return;
            const ready = Promise.all([this.deps.globalsReady(), channel.emoteSets.ready()]);
            await waitAtMost(ready, HISTORY_EMOTE_WAIT_MS, this.deps.timers);
            if (!this.isCurrent(channel)) return;
            const accepted = channel.buffer.prepend(buildHistory(channel, lines, this.deps.timers.now()));
            for (const message of accepted) {
                if (!message.flags.system && message.displayName) channel.chatters.add(message.displayName);
            }
            this.deps.mentions.fillIn(accepted.filter((message) => message.flags.highlighted && message.flags.showInMentions));
            if (notice) channel.addSystemMessage(notice);
        } finally {
            channel.endHistory();
        }
    }
}
