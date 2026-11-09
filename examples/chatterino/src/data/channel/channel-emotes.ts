import type { Settings } from "../api";
import { badgeKey, ivrChannelBadgesUrl, parseIvrBadges, type BadgeMap } from "../badges/twitch";
import { bttvChannelUrl, parseBttvChannel } from "../emotes/bttv";
import { defaultCheermotes, type CheermoteSet } from "../emotes/cheermotes";
import { ffzChannelUrl, parseFfzChannel } from "../emotes/ffz";
import { parseSeventvChannel, SEVENTV_TIMEOUT_MS, seventvChannelUrl } from "../emotes/seventv";
import type { Badge, Emote, EmoteMap } from "../emotes/types";
import { formatHttpError, isNotFound, requestCachedJson, type CachedRequest, type FetchLike, type RequestInit } from "../util/http";
import { markTiming } from "../util/timing";

export type GlobalEmoteSets = { ffz: EmoteMap; bttv: EmoteMap; seventv: EmoteMap };

export type ChannelEmoteDeps = {
    fetch: FetchLike;
    globals: () => GlobalEmoteSets;
    globalBadges: () => BadgeMap;
    systemMessage: (text: string) => void;
    loadCheermotes?: (roomId: string) => Promise<CheermoteSet[] | undefined>;
    loadBadges?: (login: string, roomId: string | undefined) => Promise<BadgeMap> | undefined;
    settings?: () => Settings;
    onChanged?: () => void;
};

export type EmoteToggles = Pick<
    Settings,
    | "enableFFZChannelEmotes"
    | "enableBTTVChannelEmotes"
    | "enableSevenTVChannelEmotes"
    | "enableFFZGlobalEmotes"
    | "enableBTTVGlobalEmotes"
    | "enableSevenTVGlobalEmotes"
    | "showUnlistedSevenTVEmotes"
>;

const ALL_ON: EmoteToggles = {
    enableFFZChannelEmotes: true,
    enableBTTVChannelEmotes: true,
    enableSevenTVChannelEmotes: true,
    enableFFZGlobalEmotes: true,
    enableBTTVGlobalEmotes: true,
    enableSevenTVGlobalEmotes: true,
    showUnlistedSevenTVEmotes: false,
};

function pick(map: EmoteMap, name: string, enabled: boolean, showUnlisted: boolean): Emote | undefined {
    if (!enabled) return undefined;
    const emote = map.get(name);
    if (!emote || (emote.unlisted && !showUnlisted)) return undefined;
    return emote;
}

export function visibleEmotes(map: EmoteMap, enabled: boolean, showUnlisted: boolean): Emote[] {
    if (!enabled) return [];
    return [...map.values()].filter((emote) => !emote.unlisted || showUnlisted);
}

const FFZ_MODERATOR_BACKGROUND = "#34ae0a";

function customBadge(url: string | undefined, tooltip: string, background?: string): Badge | undefined {
    if (!url) return undefined;
    const badge: Badge = { key: `ffz:${tooltip}`, name: `ffz:${tooltip}`, url, width: 18, height: 18, tooltip, tooltipImage: url };
    if (background) badge.background = background;
    return badge;
}

type ProviderLoad = {
    provider: string;
    label: string;
    url: string;
    init?: RequestInit;
    apply: (json: unknown) => void;
    applyEmpty: () => void;
};

export class ChannelEmotes {
    ffz: EmoteMap = new Map();
    bttv: EmoteMap = new Map();
    seventv: EmoteMap = new Map();
    badges: BadgeMap = new Map();
    cheermotes: CheermoteSet[] = defaultCheermotes();
    modBadge: Badge | undefined;
    vipBadge: Badge | undefined;
    version = 0;
    private loadedRoomId: string | undefined;
    private readyPromise: Promise<void> = Promise.resolve();
    private cachedPromise: Promise<void> = Promise.resolve();

    constructor(private readonly deps: ChannelEmoteDeps) {}

    private toggles(): EmoteToggles {
        return this.deps.settings?.() ?? ALL_ON;
    }

    lookup(name: string): Emote | undefined {
        const globals = this.deps.globals();
        const t = this.toggles();
        const unlisted = t.showUnlistedSevenTVEmotes;
        return (
            pick(this.ffz, name, t.enableFFZChannelEmotes, unlisted) ??
            pick(this.bttv, name, t.enableBTTVChannelEmotes, unlisted) ??
            pick(this.seventv, name, t.enableSevenTVChannelEmotes, unlisted) ??
            pick(globals.ffz, name, t.enableFFZGlobalEmotes, unlisted) ??
            pick(globals.bttv, name, t.enableBTTVGlobalEmotes, unlisted) ??
            pick(globals.seventv, name, t.enableSevenTVGlobalEmotes, unlisted)
        );
    }

