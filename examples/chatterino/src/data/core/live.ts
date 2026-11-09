import type { Account, LiveStatus } from "../api";
import type { Timers } from "../irc/connection";
import { Helix, type HelixStream } from "../twitch/helix";
import { fetchUsers, liveStatusOf } from "../users";
import type { FetchLike } from "../util/http";

export const HELIX_LIVE_INTERVAL_MS = 30_000;
export const ANONYMOUS_LIVE_INTERVAL_MS = 60_000;
export const HELIX_LIVE_BATCH = 100;
export const ANONYMOUS_LIVE_BATCH = 25;
const POKE_DELAY_MS = 1_000;

export type LiveSource = {
    batchSize: number;
    intervalMs: number;
    fetch(logins: string[]): Promise<Map<string, LiveStatus>>;
};

export function streamStatus(stream: HelixStream): LiveStatus {
    const status: LiveStatus = { live: true };
    if (stream.title) status.title = stream.title;
    if (stream.game_name) status.game = stream.game_name;
    if (typeof stream.viewer_count === "number") status.viewers = stream.viewer_count;
    const startedAt = stream.started_at ? Date.parse(stream.started_at) : NaN;
    if (Number.isFinite(startedAt)) status.startedAt = startedAt;
    return status;
}

export function helixLiveSource(fetchFn: FetchLike, account: Account): LiveSource {
    const helix = new Helix(fetchFn, account);
    return {
        batchSize: HELIX_LIVE_BATCH,
        intervalMs: HELIX_LIVE_INTERVAL_MS,
        async fetch(logins) {
            const streams = await helix.streams({ userLogin: logins });
            const statuses = new Map<string, LiveStatus>();
            for (const stream of streams) statuses.set(stream.user_login.toLowerCase(), streamStatus(stream));
            return statuses;
        },
    };
}

export function anonymousLiveSource(fetchFn: FetchLike): LiveSource {
    return {
        batchSize: ANONYMOUS_LIVE_BATCH,
        intervalMs: ANONYMOUS_LIVE_INTERVAL_MS,
        async fetch(logins) {
            const users = await fetchUsers(fetchFn, logins);
            const statuses = new Map<string, LiveStatus>();
            for (const user of users) {
                const status = liveStatusOf(user);
                if (status.live) statuses.set(user.login.toLowerCase(), status);
            }
            return statuses;
        },
    };
}

export type LivePollerDeps = {
    timers: Timers;
    source: () => LiveSource;
    targets: () => string[];
    onStatus: (login: string, status: LiveStatus, initial: boolean) => void;
};

export class LivePoller {
    private timer: unknown;
    private pokeTimer: unknown;
    private stopped = true;
    private polling = false;
    private readonly known = new Set<string>();

    constructor(private readonly deps: LivePollerDeps) {}

    start(): void {
        if (!this.stopped) return;
        this.stopped = false;
        this.schedule();
    }

    stop(): void {
        this.stopped = true;
        if (this.timer !== undefined) this.deps.timers.clearTimeout(this.timer);
        if (this.pokeTimer !== undefined) this.deps.timers.clearTimeout(this.pokeTimer);
        this.timer = undefined;
        this.pokeTimer = undefined;
    }

    reset(): void {
        this.known.clear();
        this.poke();
    }

    poke(): void {
        if (this.stopped || this.pokeTimer !== undefined) return;
        this.pokeTimer = this.deps.timers.setTimeout(() => {
            this.pokeTimer = undefined;
            void this.poll();
        }, POKE_DELAY_MS);
    }

    async poll(): Promise<void> {
        if (this.polling) return;
        this.polling = true;
        try {
            const source = this.deps.source();
            const logins = [...new Set(this.deps.targets().map((login) => login.toLowerCase()).filter(Boolean))];
            for (let i = 0; i < logins.length; i += source.batchSize) {
                const batch = logins.slice(i, i + source.batchSize);
                try {
                    const statuses = await source.fetch(batch);
                    for (const login of batch) {
                        const initial = !this.known.has(login);
                        this.known.add(login);
                        this.deps.onStatus(login, statuses.get(login) ?? { live: false }, initial);
                    }
                } catch (error) {
                    console.warn("Failed stream check request", error);
                }
            }
        } finally {
            this.polling = false;
        }
    }

    private schedule(): void {
        if (this.stopped) return;
        this.timer = this.deps.timers.setTimeout(() => {
            this.timer = undefined;
            void this.poll().finally(() => this.schedule());
        }, this.deps.source().intervalMs);
    }
}
