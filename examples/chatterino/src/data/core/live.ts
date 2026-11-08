import type { ChatChannel } from "../channel/chat-channel";
import type { Timers } from "../irc/connection";
import { fetchUsers, liveStatusOf, LIVE_BATCH_SIZE, LIVE_POLL_INTERVAL_MS } from "../users";
import type { FetchLike } from "../util/http";

export type LivePollerDeps = {
    fetch: FetchLike;
    timers: Timers;
    channels: () => Map<string, ChatChannel>;
    onWentLive: (channel: ChatChannel, title: string | undefined) => void;
};

export class LivePoller {
    private timer: unknown;
    private stopped = true;

    constructor(private readonly deps: LivePollerDeps) {}

    start(): void {
        if (!this.stopped) return;
        this.stopped = false;
        this.schedule();
    }

    stop(): void {
        this.stopped = true;
        if (this.timer !== undefined) this.deps.timers.clearTimeout(this.timer);
        this.timer = undefined;
    }

    async poll(): Promise<void> {
        const channels = this.deps.channels();
        const names = [...channels.keys()];
        for (let i = 0; i < names.length; i += LIVE_BATCH_SIZE) {
            try {
                const users = await fetchUsers(this.deps.fetch, names.slice(i, i + LIVE_BATCH_SIZE));
                for (const user of users) this.apply(channels.get(user.login.toLowerCase()), liveStatusOf(user));
            } catch (error) {
                console.warn("live status poll failed", error);
            }
        }
    }

    private apply(channel: ChatChannel | undefined, live: ReturnType<typeof liveStatusOf>): void {
        if (!channel) return;
        const wasLive = !!channel.info().live?.live;
        channel.setLive(live);
        if (live.live && !wasLive) this.deps.onWentLive(channel, live.title);
    }

    private schedule(): void {
        if (this.stopped) return;
        this.timer = this.deps.timers.setTimeout(() => {
            this.timer = undefined;
            void this.poll().finally(() => this.schedule());
        }, LIVE_POLL_INTERVAL_MS);
    }
}
