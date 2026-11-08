import { describe, expect, test } from "bun:test";
import type { EmoteInfo } from "../../data/api";
import { emoteSections, searchSections, sectionMessages } from "./emoteSections";

function emote(name: string, provider: EmoteInfo["provider"], scope: EmoteInfo["scope"]): EmoteInfo {
    return { name, url: `https://example.com/${name}`, width: 28, height: 28, provider, scope };
}

const emotes = [
    emote("Kappa", "twitch", "global"),
    emote("forsenE", "twitch", "subscriber"),
    emote("OMEGALUL", "bttv", "channel"),
    emote("catJAM", "7tv", "channel"),
    emote("PogU", "ffz", "global"),
    emote("Clap", "bttv", "global"),
    emote("smile", "emoji", "global"),
];

describe("emote popup sections", () => {
    test("Channel tab groups channel emotes by provider in Chatterino's order", () => {
        expect(emoteSections("Channel", emotes, "forsen").map((section) => section.title)).toEqual(["BetterTTV", "7TV"]);
    });

    test("Global tab starts with Twitch globals and excludes emoji", () => {
        const sections = emoteSections("Global", emotes, "forsen");
        expect(sections.map((section) => section.title)).toEqual(["Twitch", "BetterTTV", "FrankerFaceZ"]);
    });

    test("Subs and Emojis tabs", () => {
        expect(emoteSections("Subs", emotes, "forsen")[0].emotes.map((entry) => entry.name)).toEqual(["forsenE"]);
        expect(emoteSections("Emojis", emotes, "forsen")[0].emotes.map((entry) => entry.name)).toEqual(["smile"]);
    });

    test("search uses provider and scope titles", () => {
        expect(searchSections(emotes, "a").map((section) => section.title)).toEqual([
            "Twitch",
            "BetterTTV (Channel)",
            "7TV (Channel)",
            "BetterTTV (Global)",
        ]);
    });

    test("messages hold a title line and one line of emotes per section", () => {
        const messages = sectionMessages(emoteSections("Channel", emotes, "forsen"), "#8c7f7f");
        expect(messages.map((message) => message.id)).toEqual(["title-0", "emotes-0", "title-1", "emotes-1"]);
        expect(messages[1].elements[0]).toMatchObject({ kind: "emote", name: "OMEGALUL", tooltip: "OMEGALUL\nChannel BetterTTV" });
    });

    test("an empty result says so in the system color", () => {
        expect(sectionMessages([], "#8c7f7f")[0].elements[0]).toMatchObject({ text: "no emotes available", color: "#8c7f7f" });
    });
});
