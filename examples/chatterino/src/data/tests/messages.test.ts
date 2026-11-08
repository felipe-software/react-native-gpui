import { describe, expect, test } from "bun:test";
import type { ChatListElement } from "react-native-gpui";
import { buildNotice } from "../messages/notice";
import { irc, testChannel, texts } from "./helpers";
import { LINES, RECORDED } from "./fixtures/lines";

function render(line: string, options: Parameters<typeof testChannel>[1] = {}) {
    const test = testChannel("forsen", options);
    const message = test.channel.handlePrivmsg(irc(line));
    if (!message) throw new Error("message was ignored");
    return { ...test, message, rendered: test.channel.buffer.rendered(message) };
}

function kinds(elements: ChatListElement[]): string[] {
    return elements.map((element) => element.kind);
}

describe("PRIVMSG", () => {
    test("orders badges, username, twitch/bttv emotes, mention and link like Chatterino", () => {
        const { rendered, message } = render(LINES.privmsgKappa);
        expect(kinds(rendered.elements)).toEqual([
            "badge",
            "badge",
            "badge",
            "user",
            "emote",
            "emote",
            "emote",
            "emote",
            "user",
            "text",
            "text",
            "text",
        ]);
        const [moderator, subscriber, bits, username, kappa, keepo, , lul, mention, check, link, period] = rendered.elements;
        expect(moderator).toMatchObject({ name: "moderator", tooltip: "Moderator", width: 18, height: 18 });
        expect(subscriber).toMatchObject({ name: "subscriber", tooltip: "Subscriber (14 months)" });
        expect(bits).toMatchObject({ name: "bits", tooltip: "Twitch cheer 1000" });
        expect(username).toEqual({ kind: "user", text: "Ronni:", login: "ronni", color: "#c6c6ff", bold: true });
        expect(kappa).toMatchObject({
            kind: "emote",
            name: "Kappa",
            url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
            width: 25,
            height: 28,
            tooltip: "Kappa\nTwitch Emote",
        });
        expect(keepo).toMatchObject({ name: "Keepo", width: 27, height: 29 });
        expect(lul).toMatchObject({ name: "LuL", url: "https://cdn.betterttv.net/emote/567b00c61ddbe1786688a633/1x.webp" });
        expect(mention).toEqual({ kind: "user", text: "@forsen", login: "forsen", bold: true, trailingSpace: false });
        expect(check).toEqual({ kind: "text", text: ", check" });
        expect(link).toEqual({
            kind: "text",
            text: "https://example.com/Path",
            color: "#4286f4",
            link: "https://Example.com/Path",
            trailingSpace: false,
        });
        expect(period).toEqual({ kind: "text", text: "." });
        expect(texts(rendered.elements.slice(3))).toBe(
            "Ronni: <emote:Kappa> <emote:Keepo> <emote:Kappa> <emote:LuL> @forsen, check https://example.com/Path.",
        );
        expect(rendered.timestamp).toMatch(/^\d{1,2}:\d{2}$/);
        expect(message.searchText).toContain("Ronni");
    });

    test("renders /me actions in the user color without a colon", () => {
        const { rendered } = render(RECORDED.action);
        const [, username, text] = rendered.elements;
        expect(username).toMatchObject({ kind: "user", text: "SchnozeBot", bold: true });
        expect(text).toMatchObject({ kind: "text", color: (username as { color: string }).color });
        expect(texts(rendered.elements)).toContain("cyhi won 20 points in roulette");
    });

    test("shows localized names as login(display)", () => {
        const { rendered } = render(LINES.privmsgLocalized);
        expect(rendered.elements[0]).toMatchObject({ kind: "user", text: "beijing(北京):", login: "beijing" });
    });

    test("builds the reply line from reply tags and strips the leading mention", () => {
        const { rendered, message } = render(RECORDED.reply);
        expect(texts(rendered.reply ?? [])).toBe("Replying to @puertoricanporo: XQC Please go live im so depressed");
        expect(rendered.reply?.[0]).toMatchObject({ kind: "text", color: "#8c7f7f" });
        expect(rendered.reply?.[1]).toMatchObject({ kind: "user", login: "puertoricanporo" });
        expect(message.text).toBe("https://www.twitch.tv/xqc247");
        expect(rendered.disabled).toBe(true);
        expect(rendered.historical).toBe(true);
    });

    test("uses the parent message when it is in the buffer", () => {
        const { channel } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        const reply = LINES.privmsgSelfMention.replace(
            "@badges=",
            "@reply-parent-msg-id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;reply-parent-display-name=Ronni;reply-parent-user-login=ronni;reply-parent-msg-body=old;reply-thread-parent-msg-id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;badges=",
        );
        const message = channel.handlePrivmsg(irc(reply))!;
        const rendered = channel.buffer.rendered(message);
        expect(texts(rendered.reply ?? [])).toStartWith("Replying to @ronni: Kappa Keepo Kappa LuL");
        expect(rendered.reply?.[0]).toMatchObject({ link: "chatterino://thread/b34ccfc7-4977-403a-8a94-33c6bac34fb8" });
        expect(rendered.reply?.[1]).toMatchObject({ color: "#c6c6ff", bold: false });
    });

    test("marks first messages, channel point highlights, rewards and hype chats", () => {
        expect(render(RECORDED.firstMessage).rendered).toMatchObject({ background: "#243122", marker: "#487f3f" });
        expect(render(RECORDED.highlightedMessage).rendered).toMatchObject({ background: "#1a3134", marker: "#1c7e8d" });
        expect(render(LINES.privmsgReward).rendered).toMatchObject({ background: "#1a3134" });
        expect(render(LINES.privmsgElevated).rendered).toMatchObject({ background: "#4f3c23", marker: "#ffae42" });
    });

    test("stacks zero-width emotes on the previous emote", () => {
        const { rendered, message } = render(LINES.privmsgZeroWidth);
        const emotes = rendered.elements.filter((element) => element.kind === "emote");
        expect(emotes.map((emote) => [emote.name, !!(emote as { zeroWidth?: boolean }).zeroWidth])).toEqual([
            ["forsenBlunder", false],
            ["SoSnowy", true],
            ["RainTime", true],
        ]);
        expect(message.pieces.filter((piece) => piece.kind === "emote")).toHaveLength(1);
        expect(emotes[2]).toMatchObject({ width: 32, height: 32 });
    });

    test("renders cheermotes with tier colors and amounts", () => {
        const { rendered } = render(LINES.privmsgCheer);
        const words = rendered.elements.slice(3);
        expect(words[0]).toMatchObject({ kind: "emote", url: "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/1.gif" });
        expect(words[1]).toEqual({ kind: "text", text: "100", color: "#d1a6f4" });
        expect(words[3]).toMatchObject({ kind: "emote", url: expect.stringContaining("/animated/1/1.gif") });
        expect(words[4]).toMatchObject({ kind: "text", text: "50" });
    });

    test("splits emoji into images", () => {
        const { rendered } = render(LINES.privmsgEmoji);
        const words = rendered.elements.slice(1);
        expect(words.map((element) => element.kind)).toEqual(["text", "emote", "text", "emote", "emote"]);
        expect(words[1]).toMatchObject({ url: "https://pajbot.com/static/emoji-v2/img/twitter/64/1f600.png", tooltip: ":grinning:\nEmoji" });
        expect(words[3]).toMatchObject({ url: expect.stringContaining("2764-fe0f.png") });
        expect(words[4]).toMatchObject({ url: expect.stringContaining("1f44d-1f3fd.png"), tooltip: ":+1_tone3:\nEmoji" });
    });

    test("highlights self mentions when logged in and routes them to mentions", () => {
        const { rendered, message } = render(LINES.privmsgSelfMention, { selfLogin: "mylogin" });
        expect(message.flags).toMatchObject({ highlighted: true, showInMentions: true });
        expect(rendered).toMatchObject({ background: "#4c2c31", marker: "#7f3f49" });
        expect(message.alert).toEqual({ playSound: true, windowAlert: true });
        expect(render(LINES.privmsgSelfMention).message.flags.highlighted).toBeUndefined();
    });

    test("drops ignored users and blocked phrases, replaces phrases", () => {
        const ignoredUser = testChannel("forsen", { settings: { ignoredUsers: ["Ronni"] } });
        expect(ignoredUser.channel.handlePrivmsg(irc(LINES.privmsgKappa))).toBeUndefined();
        const blocked = testChannel("forsen", {
            settings: { ignoredPhrases: [{ pattern: "how are", isRegex: false, caseSensitive: false }] },
        });
        expect(blocked.channel.handlePrivmsg(irc(LINES.privmsgSelfMention))).toBeUndefined();
        const replaced = testChannel("forsen", {
            settings: { ignoredPhrases: [{ pattern: "Keepo", isRegex: false, caseSensitive: true, replaceWith: "***" }] },
        });
        const message = replaced.channel.handlePrivmsg(irc(LINES.privmsgKappa))!;
        expect(message.text).toStartWith("Kappa *** Kappa LuL");
        const emotes = message.pieces.filter((piece) => piece.kind === "emote").map((piece) => piece.kind === "emote" && piece.emote.name);
        expect(emotes).toEqual(["Kappa", "Kappa", "LuL"]);
    });
});

