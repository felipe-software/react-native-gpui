import { describe, expect, test } from "bun:test";
import { buildHistory, parseRecentMessages, recentMessagesUrl } from "../history";
import { irc, testChannel } from "./helpers";
import { LINES, RECORDED } from "./fixtures/lines";

function historical(line: string, receivedTs: number): string {
    const tags = `historical=1;rm-received-ts=${receivedTs};`;
    return line.startsWith("@") ? `@${tags}${line.slice(1)}` : `@${tags.slice(0, -1)} ${line}`;
}

describe("recent messages", () => {
    test("builds the API url with the history limit", () => {
        expect(recentMessagesUrl("forsen", 800)).toBe("https://recent-messages.robotty.de/api/v2/recent-messages/forsen?limit=800");
    });

    test("parses raw lines and runs them through the same pipeline as live messages", () => {
        const lines = parseRecentMessages({
            messages: [RECORDED.plain, RECORDED.plainNoColon, RECORDED.firstMessage, RECORDED.highlightedMessage],
        });
        const { channel, timers } = testChannel();
        const built = buildHistory(channel, lines, timers.now());
        expect(built.every((message) => message.flags.historical)).toBe(true);
        expect(built.map((message) => message.login)).toEqual(["stellarb", "igor_16go", "xxmiskoxx", "joeyfreshwater82"]);
        const rendered = built.map((message) => channel.buffer.rendered(message));
        expect(rendered.every((message) => message.historical)).toBe(true);
        expect(rendered[2].background).toBe("#243122");
    });

    test("applies CLEARCHAT and CLEARMSG inside history", () => {
        const base = 1794168000000;
        const lines = parseRecentMessages({
            messages: [
                historical(LINES.privmsgKappa, base),
                historical(LINES.privmsgSelfMention, base + 10),
                historical(LINES.clearMsg, base + 20),
                historical(LINES.timeout600.replace("ronni", "pinger"), base + 30),
            ],
        });
        const { channel, timers } = testChannel();
        const built = buildHistory(channel, lines, timers.now());
        expect(built.map((message) => message.text)).toEqual([
            "Kappa Keepo Kappa LuL @forsen, check https://Example.com/Path.",
            "hey MyLogin how are you",
            "A message from ronni was deleted: Kappa Keepo Kappa LuL @forsen, check https://Examp…",
            "pinger has been timed out for 10m.",
        ]);
        expect(built[0].flags.disabled).toBe(true);
        expect(built[1].flags.disabled).toBe(true);
        expect(built.slice(2).every((message) => message.flags.historical)).toBe(true);
    });

    test("inserts a day separator when history crosses into an earlier day", () => {
        const { channel, timers } = testChannel();
        const yesterday = timers.now() - 24 * 3600 * 1000;
        const lines = parseRecentMessages({ messages: [historical(LINES.privmsgSelfMention, yesterday)] });
        const built = buildHistory(channel, lines, timers.now());
        expect(built).toHaveLength(2);
        expect(built[0].flags.system).toBe(true);
        expect(built[0].text).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
        expect(channel.buffer.rendered(built[0]).timestamp).toBe("0:00");
    });

    test("prepends history before live messages and dedupes by id", () => {
        const { channel, events, timers } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        timers.advance(100);
        const lines = parseRecentMessages({
            messages: [historical(LINES.privmsgSelfMention, timers.now() - 5000), historical(LINES.privmsgKappa, timers.now() - 1000)],
        });
        const accepted = channel.buffer.prepend(buildHistory(channel, lines, timers.now()));
        timers.advance(100);
        expect(accepted.map((message) => message.id)).toEqual(["ping-1"]);
        expect(channel.buffer.messages().map((message) => message.id)).toEqual(["ping-1", "b34ccfc7-4977-403a-8a94-33c6bac34fb8"]);
        const prepend = events.find((event) => event.type === "prepend");
        expect(prepend).toMatchObject({ type: "prepend", messages: [{ id: "ping-1", historical: true }] });
        expect(channel.snapshot().map((message) => !!message.historical)).toEqual([true, false]);
    });

    test("keeps only the newest history messages that fit the message limit", () => {
        const { channel, timers } = testChannel("forsen", { settings: { messageLimit: 3 } });
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        const history = [1, 2, 3, 4].map((index) =>
            historical(LINES.privmsgSelfMention.replace("id=ping-1", `id=h-${index}`), timers.now() - (10 - index) * 1000),
        );
        channel.buffer.prepend(buildHistory(channel, parseRecentMessages({ messages: history }), timers.now()));
        expect(channel.buffer.messages().map((message) => message.id)).toEqual(["h-3", "h-4", "b34ccfc7-4977-403a-8a94-33c6bac34fb8"]);
    });
});
