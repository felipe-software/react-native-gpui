type ProcessLike = { process?: { env?: Record<string, string | undefined> } };

const enabled = !!(globalThis as ProcessLike).process?.env?.CHATTERINO_TIMING;

export function markTiming(event: string, detail: Record<string, unknown> = {}): void {
    if (!enabled) return;
    console.log(`[chatterino-timing] ${JSON.stringify({ event, t: Date.now(), ...detail })}`);
}