describe("USERNOTICE", () => {
    test("resub: user message first with sub background, then the system line", () => {
        const { channel } = testChannel();
        const [user, system] = channel.handleUserNotice(irc(RECORDED.resub));
        expect(user.flags).toMatchObject({ subscription: true, highlighted: false });
        expect(texts(channel.buffer.rendered(user).elements.slice(-1))).toBe("<emote:HmmFace>");
        const rendered = channel.buffer.rendered(system);
        expect(texts(rendered.elements)).toBe(
            "seuss02 subscribed with Prime. They've subscribed for 63 months, currently on a 1 month streak!",
        );
        expect(rendered.elements[0]).toMatchObject({ kind: "user", login: "seuss02", color: "#f4edf2" });
        expect(rendered).toMatchObject({ background: "#5c3773", marker: "#c466ff" });
    });

    test("multi-month subs are rewritten like Chatterino", () => {
        const { channel } = testChannel("kaicenat");
        const [system] = channel.handleUserNotice(irc(RECORDED.sub));
        expect(system.text).toBe("xella13___ subscribed at Tier 1 for 3 months in advance!");
    });

    test("subgift mentions both users and colors the recipient when known", () => {
        const { channel } = testChannel();
        channel.setUserColor("mr_woodchuck", "#ff7f50");
        const [gift] = channel.handleUserNotice(irc(LINES.subgift));
        const rendered = channel.buffer.rendered(gift);
        expect(texts(rendered.elements)).toBe("TWW2 gifted a Tier 1 sub to Mr_Woodchuck!");
        expect(rendered.elements[0]).toMatchObject({ kind: "user", login: "tww2", text: "TWW2" });
        expect(rendered.elements[2]).toMatchObject({
            kind: "user",
            login: "mr_woodchuck",
            text: "Mr_Woodchuck",
            color: "#ff7f50",
            bold: true,
            trailingSpace: false,
        });
        expect(rendered.elements[3]).toMatchObject({ kind: "text", text: "!" });
        expect(rendered.background).toBe("#5c3773");
    });

    test("multi-month subgifts use Chatterino's custom wording", () => {
        const { channel } = testChannel();
        const [gift] = channel.handleUserNotice(irc(LINES.subgiftMultiMonth));
        expect(gift.text).toBe("TWW2 gifted 6 months of a Tier 2 sub to Mr_Woodchuck! They've gifted 12 months in the channel.");
    });

    test("submysterygift, raid, bits badge tier and watch streaks", () => {
        const { channel } = testChannel();
        const [mystery] = channel.handleUserNotice(irc(LINES.submysterygift));
        expect(mystery.text).toBe("An anonymous user is gifting 5 Tier 1 Subs to forsen's community!");
        const [raid] = channel.handleUserNotice(irc(LINES.raid));
        expect(texts(channel.buffer.rendered(raid).elements)).toBe("15 raiders from TestChannel have joined!");
        expect(channel.buffer.rendered(raid).elements[1]).toMatchObject({ kind: "user", text: "TestChannel", login: "testchannel" });
        const tier = channel.handleUserNotice(irc(LINES.bitsBadgeTier));
        expect(tier.map((message) => message.text)).toEqual(["yay", "Biter just earned a new 10K Bits badge!"]);
        const [streakMessage, streak] = channel.handleUserNotice(irc(RECORDED.watchStreak));
        expect(streakMessage.flags.watchStreak).toBe(true);
        expect(streak.text).toBe("codenamefelix watched 10 consecutive streams and sparked a watch streak!");
        expect(channel.buffer.rendered(streak)).toMatchObject({ background: "#123658", marker: "#0082ff" });
    });

    test("announcements keep their highlight and add the Announcement line", () => {
        const { channel } = testChannel("lirik");
        const [user, system] = channel.handleUserNotice(irc(RECORDED.announcement));
        expect(user.flags).toMatchObject({ announcement: true, highlighted: true, subscription: true });
        expect(system.text).toBe("Announcement");
        expect(texts(channel.buffer.rendered(user).elements)).toContain("https://open.spotify.com/show/033vEDTr8Y7RAMtZuDYOsQ");
    });

    test("ignores shared chat notices that are not announcements", () => {
        const { channel } = testChannel();
        expect(channel.handleUserNotice(irc(LINES.sharedChatSub))).toEqual([]);
    });
});

