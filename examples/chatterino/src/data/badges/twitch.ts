import type { Badge } from "../emotes/types";

type IvrBadgeVersion = {
    id: string;
    title?: string;
    description?: string;
    image_url_1x?: string;
    image_url_2x?: string;
    image_url_4x?: string;
};

type IvrBadgeSet = { set_id: string; versions?: IvrBadgeVersion[] };

export type BadgeMap = Map<string, Badge>;

export function badgeKey(setId: string, version: string): string {
    return `${setId}/${version}`;
}

export function parseIvrBadges(json: unknown): BadgeMap {
    const map: BadgeMap = new Map();
    if (!Array.isArray(json)) return map;
    for (const set of json as IvrBadgeSet[]) {
        if (!set?.set_id) continue;
        for (const version of set.versions ?? []) {
            const url = version.image_url_1x;
            if (!url) continue;
            const key = badgeKey(set.set_id, version.id);
            map.set(key, {
                key,
                name: set.set_id,
                url,
                width: 18,
                height: 18,
                tooltip: version.title ?? set.set_id,
                tooltipImage: version.image_url_4x ?? version.image_url_2x ?? url,
            });
        }
    }
    return map;
}

export const IVR_GLOBAL_BADGES_URL = "https://api.ivr.fi/v2/twitch/badges/global";

export function ivrChannelBadgesUrl(login: string): string {
    return `https://api.ivr.fi/v2/twitch/badges/channel?login=${encodeURIComponent(login)}`;
}

const GLOBAL_AUTHORITY = new Set(["staff", "admin", "global_mod"]);
const CHANNEL_AUTHORITY = new Set(["moderator", "lead_moderator", "vip", "broadcaster"]);
const PREDICTIONS = new Set(["predictions"]);
const SUBSCRIPTION = new Set(["subscriber", "founder"]);

export type BadgeCategory = "globalAuthority" | "channelAuthority" | "predictions" | "subscription" | "vanity";

export function badgeCategory(setId: string): BadgeCategory {
    if (GLOBAL_AUTHORITY.has(setId)) return "globalAuthority";
    if (CHANNEL_AUTHORITY.has(setId)) return "channelAuthority";
    if (PREDICTIONS.has(setId)) return "predictions";
    if (SUBSCRIPTION.has(setId)) return "subscription";
    return "vanity";
}
