import { describe, expect, test } from "bun:test";
import { withAlpha } from "./colors";
import { stepHover, stepRipples } from "./common/useButtonEffect";
import { scaledPoints, uiScaleOf, zoomedScale } from "./zoom";
import { accountAge, formatDurationExact, formatUptime, headerTitle, liveTooltip, roomModesText, streamThumbnail } from "./format";
import { headerTooltipBlocks } from "./splits/headerTooltip";
import { wrapTooltipText } from "./overlays/Tooltip";

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

describe("button effect (Button::onMouseEffectTimeout)", () => {
    test("hover fades in by 0.5 and out by 0.3 per tick", () => {
        expect(stepHover(0, true)).toBe(0.5);
        expect(stepHover(0.5, true)).toBe(1);
        expect(stepHover(1, false)).toBeCloseTo(0.7);
        expect(stepHover(0.2, false)).toBe(0);
    });

    test("click ripples grow slowly while held and finish after release", () => {
        const start = [{ id: 1, x: 0, y: 0, progress: 0 }];
        expect(stepRipples(start, true)[0].progress).toBeCloseTo(0.02);
        expect(stepRipples([{ id: 1, x: 0, y: 0, progress: 0.95 }], false)).toEqual([]);
    });

    test("colors get an alpha", () => {
        expect(withAlpha("#aaaaaa", 0.5)).toBe("rgba(170, 170, 170, 0.500)");
        expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1.000)");
        expect(withAlpha("rgba(1,2,3,0.4)", 1)).toBe("rgba(1,2,3,0.4)");
    });
});

describe("zoom (Settings::setClampedUiScale, Window zoom hotkey)", () => {
    test("steps by 0.1 within 0.2..10 and resets to 1", () => {
        expect(zoomedScale(1, "in")).toBe(1.1);
        expect(zoomedScale(1, "out")).toBe(0.9);
        expect(zoomedScale(0.25, "out")).toBe(0.2);
        expect(zoomedScale(10, "in")).toBe(10);
        expect(zoomedScale(3, "reset")).toBe(1);
        expect(uiScaleOf({})).toBe(1);
    });

    test("font points are truncated after scaling", () => {
        expect(scaledPoints(11, 1.1)).toBe(12);
        expect(scaledPoints(11, 0.2)).toBe(2);
    });
});

describe("split header live title and tooltip (SplitHeader::updateChannelText)", () => {
    const info = {
        name: "xqc",
        displayName: "xQc",
        connected: true,
        modes: {},
        live: { live: true, title: "  JUST  CHATTING  ", game: "Just Chatting", viewers: 51234, startedAt: 0 },
    };

    test("optional uptime, viewers, game and title parts", () => {
        const now = 125 * 60_000;
        expect(headerTitle("xqc", info, {}, now)).toBe("xQc (live)");
        expect(headerTitle("xqc", info, { uptime: true, viewers: true, game: true, title: true }, now)).toBe(
            "xQc (live) - 2h 5m - 51,234 - Just Chatting - JUST CHATTING",
        );
        expect(headerTitle("forsen", undefined, { filtered: true })).toBe("forsen - filtered");
    });

    test("tooltip has title, thumbnail, game and status in order", () => {
        const blocks = headerTooltipBlocks(info.live, "xqc", 2, 65 * 60_000) ?? [];
        expect(blocks.map((block) => (block.kind === "text" ? block.text : `img:${block.width}x${block.height}`))).toEqual([
            "  JUST  CHATTING  ",
            " ",
            "img:160x90",
            "Just Chatting",
            "Live for 1h 5m with 51,234 viewers",
        ]);
        const image = blocks.find((block) => block.kind === "image");
        expect(image?.kind === "image" && image.url).toStartWith("https://static-cdn.jtvnw.net/previews-ttv/live_user_xqc-160x90.jpg?t=");
        expect(headerTooltipBlocks({ live: false, title: "old" }, "xqc", 2, 0)).toEqual([
            { kind: "text", text: "Offline" },
            { kind: "text", text: "old" },
        ]);
        expect(streamThumbnail("xqc", 0, 0)).toBeUndefined();
    });
});

describe("tooltip wrapping", () => {
    test("wraps at word boundaries", () => {
        expect(wrapTooltipText("aaa bbb ccc ddd", 7)).toEqual(["aaa bbb", "ccc ddd"]);
        expect(wrapTooltipText("", 7)).toEqual([""]);
        expect(wrapTooltipText("averyveryverylongword x", 7)).toEqual(["averyveryverylongword", "x"]);
    });
});
