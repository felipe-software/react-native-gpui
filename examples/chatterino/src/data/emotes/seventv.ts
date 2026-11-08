import { HttpError, requestJson, type FetchLike } from "../util/http";
import type { Emote, EmoteMap } from "./types";

const ACTIVE_ZERO_WIDTH = 1;
const CONTENT_TWITCH_DISALLOWED = 1 << 24;

type SeventvFile = { name: string; static_name?: string; width: number; height: number; format: string };

type SeventvEmoteData = {
    name?: string;
    flags?: number;
    listed?: boolean;
    animated?: boolean;
    owner?: { display_name?: string } | null;
    host?: { url: string; files: SeventvFile[] };
};

type SeventvActiveEmote = { id: string; name: string; flags?: number; data?: SeventvEmoteData | null };

type SeventvEmoteSet = { emotes?: SeventvActiveEmote[] | null };

type SeventvUser = { emote_set?: SeventvEmoteSet | null };

function webpFiles(data: SeventvEmoteData): SeventvFile[] {
    return (data.host?.files ?? []).filter((file) => file.format === "WEBP");
}

function tooltipFor(name: string, baseName: string, author: string, isGlobal: boolean): string {
    const kind = isGlobal ? "Global" : "Channel";
    const by = author || "<deleted>";
    if (name !== baseName) return `${name}\nAlias of ${baseName}\n${kind} 7TV Emote\nBy: ${by}`;
    return `${name}\n${kind} 7TV Emote\nBy: ${by}`;
}

function isVisible(data: SeventvEmoteData): boolean {
    if (!data.listed) return false;
    return ((data.flags ?? 0) & CONTENT_TWITCH_DISALLOWED) === 0;
}

export function parseSeventvEmotes(emotes: SeventvActiveEmote[] | null | undefined, isGlobal: boolean): EmoteMap {
    const map: EmoteMap = new Map();
    for (const active of emotes ?? []) {
        const data = active?.data;
        if (!data || !isVisible(data)) continue;
        const files = webpFiles(data);
        const base = files[0];
        if (!base || !data.host) continue;
        const largest = files[files.length - 1];
        const hostUrl = `https:${data.host.url}`;
        const emote: Emote = {
            id: active.id,
            name: active.name,
            url: `${hostUrl}/${base.name}`,
            tooltipImage: `${hostUrl}/${largest.name}`,
            width: base.width,
            height: base.height || 16,
            provider: "7tv",
            scope: isGlobal ? "global" : "channel",
            tooltip: tooltipFor(active.name, data.name ?? active.name, data.owner?.display_name ?? "", isGlobal),
            homePage: `https://7tv.app/emotes/${active.id}`,
        };
        if (((active.flags ?? 0) & ACTIVE_ZERO_WIDTH) !== 0) emote.zeroWidth = true;
        if (data.animated) emote.animated = true;
        map.set(active.name, emote);
    }
    return map;
}

export function parseSeventvGlobal(json: unknown): EmoteMap {
    return parseSeventvEmotes((json as SeventvEmoteSet | undefined)?.emotes, true);
}

export function parseSeventvChannel(json: unknown): EmoteMap {
    return parseSeventvEmotes((json as SeventvUser | undefined)?.emote_set?.emotes, false);
}

export async function loadSeventvGlobal(fetchFn: FetchLike): Promise<EmoteMap> {
    return parseSeventvGlobal(await requestJson(fetchFn, "https://7tv.io/v3/emote-sets/global", { timeoutMs: 30_000 }));
}

export async function loadSeventvChannel(fetchFn: FetchLike, roomId: string): Promise<EmoteMap> {
    try {
        const json = await requestJson(fetchFn, `https://7tv.io/v3/users/twitch/${roomId}`, { timeoutMs: 30_000 });
        return parseSeventvChannel(json);
    } catch (error) {
        if (error instanceof HttpError && error.status === 404) return new Map();
        throw error;
    }
}
