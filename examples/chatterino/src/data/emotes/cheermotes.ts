import type { Emote } from "./types";

export type CheermoteTier = { minBits: number; color: string; image: Emote };

export type CheermoteSet = { prefix: string; regex: RegExp; tiers: CheermoteTier[] };

const DEFAULT_TIERS: Array<[number, string]> = [
    [1, "#979797"],
    [100, "#9c3ee8"],
    [1000, "#1db2a5"],
    [5000, "#0099fe"],
    [10000, "#f43021"],
];

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cheerImage(prefix: string, minBits: number, url: string, tooltipImage: string): Emote {
    return {
        id: `${prefix}${minBits}`,
        name: `${prefix}${minBits}`,
        url,
        tooltipImage,
        width: 28,
        height: 28,
        provider: "twitch",
        scope: "global",
        tooltip: `${prefix}${minBits}\nTwitch Cheermote`,
        animated: true,
    };
}

export function makeCheermoteSet(prefix: string, tiers: CheermoteTier[]): CheermoteSet {
    const sorted = [...tiers].sort((a, b) => a.minBits - b.minBits);
    return { prefix, regex: new RegExp(`^${escapeRegex(prefix)}([1-9][0-9]*)$`, "i"), tiers: sorted };
}

export function defaultCheermotes(): CheermoteSet[] {
    const prefix = "Cheer";
    const tiers = DEFAULT_TIERS.map(([minBits, color]) => {
        const base = `https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/${minBits}`;
        return { minBits, color, image: cheerImage(prefix, minBits, `${base}/1.gif`, `${base}/4.gif`) };
    });
    return [makeCheermoteSet(prefix, tiers)];
}

type HelixCheermoteTier = {
    min_bits: number;
    color: string;
    can_cheer?: boolean;
    images?: { dark?: { animated?: Record<string, string>; static?: Record<string, string> } };
};

type HelixCheermote = { prefix: string; tiers: HelixCheermoteTier[] };

export function parseHelixCheermotes(json: unknown): CheermoteSet[] {
    const data = ((json as { data?: HelixCheermote[] } | undefined)?.data ?? []) as HelixCheermote[];
    const sets: CheermoteSet[] = [];
    for (const entry of data) {
        if (!entry?.prefix) continue;
        const tiers: CheermoteTier[] = [];
        for (const tier of entry.tiers ?? []) {
            const images = tier.images?.dark?.animated ?? tier.images?.dark?.static;
            const url = images?.["1"];
            if (!url) continue;
            const large = images?.["4"] ?? images?.["3"] ?? url;
            tiers.push({ minBits: tier.min_bits, color: tier.color, image: cheerImage(entry.prefix, tier.min_bits, url, large) });
        }
        if (tiers.length > 0) sets.push(makeCheermoteSet(entry.prefix, tiers));
    }
    return sets;
}

export type CheerMatch = { tier: CheermoteTier; amount: number };

export function matchCheer(sets: CheermoteSet[], word: string): CheerMatch | undefined {
    for (const set of sets) {
        const match = set.regex.exec(word);
        if (!match) continue;
        const amount = Number(match[1]);
        let selected: CheermoteTier | undefined;
        for (const tier of set.tiers) {
            if (tier.minBits <= amount) selected = tier;
        }
        if (selected) return { tier: selected, amount };
    }
    return undefined;
}
