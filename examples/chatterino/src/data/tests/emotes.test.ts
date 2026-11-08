import { describe, expect, test } from "bun:test";
import { parseBttvBadges, parseChatterinoBadges } from "../badges/thirdparty";
import { badgeCategory, parseIvrBadges } from "../badges/twitch";
import { ChannelEmotes } from "../channel/channel-emotes";
import { parseBttvChannel, parseBttvGlobal } from "../emotes/bttv";
import { defaultCheermotes, matchCheer, parseHelixCheermotes } from "../emotes/cheermotes";
import { emojiByShortCode, parseEmoji } from "../emotes/emoji";
import { parseFfzChannel, parseFfzGlobal } from "../emotes/ffz";
import { parseSeventvChannel, parseSeventvGlobal } from "../emotes/seventv";
import { cleanUpEmoteCode, twitchEmote } from "../emotes/twitch";
import api from "./fixtures/api.json";
import { notFoundFetch } from "./helpers";

describe("Twitch emotes", () => {
    test("uses Chatterino's size table and CDN template", () => {
        expect(twitchEmote("25", "Kappa")).toMatchObject({ width: 25, height: 28, tooltipImage: expect.stringContaining("/3.0") });
        expect(twitchEmote("emotesv2_abc", "forsenE")).toMatchObject({ width: 28, height: 28, provider: "twitch" });
        expect(twitchEmote("555555628", ":)")).toMatchObject({ width: 21, height: 18 });
    });

    test("cleans up regex emote codes only on exact keys", () => {
        expect(cleanUpEmoteCode("\\:-?\\)")).toBe(":)");
        expect(cleanUpEmoteCode(":-)")).toBe(":-)");
        expect(cleanUpEmoteCode("\\&lt\\;3")).toBe("<3");
    });
});

describe("BTTV / FFZ / 7TV", () => {
    test("BTTV global uses 1x webp, json sizes or 28x28 and zero-width list", () => {
        const map = parseBttvGlobal([...api.bttvGlobal, { id: "x", code: "SoSnowy" }]);
        expect(map.get("bttvNice")).toMatchObject({
            url: "https://cdn.betterttv.net/emote/54fab7d2633595ca4c713abf/1x.webp",
            width: 42,
            height: 28,
            tooltip: "bttvNice\nGlobal BetterTTV Emote",
            scope: "global",
        });
        expect(map.get("LuL")).toMatchObject({ width: 28, height: 28 });
        expect(map.get("SoSnowy")?.zeroWidth).toBe(true);
    });

    test("BTTV channel tooltips distinguish channel and shared emotes", () => {
        const map = parseBttvChannel(api.bttvChannel, "forsen");
        expect(map.get("forsenBlunder")?.tooltip).toBe("forsenBlunder\nChannel BetterTTV Emote\nBy: forsen");
        expect(map.get("EZ")?.tooltip).toBe("EZ\nShared BetterTTV Emote\nBy: helloboat");
    });

    test("FFZ uses default sets, json sizes and room badges", () => {
        const global = parseFfzGlobal(api.ffzGlobal);
        expect(global.get("ZrehplaR")).toMatchObject({ width: 33, height: 30, provider: "ffz", tooltip: "ZrehplaR\nGlobal FFZ Emote\nBy: dansalvato" });
        const room = parseFfzChannel(api.ffzRoom);
        expect(room.emotes.get("WideHard")).toMatchObject({ width: 50, height: 20, scope: "channel" });
        expect(room.modBadge).toStartWith("https://cdn.frankerfacez.com/room-badge/mod/");
        expect(room.vipBadge).toBeUndefined();
    });

    test("7TV uses the first webp file, active zero-width flags and alias tooltips", () => {
        const global = parseSeventvGlobal(api.seventvGlobal);
        expect(global.get("RainTime")).toMatchObject({
            url: "https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/1x.webp",
            tooltipImage: "https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/4x.webp",
            width: 32,
            height: 32,
            zeroWidth: true,
            animated: true,
        });
        const channel = parseSeventvChannel(api.seventvChannel);
        expect(channel.get("PutAFingerDown")?.tooltip).toBe("PutAFingerDown\nAlias of Me:\nChannel 7TV Emote\nBy: hyru");
        const unlisted = { emote_set: { emotes: [{ id: "a", name: "Hidden", data: { listed: false, host: { url: "//x", files: [] } } }] } };
        expect(parseSeventvChannel(unlisted).size).toBe(0);
    });

    test("lookup precedence: FFZ channel, BTTV channel, 7TV channel, then globals", () => {
        const emote = (provider: "ffz" | "bttv" | "7tv") => ({ id: provider, name: "Same", url: provider, width: 1, height: 1, provider, scope: "channel" as const, tooltip: "" });
        const sets = new ChannelEmotes({
            fetch: notFoundFetch,
            globals: () => ({ ffz: new Map([["G", { ...emote("ffz"), name: "G" }]]), bttv: new Map(), seventv: new Map() }),
            globalBadges: () => new Map(),
            systemMessage: () => undefined,
        });
        sets.seventv = new Map([["Same", emote("7tv")]]);
        sets.bttv = new Map([["Same", emote("bttv")]]);
        expect(sets.lookup("Same")?.provider).toBe("bttv");
        sets.ffz = new Map([["Same", emote("ffz")]]);
        expect(sets.lookup("Same")?.provider).toBe("ffz");
        expect(sets.lookup("G")?.provider).toBe("ffz");
        expect(sets.lookup("Missing")).toBeUndefined();
    });
});

