import type { Account, EmoteInfo, EmojiStyle } from "./api";
import { BTTV_BADGES_URL, CHATTERINO_BADGES_URL, parseBttvBadges, parseChatterinoBadges, type UserBadgeMap } from "./badges/thirdparty";
import { IVR_GLOBAL_BADGES_URL, parseIvrBadges, type BadgeMap } from "./badges/twitch";
import { visibleEmotes, type EmoteToggles, type GlobalEmoteSets } from "./channel/channel-emotes";
import { BTTV_GLOBAL_URL, parseBttvGlobal } from "./emotes/bttv";
import { emojiShortCodes, emojiUrl } from "./emotes/emoji";
import { FFZ_GLOBAL_URL, parseFfzGlobal } from "./emotes/ffz";
import { parseSeventvGlobal, SEVENTV_GLOBAL_URL, SEVENTV_TIMEOUT_MS } from "./emotes/seventv";
import { twitchEmote } from "./emotes/twitch";
import { toEmoteInfo, type Emote } from "./emotes/types";
import { Helix } from "./twitch/helix";
import { requestCachedJson, type FetchLike, type RequestInit } from "./util/http";
import { markTiming } from "./util/timing";

type HelixEmote = { id: string; name: string; emote_type?: string; format?: string[]; owner_id?: string; emote_set_id?: string };

function scopeOf(emoteType: string | undefined): Emote["scope"] {
    if (emoteType === "subscriptions" || emoteType === "bitstier") return "subscriber";
    if (emoteType === "follower") return "follower";
    return "global";
}

function helixEmote(entry: HelixEmote): Emote {
    const base = twitchEmote(entry.id, entry.name);
    const scope = scopeOf(entry.emote_type);
    const animated = entry.format?.includes("animated") ?? false;
    const emote: Emote = { ...base, scope };
    if (animated) emote.animated = true;
    if (entry.owner_id && entry.owner_id !== "0" && entry.owner_id !== "twitch") emote.ownerId = entry.owner_id;
    if (entry.emote_set_id) emote.setId = entry.emote_set_id;
    return emote;
}

type GlobalLoad = { label: string; url: string; init?: RequestInit; quiet?: boolean; apply: (json: unknown) => void };

export class GlobalResources {
    emotes: GlobalEmoteSets = { ffz: new Map(), bttv: new Map(), seventv: new Map() };
    badges: BadgeMap = new Map();
    userBadges: UserBadgeMap[] = [new Map(), new Map()];
    twitchEmotes: Emote[] = [];
    version = 0;
    private emojiInfos: EmoteInfo[] | undefined;
    private readyPromise: Promise<void> = Promise.resolve();
    private cachedPromise: Promise<void> = Promise.resolve();

    constructor(
        private readonly fetchFn: FetchLike,
        private readonly onChanged?: () => void,
    ) {}

    load(): Promise<void> {
        const loads: GlobalLoad[] = [
            {
                label: "BetterTTV global emotes",
                url: BTTV_GLOBAL_URL,
                apply: (json) => {
                    this.emotes = { ...this.emotes, bttv: parseBttvGlobal(json) };
                },
            },
            {
                label: "FrankerFaceZ global emotes",
                url: FFZ_GLOBAL_URL,
                apply: (json) => {
                    this.emotes = { ...this.emotes, ffz: parseFfzGlobal(json) };
                },
            },
            {
                label: "7TV global emotes",
                url: SEVENTV_GLOBAL_URL,
                init: { timeoutMs: SEVENTV_TIMEOUT_MS },
                apply: (json) => {
                    this.emotes = { ...this.emotes, seventv: parseSeventvGlobal(json) };
                },
            },
            {
                label: "Twitch global badges",
                url: IVR_GLOBAL_BADGES_URL,
                apply: (json) => {
                    this.badges = parseIvrBadges(json);
                },
            },
            {
                label: "Chatterino badges",
                url: CHATTERINO_BADGES_URL,
                quiet: true,
                apply: (json) => {
                    this.userBadges = [parseChatterinoBadges(json), this.userBadges[1]];
                },
            },
            {
                label: "BetterTTV badges",
                url: BTTV_BADGES_URL,
                quiet: true,
                apply: (json) => {
                    this.userBadges = [this.userBadges[0], parseBttvBadges(json)];
                },
            },
        ];
        const requests = loads.map((load) => {
            const request = requestCachedJson(
                this.fetchFn,
                load.url,
                (json) => {
                    load.apply(json);
                    this.changed();
                },
                load.init,
            );
            const fresh = request.fresh.catch((error: unknown) => {
                if (!load.quiet) console.warn(`failed to load ${load.label}`, error);
            });
            return { cached: request.cached, fresh };
        });
        this.cachedPromise = Promise.all(requests.map((request) => request.cached)).then(() => markTiming("globals:cached"));
        this.readyPromise = Promise.all(requests.map((request) => request.fresh)).then(() => markTiming("globals:ready"));
        return this.readyPromise;
    }

