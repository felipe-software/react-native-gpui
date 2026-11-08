import type { Settings, Store } from "../api";
import type { Timers } from "../irc/connection";
import { STREAMING_SOFTWARE, type PlatformHooks } from "../platform";

const STREAMER_POLL_MS = 20_000;

export class StreamerModeWatcher {
    private timer: unknown;
    private generation = 0;

    constructor(
        private readonly store: Store<boolean>,
        private readonly platform: PlatformHooks,
        private readonly timers: Timers,
    ) {}

    refresh(mode: Settings["streamerMode"]): void {
        this.stop();
        if (mode !== "auto") {
            this.store.set(mode === "on");
            return;
        }
        const generation = this.generation;
        const tick = () => {
            void this.detect().then((active) => {
                if (generation !== this.generation) return;
                this.store.set(active);
                this.timer = this.timers.setTimeout(tick, STREAMER_POLL_MS);
            });
        };
        tick();
    }

    stop(): void {
        this.generation += 1;
        if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
        this.timer = undefined;
    }

    private async detect(): Promise<boolean> {
        const findRunning = this.platform.findRunning;
        if (!findRunning) return false;
        try {
            const running = await findRunning(STREAMING_SOFTWARE);
            return running.length > 0;
        } catch {
            return false;
        }
    }
}
