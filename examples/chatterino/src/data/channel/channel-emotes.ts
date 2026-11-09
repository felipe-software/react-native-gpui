import type { Settings } from "../api";
import { badgeKey, loadChannelBadges, type BadgeMap } from "../badges/twitch";
import { loadBttvChannel } from "../emotes/bttv";
import { defaultCheermotes, type CheermoteSet } from "../emotes/cheermotes";
import { loadFfzChannel } from "../emotes/ffz";
import { loadSeventvChannel } from "../emotes/seventv";
import type { Badge, Emote, EmoteMap } from "../emotes/types";
import { formatHttpError, type FetchLike } from "../util/http";

export type GlobalEmoteSets = { ffz: EmoteMap; bttv: EmoteMap; seventv: EmoteMap };

export type ChannelEmoteDeps = {
    fetch: FetchLike;
    globals: () => GlobalEmoteSets;
    globalBadges: () => BadgeMap;
    systemMessage: (text: string) => void;
    loadCheermotes?: (roomId: string) => Promise<CheermoteSet[] | undefined>;
    loadBadges?: (login: string, roomId: string | undefined) => Promise<BadgeMap>;
    settings?: () => Settings;
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

export class ChannelEmotes {
    ffz: EmoteMap = new Map();
    bttv: EmoteMap = new Map();
    seventv: EmoteMap = new Map();
    badges: BadgeMap = new Map();
    cheermotes: CheermoteSet[] = defaultCheermotes();
    modBadge: Badge | undefined;
    vipBadge: Badge | undefined;
    private loadedRoomId: string | undefined;
    private readyPromise: Promise<void> = Promise.resolve();

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

    loadBadges(login: string, roomId?: string): Promise<void> {
        const load = this.deps.loadBadges ? this.deps.loadBadges(login, roomId) : loadChannelBadges(this.deps.fetch, login);
        return load.then(
            (badges) => {
                this.badges = badges;
            },
            (error) => this.deps.systemMessage(`Failed to load channel badges - ${formatHttpError(error)}`),
        );
    }

    loadForRoom(roomId: string, displayName: string): Promise<void> {
        if (this.loadedRoomId === roomId) return this.readyPromise;
        this.loadedRoomId = roomId;
        const { fetch, systemMessage } = this.deps;
        const fail = (provider: string) => (error: unknown) =>
            systemMessage(`Failed to fetch ${provider} channel emotes. (Error: ${formatHttpError(error)})`);
        const bttv = loadBttvChannel(fetch, roomId, displayName).then((map) => {
            this.bttv = map;
        }, fail("BetterTTV"));
        const ffz = loadFfzChannel(fetch, roomId).then((data) => {
            this.ffz = data.emotes;
            this.modBadge = customBadge(data.modBadge, "Moderator", FFZ_MODERATOR_BACKGROUND);
            this.vipBadge = customBadge(data.vipBadge, "VIP");
        }, fail("FrankerFaceZ"));
        const seventv = loadSeventvChannel(fetch, roomId).then((map) => {
            this.seventv = map;
        }, fail("7TV"));
        const cheer = this.deps.loadCheermotes?.(roomId).then(
            (sets) => {
                if (sets && sets.length > 0) this.cheermotes = sets;
            },
            () => undefined,
        );
        this.readyPromise = Promise.all([bttv, ffz, seventv, cheer]).then(() => undefined);
        return this.readyPromise;
    }
}
