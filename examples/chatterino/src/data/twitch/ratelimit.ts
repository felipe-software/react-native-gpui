export type RateDecision = { ok: true } | { ok: false; reason: string; announce: boolean };

const WINDOW_MS = 32_000;
const ERROR_COOLDOWN_MS = 30_000;

type Bucket = { sent: number[] };

export class SendRateLimiter {
    private readonly pleb: Bucket = { sent: [] };
    private readonly mod: Bucket = { sent: [] };
    private lastSpeedError = -Infinity;
    private lastAmountError = -Infinity;

    constructor(private readonly now: () => number) {}

    check(highRateLimit: boolean): RateDecision {
        const bucket = highRateLimit ? this.mod : this.pleb;
        const maxMessages = highRateLimit ? 99 : 19;
        const minOffset = highRateLimit ? 100 : 1100;
        const now = this.now();
        const last = bucket.sent[bucket.sent.length - 1];
        if (last !== undefined && last + minOffset > now) {
            const announce = this.lastSpeedError + ERROR_COOLDOWN_MS < now;
            if (announce) this.lastSpeedError = now;
            return { ok: false, reason: "You are sending messages too quickly.", announce };
        }
        while (bucket.sent.length > 0 && bucket.sent[0] + WINDOW_MS < now) bucket.sent.shift();
        if (bucket.sent.length >= maxMessages) {
            const announce = this.lastAmountError + ERROR_COOLDOWN_MS < now;
            if (announce) this.lastAmountError = now;
            return { ok: false, reason: "You are sending too many messages.", announce };
        }
        bucket.sent.push(now);
        return { ok: true };
    }
}
