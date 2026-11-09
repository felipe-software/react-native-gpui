import type { Account, EmoteInfo, EmojiStyle } from "./api";
import { loadBttvBadges, loadChatterinoBadges, type UserBadgeMap } from "./badges/thirdparty";
import { loadGlobalBadges, parseIvrBadges, type BadgeMap } from "./badges/twitch";
import { visibleEmotes, type EmoteToggles, type GlobalEmoteSets } from "./channel/channel-emotes";
import { loadBttvGlobal } from "./emotes/bttv";
import { emojiShortCodes, emojiUrl } from "./emotes/emoji";
import { loadFfzGlobal } from "./emotes/ffz";
import { loadSeventvGlobal } from "./emotes/seventv";
import { twitchEmote } from "./emotes/twitch";
import { toEmoteInfo, type Emote } from "./emotes/types";
import { Helix } from "./twitch/helix";
import type { FetchLike } from "./util/http";

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



export class GlobalResources {
    emotes: GlobalEmoteSets = { ffz: new Map(), bttv: new Map(), seventv: new Map() };
    badges: BadgeMap = new Map();
    userBadges: UserBadgeMap[] = [];
    twitchEmotes: Emote[] = [];
    private emojiInfos: EmoteInfo[] | undefined;
    private readyPromise: Promise<void> = Promise.resolve();

    constructor(private readonly fetchFn: FetchLike) {}

    load(): Promise<void> {
        const fetchFn = this.fetchFn;
        const ignore = (label: string) => (error: unknown) => console.warn(`failed to load ${label}`, error);
        const tasks = [
            loadBttvGlobal(fetchFn).then((map) => {
                this.emotes = { ...this.emotes, bttv: map };
            }, ignore("BetterTTV global emotes")),
            loadFfzGlobal(fetchFn).then((map) => {
                this.emotes = { ...this.emotes, ffz: map };
            }, ignore("FrankerFaceZ global emotes")),
            loadSeventvGlobal(fetchFn).then((map) => {
                this.emotes = { ...this.emotes, seventv: map };
            }, ignore("7TV global emotes")),
            loadGlobalBadges(fetchFn).then((map) => {
                this.badges = map;
            }, ignore("Twitch global badges")),
            Promise.all([
                loadChatterinoBadges(fetchFn).catch(() => new Map()),
                loadBttvBadges(fetchFn).catch(() => new Map()),
            ]).then((maps) => {
                this.userBadges = maps;
            }),
        ];
        this.readyPromise = Promise.all(tasks).then(() => undefined);
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
}
