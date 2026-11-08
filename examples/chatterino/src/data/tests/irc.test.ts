import { describe, expect, test } from "bun:test";
import { isAction, parseIrcLine, splitIrcPayload, stripAction, unescapeTagValue } from "../irc/message";
import { parseTwitchEmotes } from "../twitch/tags";
import { LINES, RECORDED } from "./fixtures/lines";

describe("parseIrcLine", () => {
    test("parses tags, prefix, command and trailing parameter", () => {
        const message = parseIrcLine(LINES.privmsgKappa);
        expect(message?.command).toBe("PRIVMSG");
        expect(message?.nick).toBe("ronni");
        expect(message?.params[0]).toBe("#forsen");
        expect(message?.params[1]).toStartWith("Kappa Keepo");
        expect(message?.tags["display-name"]).toBe("Ronni");
        expect(message?.tags.badges).toBe("moderator/1,subscriber/0,bits/1000");
    });

    test("unescapes IRCv3 tag values", () => {
        expect(unescapeTagValue("a\\sb\\:c\\\\d\\ne")).toBe("a b;c\\d\ne");
        const message = parseIrcLine(LINES.subgift);
        expect(message?.tags["system-msg"]).toBe("TWW2 gifted a Tier 1 sub to Mr_Woodchuck!");
    });

    test("keeps tags without values as empty strings", () => {
        const message = parseIrcLine(RECORDED.plain);
        expect(message?.tags.historical).toBe("1");
        expect(message?.tags.emotes).toBe("");
        expect("flags" in (message?.tags ?? {})).toBe(true);
    });

    test("accepts a single-word trailing parameter without colon", () => {
        const message = parseIrcLine(RECORDED.plainNoColon);
        expect(message?.params).toEqual(["#forsen", "forsenRun"]);
    });

    test("parses server messages without tags", () => {
        expect(parseIrcLine(LINES.ping)).toMatchObject({ command: "PING", params: ["tmi.twitch.tv"], nick: "" });
        expect(parseIrcLine(LINES.welcome)?.command).toBe("001");
        expect(parseIrcLine(LINES.reconnect)?.command).toBe("RECONNECT");
    });

    test("splits websocket payloads into lines", () => {
        expect(splitIrcPayload("PING :a\r\nPING :b\r\n")).toEqual(["PING :a", "PING :b"]);
    });

    test("detects /me actions", () => {
        const content = parseIrcLine(RECORDED.action)?.params[1] ?? "";
        expect(isAction(content)).toBe(true);
        expect(stripAction(content)).toStartWith("cyhi won 20 points");
    });
});

describe("parseTwitchEmotes", () => {
    test("maps code point ranges to UTF-16 positions", () => {
        const content = "😀 Kappa";
        const occurrences = parseTwitchEmotes({ emotes: "25:2-6" }, content);
        expect(occurrences).toEqual([{ start: 3, end: 7, id: "25", name: "Kappa" }]);
    });

    test("sorts and dedupes occurrences", () => {
        const occurrences = parseTwitchEmotes({ emotes: "25:12-16,0-4/1902:6-10" }, "Kappa Keepo Kappa");
        expect(occurrences.map((occurrence) => occurrence.name)).toEqual(["Kappa", "Keepo", "Kappa"]);
    });

    test("ignores out of range coordinates", () => {
        expect(parseTwitchEmotes({ emotes: "25:0-40" }, "Kappa")).toEqual([]);
    });
});