describe("moderation", () => {
    test("CLEARMSG disables one message and adds the deletion line", () => {
        const { channel, events, timers } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        timers.advance(100);
        channel.handleClearMsg(irc(LINES.clearMsg));
        timers.advance(100);
        const update = events.find((event) => event.type === "update");
        expect(update).toEqual({
            type: "update",
            patches: [{ id: "b34ccfc7-4977-403a-8a94-33c6bac34fb8", disabled: true, hidden: false }],
        });
        const deletion = channel.buffer.last()!;
        expect(texts(channel.buffer.rendered(deletion).elements)).toBe(
            "A message from Ronni was deleted: Kappa Keepo Kappa LuL @forsen, check https://Examp…",
        );
        expect(channel.buffer.rendered(deletion).elements[1]).toMatchObject({ kind: "user", login: "ronni", bold: true });
    });

    test("deleted messages are hidden when showDeletedMessages is off", () => {
        const { channel, events, timers } = testChannel("forsen", { settings: { showDeletedMessages: false } });
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        timers.advance(100);
        channel.handleClearMsg(irc(LINES.clearMsg));
        timers.advance(100);
        const update = events.find((event) => event.type === "update");
        expect(update).toEqual({
            type: "update",
            patches: [{ id: "b34ccfc7-4977-403a-8a94-33c6bac34fb8", disabled: true, hidden: true }],
        });
        const deletion = channel.buffer.last()!;
        expect(channel.buffer.rendered(deletion).hidden).toBeUndefined();
    });

    test("timeouts disable the user's messages and stack within five seconds", () => {
        const { channel, events, timers } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        channel.handleClearChat(irc(LINES.timeout600));
        timers.advance(100);
        expect(texts(channel.buffer.rendered(channel.buffer.last()!).elements)).toBe("ronni has been timed out for 10m.");
        expect(channel.buffer.messages()[0].flags.disabled).toBe(true);
        channel.handleClearChat(irc(LINES.timeout600.replace("1794168002200", "1794168003200")));
        timers.advance(100);
        expect(channel.buffer.size()).toBe(2);
        expect(texts(channel.buffer.rendered(channel.buffer.last()!).elements)).toBe("ronni has been timed out for 10m. (2 times)");
        expect(events.some((event) => event.type === "update")).toBe(true);
    });

    test("a timeout does not stack once the user wrote again", () => {
        const { channel } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgKappa));
        channel.handleClearChat(irc(LINES.timeout600));
        channel.handlePrivmsg(irc(LINES.privmsgKappa.replace("id=b34ccfc7-4977-403a-8a94-33c6bac34fb8", "id=again")));
        channel.handleClearChat(irc(LINES.timeout600.replace("1794168002200", "1794168003200")));
        expect(channel.buffer.messages().map((message) => message.text.split(" ").slice(0, 3).join(" "))).toEqual([
            "Kappa Keepo Kappa",
            "ronni has been",
            "Kappa Keepo Kappa",
            "ronni has been",
        ]);
        expect(channel.buffer.last()?.text).toBe("ronni has been timed out for 10m.");
        expect(channel.buffer.messages().every((message) => message.flags.disabled || message.flags.timeout)).toBe(true);
    });

    test("bans and clear chat use Chatterino's wording", () => {
        const { channel } = testChannel();
        channel.handlePrivmsg(irc(LINES.privmsgSelfMention));
        channel.handleClearChat(irc(LINES.ban));
        expect(channel.buffer.last()?.text).toBe("ronni has been permanently banned.");
        channel.handleClearChat(irc(LINES.clearChat));
        expect(channel.buffer.last()?.text).toBe("Chat has been cleared by a moderator.");
        expect(channel.buffer.messages()[0].flags.disabled).toBe(true);
    });

    test("recorded history timeout targets the right user", () => {
        const { channel } = testChannel("xqc");
        channel.handleClearChat(irc(RECORDED.timeout));
        expect(channel.buffer.last()).toMatchObject({ text: "puertoricanporo has been timed out for 30s.", flags: { historical: true } });
    });
});

