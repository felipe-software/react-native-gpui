import type { ChatListMessage } from "react-native-gpui";
import type { EmoteInfo } from "../../data/api";
import { providerLabel } from "../input/completion";

export type EmoteTab = "Subs" | "Channel" | "Global" | "Emojis";

export const EMOTE_TABS: EmoteTab[] = ["Subs", "Channel", "Global", "Emojis"];

export type EmoteSection = { title: string; emotes: EmoteInfo[] };

const PROVIDER_TITLES: Record<EmoteInfo["provider"], string> = {
    twitch: "Twitch",
    bttv: "BetterTTV",
    ffz: "FrankerFaceZ",
    "7tv": "7TV",
    emoji: "Emojis",
};

const PROVIDER_ORDER: EmoteInfo["provider"][] = ["twitch", "bttv", "ffz", "7tv", "emoji"];

function byName(a: EmoteInfo, b: EmoteInfo): number {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function groupByProvider(emotes: EmoteInfo[]): EmoteSection[] {
    return PROVIDER_ORDER.map((provider) => ({
        title: PROVIDER_TITLES[provider],
        emotes: emotes.filter((emote) => emote.provider === provider).sort(byName),
    })).filter((section) => section.emotes.length > 0);
}

function inTab(tab: EmoteTab, emote: EmoteInfo): boolean {
    if (tab === "Emojis") return emote.provider === "emoji";
    if (emote.provider === "emoji") return false;
    if (tab === "Subs") return emote.scope === "subscriber" || emote.scope === "follower";
    if (tab === "Channel") return emote.scope === "channel";
    return emote.scope === "global";
}

export function emoteSections(tab: EmoteTab, emotes: EmoteInfo[], channel: string): EmoteSection[] {
    const matching = emotes.filter((emote) => inTab(tab, emote));
    if (tab === "Emojis") return [{ title: "Emojis", emotes: matching }];
    if (tab === "Subs") {
        const follower = matching.filter((emote) => emote.scope === "follower").sort(byName);
        const subscriber = matching.filter((emote) => emote.scope === "subscriber").sort(byName);
        const sections: EmoteSection[] = [];
        if (follower.length > 0) sections.push({ title: `${channel} (Follower)`, emotes: follower });
        if (subscriber.length > 0) sections.push({ title: "Subscriber emotes", emotes: subscriber });
        return sections;
    }
    return groupByProvider(matching);
}

const SEARCH_GROUPS: Array<{ title: string; matches: (emote: EmoteInfo) => boolean }> = [
    { title: "Twitch", matches: (emote) => emote.provider === "twitch" },
    { title: "BetterTTV (Channel)", matches: (emote) => emote.provider === "bttv" && emote.scope === "channel" },
    { title: "FrankerFaceZ (Channel)", matches: (emote) => emote.provider === "ffz" && emote.scope === "channel" },
    { title: "7TV (Channel)", matches: (emote) => emote.provider === "7tv" && emote.scope === "channel" },
    { title: "BetterTTV (Global)", matches: (emote) => emote.provider === "bttv" && emote.scope === "global" },
    { title: "FrankerFaceZ (Global)", matches: (emote) => emote.provider === "ffz" && emote.scope === "global" },
    { title: "7TV (Global)", matches: (emote) => emote.provider === "7tv" && emote.scope === "global" },
    { title: "Emojis", matches: (emote) => emote.provider === "emoji" },
];

export function searchSections(emotes: EmoteInfo[], query: string): EmoteSection[] {
    const needle = query.trim().toLowerCase();
    const matching = emotes.filter((emote) => emote.name.toLowerCase().includes(needle));
    return SEARCH_GROUPS.map((group) => ({ title: group.title, emotes: matching.filter(group.matches).sort(byName) })).filter(
        (section) => section.emotes.length > 0,
    );
}

export function sectionMessages(sections: EmoteSection[], emptyColor: string): ChatListMessage[] {
    if (sections.length === 0) {
        return [{ id: "empty", elements: [{ kind: "text", text: "no emotes available", color: emptyColor }] }];
    }
    const messages: ChatListMessage[] = [];
    sections.forEach((section, index) => {
        messages.push({ id: `title-${index}`, elements: [{ kind: "text", text: section.title }] });
        messages.push({
            id: `emotes-${index}`,
            elements: section.emotes.map((emote) => ({
                kind: "emote" as const,
                name: emote.name,
                url: emote.url,
                width: emote.width,
                height: emote.height,
                tooltip: `${emote.name}\n${providerLabel(emote)}`,
                tooltipImage: emote.tooltipImage,
            })),
        });
    });
    return messages;
}
