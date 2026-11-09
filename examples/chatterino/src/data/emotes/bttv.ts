import type { Emote, EmoteMap } from "./types";

const ZERO_WIDTH = new Set(["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"]);

type BttvEmoteJson = {
    id: string;
    code: string;
    animated?: boolean;
    width?: number;
    height?: number;
    user?: { displayName?: string };
};

type BttvChannelJson = { channelEmotes?: BttvEmoteJson[]; sharedEmotes?: BttvEmoteJson[] };

function cdnUrl(id: string, scale: "1x" | "2x" | "3x"): string {
    return `https://cdn.betterttv.net/emote/${id}/${scale}.webp`;
}

function makeEmote(json: BttvEmoteJson, scope: Emote["scope"], tooltip: string, zeroWidth: boolean): Emote {
    const emote: Emote = {
        id: json.id,
        name: json.code,
        url: cdnUrl(json.id, "1x"),
        tooltipImage: cdnUrl(json.id, "3x"),
        width: json.width ?? 28,
        height: json.height ?? 28,
        provider: "bttv",
        scope,
        tooltip,
        homePage: `https://betterttv.com/emotes/${json.id}`,
    };
    if (zeroWidth) emote.zeroWidth = true;
    if (json.animated) emote.animated = true;
    return emote;
}

export function parseBttvGlobal(json: unknown): EmoteMap {
    const map: EmoteMap = new Map();
    if (!Array.isArray(json)) return map;
    for (const entry of json as BttvEmoteJson[]) {
        if (!entry?.id || !entry.code) continue;
        const tooltip = `${entry.code}\nGlobal BetterTTV Emote`;
        map.set(entry.code, makeEmote(entry, "global", tooltip, ZERO_WIDTH.has(entry.code)));
    }
    return map;
}

export function parseBttvChannel(json: unknown, channelDisplayName: string): EmoteMap {
    const map: EmoteMap = new Map();
    const root = (json ?? {}) as BttvChannelJson;
    const entries = [...(root.channelEmotes ?? []), ...(root.sharedEmotes ?? [])];
    for (const entry of entries) {
        if (!entry?.id || !entry.code) continue;
        const author = entry.user?.displayName ?? "";
        const kind = author ? "Shared" : "Channel";
        const tooltip = `${entry.code}\n${kind} BetterTTV Emote\nBy: ${author || channelDisplayName}`;
        map.set(entry.code, makeEmote(entry, "channel", tooltip, false));
    }
    return map;
}

export const BTTV_GLOBAL_URL = "https://api.betterttv.net/3/cached/emotes/global";

export function bttvChannelUrl(roomId: string): string {
    return `https://api.betterttv.net/3/cached/users/twitch/${roomId}`;
}
