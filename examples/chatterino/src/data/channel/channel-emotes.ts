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
};

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

    lookup(name: string): Emote | undefined {
        const globals = this.deps.globals();
        return (
            this.ffz.get(name) ??
            this.bttv.get(name) ??
            this.seventv.get(name) ??
            globals.ffz.get(name) ??
            globals.bttv.get(name) ??
            globals.seventv.get(name)
        );
    }

    twitchBadge(setId: string, version: string): Badge | undefined {
        const key = badgeKey(setId, version);
        return this.badges.get(key) ?? this.deps.globalBadges().get(key);
    }

    channelEmoteList(): Emote[] {
        return [...this.ffz.values(), ...this.bttv.values(), ...this.seventv.values()];
    }

    ready(): Promise<void> {
        return this.readyPromise;
    }

    loadBadges(login: string): Promise<void> {
        return loadChannelBadges(this.deps.fetch, login).then(
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