    ready(): Promise<void> {
        return this.readyPromise;
    }

    async loadGlobalBadges(account: Account | undefined): Promise<void> {
        if (!account) return;
        try {
            const sets = await new Helix(this.fetchFn, account).globalBadges();
            const map = parseIvrBadges(sets);
            if (map.size > 0) this.badges = map;
        } catch (error) {
            console.warn("failed to load Twitch global badges from Helix", error);
        }
    }

    async loadUserEmotes(account: Account | undefined): Promise<boolean> {
        if (!account) return false;
        try {
            const entries = await new Helix(this.fetchFn, account).userEmotes(account.userId);
            const collected = new Map<string, Emote>();
            for (const entry of entries) if (!collected.has(entry.name)) collected.set(entry.name, helixEmote(entry));
            this.twitchEmotes = [...collected.values()];
            return true;
        } catch (error) {
            console.warn("failed to load your Twitch emotes", error);
            return false;
        }
    }

    cached(): Promise<void> {
        return this.cachedPromise;
    }

    async loadTwitchEmotes(account: Account | undefined, emoteSets: string[]): Promise<void> {
        if (!account) {
            this.twitchEmotes = [];
            return;
        }
        if (await this.loadUserEmotes(account)) return;
        const helix = new Helix(this.fetchFn, account);
        const collected = new Map<string, Emote>();
        try {
            const globals = await helix.request<{ data?: HelixEmote[] }>("GET", "/chat/emotes/global", {});
            for (const entry of globals?.data ?? []) collected.set(entry.name, helixEmote(entry));
        } catch (error) {
            console.warn("failed to load Twitch global emotes", error);
        }
        for (let i = 0; i < emoteSets.length; i += 25) {
            const ids = emoteSets.slice(i, i + 25);
            try {
                const result = await helix.request<{ data?: HelixEmote[] }>("GET", "/chat/emotes/set", { emote_set_id: ids });
                for (const entry of result?.data ?? []) collected.set(entry.name, helixEmote(entry));
            } catch (error) {
                console.warn("failed to load Twitch emote sets", error);
            }
        }
        this.twitchEmotes = [...collected.values()];
    }

    emoteInfos(toggles?: EmoteToggles, emojiStyle: EmojiStyle = "twitter"): EmoteInfo[] {
        const unlisted = !!toggles?.showUnlistedSevenTVEmotes;
        const own = [
            ...this.twitchEmotes,
            ...visibleEmotes(this.emotes.bttv, toggles?.enableBTTVGlobalEmotes ?? true, unlisted),
            ...visibleEmotes(this.emotes.ffz, toggles?.enableFFZGlobalEmotes ?? true, unlisted),
            ...visibleEmotes(this.emotes.seventv, toggles?.enableSevenTVGlobalEmotes ?? true, unlisted),
        ].map(toEmoteInfo);
        if (!this.emojiInfos) this.emojiInfos = emojiShortCodes().map(([, emote]) => toEmoteInfo(emote));
        const emoji =
            emojiStyle === "twitter"
                ? this.emojiInfos
                : this.emojiInfos.map((info) => ({ ...info, url: emojiUrl(info.url, emojiStyle), tooltipImage: info.tooltipImage && emojiUrl(info.tooltipImage, emojiStyle) }));
        return [...own, ...emoji];
    }

    private changed(): void {
        this.version += 1;
        this.onChanged?.();
    }
}
