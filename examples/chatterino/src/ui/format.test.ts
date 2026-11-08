import { describe, expect, test } from "bun:test";
import { accountAge, formatDurationExact, formatUptime, headerTitle, liveTooltip, roomModesText } from "./format";

describe("room modes (SplitHeader.cpp formatRoomModeUnclean)", () => {
    test("followers-only durations use the largest exact unit", () => {
        expect(roomModesText({ followersOnlyMinutes: 1440 })).toBe("follow(1d)");
        expect(roomModesText({ followersOnlyMinutes: 10 })).toBe("follow(10m)");
        expect(roomModesText({ followersOnlyMinutes: 90 })).toBe("follow(90m)");
        expect(roomModesText({ followersOnlyMinutes: 0 })).toBe("follow");
        expect(roomModesText({ followersOnlyMinutes: -1 })).toBe("");
    });

    test("modes keep Chatterino's order and break after the second item", () => {
        expect(roomModesText({ r9k: true, slowSeconds: 30, emoteOnly: true, subOnly: true })).toBe("r9k, slow(30),\nemote, sub");
        expect(roomModesText({ subOnly: true, emoteOnly: true })).toBe("emote, sub");
    });

    test("no modes reads none only for moderators", () => {
        expect(roomModesText({})).toBe("");
        expect(roomModesText({}, true)).toBe("none");
    });
});

describe("durations and titles", () => {
    test("formatDurationExact", () => {
        expect(formatDurationExact(0)).toBe("0s");
        expect(formatDurationExact(45)).toBe("45s");
        expect(formatDurationExact(7200)).toBe("2h");
        expect(formatDurationExact(86400 * 7)).toBe("7d");
    });

    test("uptime is hours and minutes", () => {
        expect(formatUptime(0, (3 * 60 + 7) * 60_000)).toBe("3h 7m");
    });

    test("header title shows live state and the empty split", () => {
        expect(headerTitle("xqc", { name: "xqc", displayName: "xQc", connected: true, modes: {}, live: { live: true } })).toBe("xQc (live)");
        expect(headerTitle("forsen", undefined)).toBe("forsen");
        expect(headerTitle("", undefined)).toBe("<empty>");
    });

    test("live tooltip text", () => {
        const tooltip = liveTooltip({ live: true, title: "t", game: "g", viewers: 12345, startedAt: 0 }, 65 * 60_000);
        expect(tooltip?.status).toBe("Live for 1h 5m with 12,345 viewers");
        expect(liveTooltip({ live: false, title: "old" }, 0)?.status).toBe("Offline");
    });

    test("account age", () => {
        const day = 86_400_000;
        expect(accountAge(0, 400 * day)).toBe("1 year, 1 month ago");
        expect(accountAge(0, 3 * day)).toBe("3 days ago");
    });
});
