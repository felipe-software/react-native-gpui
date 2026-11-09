import type { EmoteInfo } from "../../data/api";

export type EmoteTab = "Subs" | "Channel" | "Global" | "Emojis";

export const EMOTE_TABS: EmoteTab[] = ["Subs", "Channel", "Global", "Emojis"];

export type EmoteSection = { title: string; emotes: EmoteInfo[]; empty?: string };

const NO_EMOTES = "no emotes available";
const NO_SUB_EMOTES = "no subscription emotes available";

const PROVIDERS: Array<{ provider: EmoteInfo["provider"]; title: string }> = [
    { provider: "bttv", title: "BetterTTV" },
    { provider: "ffz", title: "FrankerFaceZ" },
    { provider: "7tv", title: "7TV" },
];

export function compareEmoteNames(a: string, b: string): number {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
    if (a === b) return 0;
    return a > b ? -1 : 1;
}

function sorted(emotes: EmoteInfo[]): EmoteInfo[] {
    return [...emotes].sort((a, b) => compareEmoteNames(a.name, b.name));
}

function section(title: string, emotes: EmoteInfo[], empty = NO_EMOTES): EmoteSection {
    return emotes.length > 0 ? { title, emotes: sorted(emotes) } : { title, emotes: [], empty };
}

function providerSections(emotes: EmoteInfo[], scope: EmoteInfo["scope"]): EmoteSection[] {
    return PROVIDERS.map(({ provider, title }) => section(title, emotes.filter((emote) => emote.provider === provider && emote.scope === scope)));
}

export function emoteSections(tab: EmoteTab, emotes: EmoteInfo[], channel: string, isTwitchChannel = true): EmoteSection[] {
    switch (tab) {
        case "Subs": {
            const follower = emotes.filter((emote) => emote.scope === "follower");
            const subscriber = emotes.filter((emote) => emote.scope === "subscriber");
            const sections: EmoteSection[] = [];
            if (follower.length > 0) sections.push(section(`${channel} (Follower)`, follower));
            if (subscriber.length > 0) sections.push(section("Twitch", subscriber));
            if (sections.length === 0) return [{ title: "", emotes: [], empty: NO_SUB_EMOTES }];
            return sections;
        }
        case "Channel":
            return isTwitchChannel ? providerSections(emotes, "channel") : [];
        case "Global": {
            const twitch = emotes.filter((emote) => emote.provider === "twitch" && emote.scope === "global");
            const sections = twitch.length > 0 ? [section("Twitch", twitch)] : [];
            return [...sections, ...providerSections(emotes, "global")];
        }
        case "Emojis":
            return [{ title: "Emojis", emotes: emotes.filter((emote) => emote.provider === "emoji") }];
    }
}

const SEARCH_GROUPS: Array<{ title: (channel: string) => string; matches: (emote: EmoteInfo) => boolean }> = [
    { title: (channel) => `${channel} (Follower)`, matches: (emote) => emote.scope === "follower" },
    { title: () => "Twitch", matches: (emote) => emote.provider === "twitch" && emote.scope !== "follower" },
    { title: () => "BetterTTV (Global)", matches: (emote) => emote.provider === "bttv" && emote.scope === "global" },
    { title: () => "FrankerFaceZ (Global)", matches: (emote) => emote.provider === "ffz" && emote.scope === "global" },
    { title: () => "7TV (Global)", matches: (emote) => emote.provider === "7tv" && emote.scope === "global" },
    { title: () => "BetterTTV (Channel)", matches: (emote) => emote.provider === "bttv" && emote.scope === "channel" },
    { title: () => "FrankerFaceZ (Channel)", matches: (emote) => emote.provider === "ffz" && emote.scope === "channel" },
    { title: () => "7TV (Channel)", matches: (emote) => emote.provider === "7tv" && emote.scope === "channel" },
    { title: () => "Emojis", matches: (emote) => emote.provider === "emoji" },
];

export function searchSections(
    emotes: EmoteInfo[],
    query: string,
    channel = "",
    searchName: (emote: EmoteInfo) => string = (emote) => emote.name,
): EmoteSection[] {
    const needle = query.trim().toLowerCase();
    const matching = emotes.filter((emote) => searchName(emote).toLowerCase().includes(needle));
    return SEARCH_GROUPS.map((group) => ({ title: group.title(channel), emotes: sorted(matching.filter(group.matches)) })).filter(
        (entry) => entry.emotes.length > 0,
    );
}
