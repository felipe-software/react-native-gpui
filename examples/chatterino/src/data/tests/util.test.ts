import { describe, expect, test } from "bun:test";
import { linkDisplayText, linkTarget, parseLink } from "../links/parse";
import { blendColors, formatColor, normalizeColor, parseColor } from "../util/colors";
import { formatDuration, formatLongDate, formatTimestamp } from "../util/time";
import { randomUserColor } from "../twitch/usercolor";
import { resolveTint } from "../messages/render";
import { parseInternalLink } from "../links/internal";

describe("parseLink", () => {
    test("accepts links with and without protocol", () => {
        expect(linkTarget(parseLink("https://twitch.tv/forsen")!)).toBe("https://twitch.tv/forsen");
        expect(linkTarget(parseLink("google.com")!)).toBe("http://google.com");
        expect(parseLink("forsen.tv/xd")?.host).toBe("forsen.tv");
    });

    test("rejects unknown tlds, double dots and bare words", () => {
        expect(parseLink("hello.notatld")).toBeUndefined();
        expect(parseLink("a..com")).toBeUndefined();
        expect(parseLink("forsenE")).toBeUndefined();
        expect(parseLink("...")).toBeUndefined();
    });

    test("strips surrounding punctuation but keeps balanced parens", () => {
        const parsed = parseLink("(https://en.wikipedia.org/wiki/Foo_(bar))")!;
        expect(parsed.prefix).toBe("(");
        expect(parsed.link).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
        expect(parsed.suffix).toBe(")");
        const trailing = parseLink("example.com.")!;
        expect(trailing.link).toBe("example.com");
        expect(trailing.suffix).toBe(".");
    });

    test("lowercases only the host for display", () => {
        expect(linkDisplayText(parseLink("HTTPS://Example.COM/Path")!)).toBe("HTTPS://example.com/Path");
    });

    test("accepts ipv4 hosts and ports", () => {
        expect(parseLink("192.168.0.1:8080/x")?.host).toBe("192.168.0.1");
        expect(parseLink("300.1.1.1")).toBeUndefined();
        expect(parseLink("example.com:abc")).toBeUndefined();
    });
});

describe("colors", () => {
    test("parses css hex forms", () => {
        expect(parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 255 });
        expect(parseColor("#7f3f497f")).toEqual({ r: 127, g: 63, b: 73, a: 127 });
        expect(parseColor("rgba(1,2,3,0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 128 });
        expect(parseColor("nope")).toBeUndefined();
    });

    test("normalizes dark colors for dark themes like Chatterino", () => {
        expect(formatColor(normalizeColor(parseColor("#0000ff")!, false))).toBe("#c6c6ff");
        expect(formatColor(normalizeColor(parseColor("#ff0000")!, false))).toBe("#ff0000");
        expect(formatColor(normalizeColor(parseColor("#000000")!, false))).toBe("#808080");
    });

    test("darkens light colors for light themes", () => {
        expect(formatColor(normalizeColor(parseColor("#ffffff")!, true))).toBe("#808080");
        expect(formatColor(normalizeColor(parseColor("#00ff00")!, true))).toBe("#00ff00");
        expect(formatColor(normalizeColor(parseColor("#9acd32")!, true))).toBe("#4f6a1a");
    });

    test("resolves theme tints", () => {
        expect(resolveTint("text", "dark")).toBeUndefined();
        expect(resolveTint("system", "dark")).toBe("#8c7f7f");
        expect(resolveTint("link", "dark")).toBe("#4286f4");
        expect(resolveTint("link", "light")).toBe("#0e65f1");
    });

    test("blends with alpha", () => {
        expect(formatColor(blendColors(parseColor("#191919")!, parseColor("#7f3f497f")!))).toBe("#4c2c31");
    });

    test("assigns Twitch default username colors by user id", () => {
        expect(randomUserColor("0")).toBe("#ff0000");
        expect(randomUserColor("16")).toBe("#0000ff");
    });
});

describe("time", () => {
    const at = new Date(2026, 10, 8, 9, 5, 7, 42).getTime();
    test("formats Qt-style timestamp patterns", () => {
        expect(formatTimestamp(at, "h:mm")).toBe("9:05");
        expect(formatTimestamp(at, "hh:mm:ss")).toBe("09:05:07");
        expect(formatTimestamp(at, "h:mm a")).toBe("9:05 am");
        expect(formatTimestamp(new Date(2026, 10, 8, 21, 5).getTime(), "h:mm AP")).toBe("9:05 PM");
        expect(formatTimestamp(at, "HH:mm:ss.zzz")).toBe("09:05:07.042");
        expect(formatTimestamp(at, "'at' h")).toBe("at 9");
    });

    test("formats durations like Chatterino's formatTime", () => {
        expect(formatDuration(600)).toBe("10m");
        expect(formatDuration(3661)).toBe("1h 1m 1s");
        expect(formatDuration(1209600)).toBe("14d");
        expect(formatDuration(0)).toBe("");
    });

    test("formats long dates for history day separators", () => {
        expect(formatLongDate(at)).toBe("Sunday, November 8, 2026");
    });
});

describe("internal links", () => {
    test("parses chatterino:// targets used by system lines and replies", () => {
        expect(parseInternalLink("chatterino://accounts")).toEqual({ type: "accounts" });
        expect(parseInternalLink("chatterino://reconnect")).toEqual({ type: "reconnect" });
        expect(parseInternalLink("chatterino://channel/forsen")).toEqual({ type: "channel", name: "forsen" });
        expect(parseInternalLink("chatterino://thread/abc-1")).toEqual({ type: "thread", rootId: "abc-1" });
        expect(parseInternalLink("chatterino://message/a%2Fb")).toEqual({ type: "message", id: "a/b" });
        expect(parseInternalLink("https://twitch.tv")).toBeUndefined();
    });
});
