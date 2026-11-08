import type { Account, EmoteInfo } from "./api";
import { loadBttvBadges, loadChatterinoBadges, type UserBadgeMap } from "./badges/thirdparty";
import { loadGlobalBadges, type BadgeMap } from "./badges/twitch";
import type { GlobalEmoteSets } from "./channel/channel-emotes";
import { loadBttvGlobal } from "./emotes/bttv";
import { emojiShortCodes } from "./emotes/emoji";
import { loadFfzGlobal } from "./emotes/ffz";
import { loadSeventvGlobal } from "./emotes/seventv";
import { twitchEmote } from "./emotes/twitch";
import { toEmoteInfo, type Emote } from "./emotes/types";
import { Helix } from "./twitch/helix";
import type { FetchLike } from "./util/http";

type HelixEmote = { id: string; name: string; emote_type?: string; format?: string[] };

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

    async loadTwitchEmotes(account: Account | undefined, emoteSets: string[]): Promise<void> {
        if (!account) {
            this.twitchEmotes = [];
            return;
        }
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

    emoteInfos(): EmoteInfo[] {
        const own = [
            ...this.twitchEmotes,
            ...this.emotes.bttv.values(),
            ...this.emotes.ffz.values(),
            ...this.emotes.seventv.values(),
        ].map(toEmoteInfo);
        if (!this.emojiInfos) this.emojiInfos = emojiShortCodes().map(([, emote]) => toEmoteInfo(emote));
        return [...own, ...this.emojiInfos];
    }
}