describe("NOTICE", () => {
    const colorOf = () => "system" as const;
    test("timeouts, login failures and generic notices", () => {
        expect(buildNotice(irc(LINES.noticeTimedOut), undefined, colorOf, 0)).toMatchObject({
            message: { text: "You are timed out for 1h." },
            sendWaitSeconds: 3600,
            broadcast: false,
        });
        const login = buildNotice(irc(LINES.noticeLoginFailed), "mylogin", colorOf, 0);
        expect(login).toMatchObject({ broadcast: true, loginFailed: true });
        expect(login.message?.text).toBe('Login expired for user "mylogin"! Try adding your account again.');
        expect(buildNotice(irc(LINES.noticeSlow), undefined, colorOf, 0).sendWaitSeconds).toBe(10);
        expect(buildNotice(irc(LINES.noticeGeneric), undefined, colorOf, 0).message?.text).toStartWith("Your message was not sent");
    });
});

describe("ROOMSTATE", () => {
    test("maps room modes into channel info", () => {
        const { channel, events, timers } = testChannel();
        expect(channel.handleRoomState(irc(LINES.roomState))).toBe("22484632");
        timers.advance(100);
        expect(channel.info()).toMatchObject({
            roomId: "22484632",
            modes: { emoteOnly: false, followersOnlyMinutes: 10, r9k: true, slowSeconds: 30, subOnly: true },
        });
        expect(events.filter((event) => event.type === "info")).toHaveLength(1);
    });
});

describe("render options", () => {
    test("light theme darkens username colors and the timestamp follows the format", () => {
        const { channel, settings } = testChannel();
        const message = channel.handlePrivmsg(irc(LINES.privmsgKappa))!;
        settings.value = { ...settings.value, theme: "light", timestampFormat: "HH:mm:ss" };
        channel.buffer.invalidateAll();
        const rendered = channel.buffer.rendered(message);
        expect(rendered.elements[3]).toMatchObject({ color: "#0000ff" });
        expect(rendered.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    test("hides badges when disabled", () => {
        const { rendered } = render(LINES.privmsgKappa, { settings: { showBadges: false } });
        expect(rendered.elements[0]).toMatchObject({ kind: "user" });
    });
});
