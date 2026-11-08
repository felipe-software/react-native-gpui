import { describe, expect, test } from "bun:test";
import { complete, RecentChatters } from "../completion";
import { defaultSettings } from "../defaults";
import { buildHighlightChecker } from "../filters/highlights";
import { buildIgnoreFilter } from "../filters/ignores";
import { parseCommand, parseDuration } from "../twitch/commands";
import { SendRateLimiter } from "../twitch/ratelimit";
import { irc, testChannel } from "./helpers";
import { LINES } from "./fixtures/lines";

describe("highlights", () => {
    const settings = defaultSettings("linux");
    const input = (content: string, senderLogin = "someone") => ({ senderLogin, content, isSubscription: false, isSubscribedThread: false });

    test("self mentions match on word boundaries and skip own messages", () => {
        const checker = buildHighlightChecker(settings, "forsen");
        expect(checker.check(input("hi forsen!"))).toMatchObject({ color: "#7f3f497f", showInMentions: true, playSound: true });
        expect(checker.check(input("hi forsenE"))).toBeUndefined();
        expect(checker.check(input("forsen", "forsen"))).toBeUndefined();
        expect(buildHighlightChecker(settings, undefined).check(input("hi forsen"))).toBeUndefined();
    });

    test("custom phrases, regexes and users merge like Chatterino", () => {
        const checker = buildHighlightChecker(
            {
                ...settings,
                highlightPhrases: [
                    { pattern: "pog+ers", isRegex: true, caseSensitive: false, color: "#11223344", playSound: false, alert: false, showInMentions: false },
                    { pattern: "Exact", isRegex: false, caseSensitive: true, playSound: true, alert: false, showInMentions: true },
                ],
                highlightUsers: [{ login: "vip_guy", color: "#00ff0080", playSound: false, alert: true, showInMentions: false }],
            },
            undefined,
        );
        expect(checker.check(input("POGGGERS"))).toMatchObject({ color: "#11223344", showInMentions: false });
        expect(checker.check(input("exact"))).toBeUndefined();
        expect(checker.check(input("Exact pogers"))).toMatchObject({ color: "#11223344", playSound: true, showInMentions: true });
        expect(checker.check(input("anything", "vip_guy"))).toMatchObject({ color: "#00ff0080", alert: true });
    });

    test("subscription messages use the sub color", () => {
        const checker = buildHighlightChecker(settings, undefined);
        expect(checker.check({ ...input("x"), isSubscription: true })).toMatchObject({ color: "#c466ff64", showInMentions: false });
    });
});

describe("ignores", () => {
    test("blocks users and phrases, replaces with emote positions shifted", () => {
        const filter = buildIgnoreFilter({
            ...defaultSettings("linux"),
            ignoredUsers: ["BadGuy"],
            ignoredPhrases: [
                { pattern: "spoiler", isRegex: false, caseSensitive: false },
                { pattern: "bad+", isRegex: true, caseSensitive: false, replaceWith: "good" },
            ],
        });
        expect(filter.isIgnoredUser("badguy")).toBe(true);
        expect(filter.isBlocked("big SPOILER here")).toBe(true);
        expect(filter.isBlocked("fine")).toBe(false);
        const result = filter.replace("baddd Kappa bad Kappa", [
            { start: 6, end: 10, id: "25", name: "Kappa" },
            { start: 16, end: 20, id: "25", name: "Kappa" },
        ]);
        expect(result.content).toBe("good Kappa good Kappa");
        expect(result.emotes.map((emote) => result.content.slice(emote.start, emote.end + 1))).toEqual(["Kappa", "Kappa"]);
    });
});

describe("completion", () => {
    test("completes emotes by prefix, users with @, emoji with : and commands at the start", () => {
        const { channel } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        channel.handlePrivmsg(irc(LINES.privmsgSelfMention));
        expect(channel.complete("forsenB", false).map((item) => item.text)).toEqual(["forsenBlunder ", "forsenBucket "]);
        expect(channel.complete("forsenB", false)[0]).toMatchObject({ display: "forsenBlunder - Channel BetterTTV", kind: "emote" });
        expect(channel.complete("@pi", false)).toEqual([{ text: "@Pinger ", display: "Pinger", kind: "user" }]);
        expect(channel.complete("pi", true)).toContainEqual({ text: "Pinger, ", display: "Pinger", kind: "user" });
        expect(channel.complete(":jo", false)[0]).toMatchObject({ text: ":joy: ", kind: "emote" });
        expect(channel.complete("/tim", true).map((item) => item.text)).toEqual(["/timeout "]);
        expect(channel.complete(".m", true).map((item) => item.text)).toContain(".me ");
        expect(channel.complete("/tim", false)).toEqual([]);
        expect(channel.complete("f", false)).toEqual([]);
        expect(channel.complete("fors", false).some((item) => item.kind === "user" && item.display === "forsen")).toBe(true);
    });

    test("recent chatters are most recent first", () => {
        const chatters = new RecentChatters();
        chatters.add("Alpha");
        chatters.add("beta");
        chatters.add("ALPHA");
        expect(chatters.all()).toEqual([
            { login: "alpha", displayName: "ALPHA" },
            { login: "beta", displayName: "beta" },
        ]);
        expect(complete("al", false, { emotes: () => [], users: () => chatters.all(), commands: () => [], mentionWithComma: true })).toEqual([
            { text: "ALPHA ", display: "ALPHA", kind: "user" },
        ]);
    });
});

describe("commands and rate limits", () => {
    test("parses /me, unknown commands and moderation commands", () => {
        expect(parseCommand("hello")).toEqual({ kind: "irc", text: "hello" });
        expect(parseCommand("/me waves")).toEqual({ kind: "irc", text: "\u0001ACTION waves\u0001" });
        expect(parseCommand(".me waves")).toEqual({ kind: "irc", text: "\u0001ACTION waves\u0001" });
        expect(parseCommand("/nope x")).toEqual({ kind: "error", message: "/nope is not a known command." });
        expect(parseCommand("/timeout")).toMatchObject({ kind: "error", message: expect.stringMatching(/^Usage: "\/timeout/) });
        expect(parseCommand("/timeout forsen 10m").kind).toBe("helix");
        expect(parseCommand("... not a command")).toEqual({ kind: "irc", text: "... not a command" });
        expect(parseDuration("1d2h")).toBe(93600);
        expect(parseDuration("30")).toBe(30);
        expect(parseDuration("5x")).toBeUndefined();
    });

    test("enforces Twitch's per-user rate limits", () => {
        let now = 0;
        const limiter = new SendRateLimiter(() => now);
        expect(limiter.check(false)).toEqual({ ok: true });
        now += 500;
        expect(limiter.check(false)).toEqual({ ok: false, reason: "You are sending messages too quickly.", announce: true });
        now += 600;
        expect(limiter.check(false)).toEqual({ ok: true });
        for (let i = 0; i < 17; i++) {
            now += 1100;
            expect(limiter.check(false).ok).toBe(true);
        }
        now += 1100;
        expect(limiter.check(false)).toEqual({ ok: false, reason: "You are sending too many messages.", announce: true });
        now += 200;
        expect(limiter.check(true)).toEqual({ ok: true });
    });
});