describe("emoji", () => {
    test("matches qualified and unqualified sequences and skin tones", () => {
        const segments = parseEmoji("a❤b❤️👍🏽");
        expect(segments.map((segment) => (typeof segment === "string" ? segment : segment.id))).toEqual([
            "a",
            "2764-fe0f",
            "b",
            "2764-fe0f",
            "1f44d-1f3fd",
        ]);
        expect(emojiByShortCode("joy")?.name).toBe("😂");
    });
});

describe("cheermotes", () => {
    test("default cheer tiers pick the highest tier at or below the amount", () => {
        const sets = defaultCheermotes();
        expect(matchCheer(sets, "Cheer150")).toMatchObject({ amount: 150, tier: { minBits: 100, color: "#9c3ee8" } });
        expect(matchCheer(sets, "cheer10000")?.tier.minBits).toBe(10000);
        expect(matchCheer(sets, "cheer0")).toBeUndefined();
        expect(matchCheer(sets, "Kappa100")).toBeUndefined();
    });

    test("parses Helix cheermotes", () => {
        const sets = parseHelixCheermotes({
            data: [{ prefix: "Kappa", tiers: [{ min_bits: 1, color: "#979797", images: { dark: { animated: { "1": "u1", "4": "u4" } } } }] }],
        });
        expect(matchCheer(sets, "kappa5")?.tier.image).toMatchObject({ url: "u1", tooltipImage: "u4" });
    });
});

describe("badges", () => {
    test("parses ivr.fi badge sets with 18x18 images and titles", () => {
        const badges = parseIvrBadges(api.badgesGlobal);
        expect(badges.get("moderator/1")).toMatchObject({ width: 18, height: 18, tooltip: "Moderator", url: expect.stringContaining("/1") });
        expect(badges.get("bits/100")?.tooltip).toBe("cheer 100");
        expect(badgeCategory("lead_moderator")).toBe("channelAuthority");
        expect(badgeCategory("founder")).toBe("subscription");
        expect(badgeCategory("glitchcon2020")).toBe("vanity");
    });

    test("parses Chatterino and BTTV user badges", () => {
        const chatterino = parseChatterinoBadges(api.chatterinoBadges);
        const [userId] = api.chatterinoBadges.badges[0].users;
        expect(chatterino.get(String(userId))).toMatchObject({ tooltip: "Chatterino Top Donator", width: 18 });
        const bttv = parseBttvBadges(api.bttvBadges);
        expect(bttv.get("11785491")).toMatchObject({ tooltip: "NightDev Developer", url: "https://cdn.betterttv.net/badges/developer.svg" });
    });
});
