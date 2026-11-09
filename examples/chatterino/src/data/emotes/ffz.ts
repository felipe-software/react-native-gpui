import type { Emote, EmoteMap } from "./types";

type FfzUrls = Record<string, string | null | undefined>;

type FfzEmoteJson = {
    id: number;
    name: string;
    width?: number;
    height?: number;
    owner?: { display_name?: string };
    urls?: FfzUrls;
    animated?: FfzUrls | null;
};

type FfzSetJson = { id?: number; emoticons?: FfzEmoteJson[] };

type FfzGlobalJson = { default_sets?: number[]; sets?: Record<string, FfzSetJson> };

type FfzRoomJson = {
    room?: { mod_urls?: FfzUrls | null; vip_badge?: FfzUrls | null };
    sets?: Record<string, FfzSetJson>;
};

export type FfzChannelData = { emotes: EmoteMap; modBadge?: string; vipBadge?: string };

function fixUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    return url.startsWith("//") ? `https:${url}` : url;
}

function parseSetInto(set: FfzSetJson, kind: "Global" | "Channel", map: EmoteMap): void {
    const scope = kind === "Global" ? "global" : "channel";
    for (const entry of set.emoticons ?? []) {
        if (!entry?.name) continue;
        const animatedUrls = entry.animated && typeof entry.animated === "object" ? entry.animated : undefined;
        const urls = animatedUrls ?? entry.urls ?? {};
        const url = fixUrl(urls["1"]);
        if (!url) continue;
        const author = entry.owner?.display_name ?? "";
        const emote: Emote = {
            id: String(entry.id),
            name: entry.name,
            url,
            tooltipImage: fixUrl(urls["4"]) ?? fixUrl(urls["2"]) ?? url,
            width: entry.width ?? 28,
            height: entry.height ?? 28,
            provider: "ffz",
            scope,
            tooltip: `${entry.name}\n${kind} FFZ Emote\nBy: ${author}`,
            homePage: `https://www.frankerfacez.com/emoticon/${entry.id}-${entry.name}`,
        };
        if (animatedUrls) emote.animated = true;
        map.set(entry.name, emote);
    }
}

export function parseFfzGlobal(json: unknown): EmoteMap {
    const root = (json ?? {}) as FfzGlobalJson;
    const defaults = new Set(root.default_sets ?? []);
    const map: EmoteMap = new Map();
    for (const set of Object.values(root.sets ?? {})) {
        if (!defaults.has(set.id ?? -1)) continue;
        parseSetInto(set, "Global", map);
    }
    return map;
}

export function parseFfzChannel(json: unknown): FfzChannelData {
    const root = (json ?? {}) as FfzRoomJson;
    const emotes: EmoteMap = new Map();
    for (const set of Object.values(root.sets ?? {})) parseSetInto(set, "Channel", emotes);
    const modUrls = root.room?.mod_urls ?? undefined;
    const vipUrls = root.room?.vip_badge ?? undefined;
    return {
        emotes,
        modBadge: modUrls ? fixUrl(modUrls["1"]) : undefined,
        vipBadge: vipUrls ? fixUrl(vipUrls["1"]) : undefined,
    };
}

export const FFZ_GLOBAL_URL = "https://api.frankerfacez.com/v1/set/global";

export function ffzChannelUrl(roomId: string): string {
    return `https://api.frankerfacez.com/v1/room/id/${roomId}`;
}