    twitchBadge(setId: string, version: string): Badge | undefined {
        const key = badgeKey(setId, version);
        return this.badges.get(key) ?? this.deps.globalBadges().get(key);
    }

    channelEmoteList(): Emote[] {
        const t = this.toggles();
        const unlisted = t.showUnlistedSevenTVEmotes;
        return [
            ...visibleEmotes(this.ffz, t.enableFFZChannelEmotes, unlisted),
            ...visibleEmotes(this.bttv, t.enableBTTVChannelEmotes, unlisted),
            ...visibleEmotes(this.seventv, t.enableSevenTVChannelEmotes, unlisted),
        ];
    }

    ready(): Promise<void> {
        return this.readyPromise;
    }

    cached(): Promise<void> {
        return this.cachedPromise;
    }

    roomId(): string | undefined {
        return this.loadedRoomId;
    }

    loadBadges(login: string, roomId?: string): Promise<void> {
        const failed = (error: unknown) => this.deps.systemMessage(`Failed to load channel badges - ${formatHttpError(error)}`);
        const helixLoad = this.deps.loadBadges?.(login, roomId);
        if (helixLoad) {
            return helixLoad.then((badges) => {
                this.badges = badges;
                this.changed();
            }, failed);
        }
        const request = requestCachedJson(this.deps.fetch, ivrChannelBadgesUrl(login), (json) => {
            this.badges = parseIvrBadges(json);
            this.changed();
        });
        return request.fresh.catch(failed);
    }

    loadForRoom(roomId: string, displayName: string): Promise<void> {
        if (this.loadedRoomId === roomId) return this.readyPromise;
        this.loadedRoomId = roomId;
        markTiming("emotes:start", { roomId });
        const loads: ProviderLoad[] = [
            {
                provider: "bttv",
                label: "BetterTTV",
                url: bttvChannelUrl(roomId),
                apply: (json) => {
                    this.bttv = parseBttvChannel(json, displayName);
                },
                applyEmpty: () => {
                    this.bttv = new Map();
                },
            },
            {
                provider: "ffz",
                label: "FrankerFaceZ",
                url: ffzChannelUrl(roomId),
                apply: (json) => {
                    const data = parseFfzChannel(json);
                    this.ffz = data.emotes;
                    this.modBadge = customBadge(data.modBadge, "Moderator", FFZ_MODERATOR_BACKGROUND);
                    this.vipBadge = customBadge(data.vipBadge, "VIP");
                },
                applyEmpty: () => {
                    this.ffz = new Map();
                },
            },
            {
                provider: "7tv",
                label: "7TV",
                url: seventvChannelUrl(roomId),
                init: { timeoutMs: SEVENTV_TIMEOUT_MS },
                apply: (json) => {
                    this.seventv = parseSeventvChannel(json);
                },
                applyEmpty: () => {
                    this.seventv = new Map();
                },
            },
        ];
        const requests = loads.map((load) => this.request(roomId, load));
        const cheer = this.deps.loadCheermotes?.(roomId).then(
            (sets) => {
                if (sets && sets.length > 0 && this.loadedRoomId === roomId) this.cheermotes = sets;
            },
            () => undefined,
        );
        this.cachedPromise = Promise.all(requests.map((request) => request.cached)).then(() => undefined);
        this.readyPromise = Promise.all([...requests.map((request) => request.fresh), cheer]).then(() => undefined);
        return this.readyPromise;
    }

    private request(roomId: string, load: ProviderLoad): CachedRequest {
        const isCurrent = () => this.loadedRoomId === roomId;
        const request = requestCachedJson(
            this.deps.fetch,
            load.url,
            (json, source) => {
                if (!isCurrent()) return;
                load.apply(json);
                markTiming(`emotes:${load.provider}`, { roomId, source });
                this.changed();
            },
            load.init,
        );
        const fresh = request.fresh.catch((error: unknown) => {
            if (!isCurrent()) return;
            if (isNotFound(error)) {
                load.applyEmpty();
                markTiming(`emotes:${load.provider}`, { roomId, source: "network" });
                this.changed();
                return;
            }
            this.deps.systemMessage(`Failed to fetch ${load.label} channel emotes. (Error: ${formatHttpError(error)})`);
        });
        return { cached: request.cached, fresh };
    }

    private changed(): void {
        this.version += 1;
        this.deps.onChanged?.();
    }
}
