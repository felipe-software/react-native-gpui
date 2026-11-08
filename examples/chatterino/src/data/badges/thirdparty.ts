import { requestJson, type FetchLike } from "../util/http";
import type { Badge } from "../emotes/types";

export type UserBadgeMap = Map<string, Badge>;

type ChatterinoBadgeJson = { tooltip?: string; image1?: string; image2?: string; image3?: string; users?: string[] };

type BttvBadgeJson = { providerId?: string; badge?: { description?: string; svg?: string } };

export function parseChatterinoBadges(json: unknown): UserBadgeMap {
    const map: UserBadgeMap = new Map();
    const badges = ((json as { badges?: ChatterinoBadgeJson[] } | undefined)?.badges ?? []) as ChatterinoBadgeJson[];
    for (const entry of badges) {
        if (!entry?.image1) continue;
        const tooltip = entry.tooltip ?? "Chatterino";
        const badge: Badge = {
            key: `chatterino:${tooltip}`,
            name: `chatterino:${tooltip}`,
            url: entry.image1,
            width: 18,
            height: 18,
            tooltip,
            tooltipImage: entry.image3 ?? entry.image2 ?? entry.image1,
        };
        for (const userId of entry.users ?? []) map.set(String(userId), badge);
    }
    return map;
}

export function parseBttvBadges(json: unknown): UserBadgeMap {
    const map: UserBadgeMap = new Map();
    if (!Array.isArray(json)) return map;
    for (const entry of json as BttvBadgeJson[]) {
        const url = entry?.badge?.svg;
        if (!url || !entry.providerId) continue;
        const tooltip = entry.badge?.description ?? "BetterTTV";
        map.set(entry.providerId, {
            key: `betterttv:${tooltip}`,
            name: `betterttv:${tooltip}`,
            url,
            width: 18,
            height: 18,
            tooltip,
            tooltipImage: url,
        });
    }
    return map;
}

export async function loadChatterinoBadges(fetchFn: FetchLike): Promise<UserBadgeMap> {
    return parseChatterinoBadges(await requestJson(fetchFn, "https://api.chatterino.com/badges"));
}

export async function loadBttvBadges(fetchFn: FetchLike): Promise<UserBadgeMap> {
    return parseBttvBadges(await requestJson(fetchFn, "https://api.betterttv.net/3/cached/badges/twitch"));
}
