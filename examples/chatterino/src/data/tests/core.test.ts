import { beforeEach, describe, expect, test } from "bun:test";
import type { ChannelEvent } from "../api";
import { createChatCore } from "../core";
import { memoryStorage, STORAGE_KEYS } from "../persistence";
import api from "./fixtures/api.json";
import { LINES, RECORDED } from "./fixtures/lines";
import { FakeSocket, flushPromises, manualTimers, routedFetch, texts, type FetchRoute } from "./helpers";

const VALIDATE: FetchRoute = (url, init) => {
    if (!url.startsWith("https://id.twitch.tv/oauth2/validate")) return undefined;
    if (init?.headers?.Authorization !== "OAuth goodtoken") return { status: 401, body: { status: 401, message: "invalid access token" } };
    return { body: { client_id: "client123", login: "mylogin", user_id: "999", scopes: ["chat:read", "chat:edit"], expires_in: 5000 } };
};

function routes(history: string[] = []): FetchRoute[] {
    return [
        VALIDATE,
        (url) => (url.includes("recent-messages.robotty.de") ? { body: { messages: history, error: null, error_code: null } } : undefined),
        (url) => (url.startsWith("https://api.ivr.fi/v2/twitch/user?login=") ? { body: api.users.filter((user) => url.includes(user.login)) } : undefined),
        (url) => (url.startsWith("https://api.ivr.fi/v2/twitch/badges/global") ? { body: api.badgesGlobal } : undefined),
        (url) => (url.startsWith("https://api.ivr.fi/v2/twitch/badges/channel") ? { body: api.badgesChannel } : undefined),
        (url) => (url === "https://api.betterttv.net/3/cached/emotes/global" ? { body: api.bttvGlobal } : undefined),
        (url) => (url.startsWith("https://api.betterttv.net/3/cached/users/twitch/") ? { body: api.bttvChannel } : undefined),
        (url) => (url === "https://api.frankerfacez.com/v1/set/global" ? { body: api.ffzGlobal } : undefined),
        (url) => (url.startsWith("https://api.frankerfacez.com/v1/room/id/") ? { body: api.ffzRoom } : undefined),
        (url) => (url === "https://7tv.io/v3/emote-sets/global" ? { body: api.seventvGlobal } : undefined),
        (url) => (url.startsWith("https://7tv.io/v3/users/twitch/") ? { body: api.seventvChannel } : undefined),
    ];
}

function setup(history: string[] = []) {
    const timers = manualTimers();
    const fetch = routedFetch(routes(history));
    const storage = memoryStorage();
    const sounds: string[] = [];
    const notifications: Array<[string, string]> = [];
    const core = createChatCore({
        storage,
        fetch,
        timers,
        socketFactory: (url) => new FakeSocket(url),
        platform: {
            playSound: (name) => sounds.push(name),
            notify: (title, body) => notifications.push([title, body]),
        },
    });
    return { core, timers, fetch, storage, sounds, notifications };
}

async function settle(timers: ReturnType<typeof manualTimers>, ms = 100): Promise<void> {
    for (let i = 0; i < 5; i++) await flushPromises();
    timers.advance(ms);
    await flushPromises();
}

function lastSocket(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
}

function messageTexts(events: ChannelEvent[], type: "append" | "prepend"): string[] {
    return events.flatMap((event) => (event.type === type ? event.messages.map((message) => texts(message.elements)) : []));
}

beforeEach(() => {
    FakeSocket.instances = [];
});

describe("connection", () => {
    test("registers anonymously, joins after the welcome and answers PING", async () => {
        const { core, timers } = setup();
        const socket = lastSocket();
        expect(socket.url).toBe("wss://irc-ws.chat.twitch.tv:443");
        socket.open();
        expect(socket.sent[0]).toBe("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
        expect(socket.sent[1]).toMatch(/^NICK justinfan\d+$/);
        const channel = core.join("#Forsen");
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        expect(socket.sent.some((line) => line.startsWith("JOIN"))).toBe(false);
        socket.receive(LINES.welcome);
        expect(socket.sent).toContain("JOIN #forsen");
        const nick = socket.sent[1].slice(5);
        socket.receive(`:${nick}!${nick}@${nick}.tmi.twitch.tv JOIN #forsen`, LINES.ping);
        expect(socket.sent).toContain("PONG :tmi.twitch.tv");
        await settle(timers);
        expect(messageTexts(events, "append")).toEqual(["connected", "joined channel", "forsen is live!"]);
        expect(core.status.get()).toEqual({ connected: true, anonymous: true });
        expect(channel.info()).toMatchObject({ connected: true, roomId: "22484632", live: { live: true, game: "World of Warcraft" } });
        core.dispose();
    });

    test("batches many IRC lines into one append event per 100 ms", async () => {
        const { core, timers } = setup();
        const socket = lastSocket();
        socket.open();
        socket.receive(LINES.welcome);
        const channel = core.join("forsen");
        await settle(timers);
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        socket.receive(LINES.privmsgKappa, LINES.privmsgSelfMention, LINES.privmsgEmoji);
        socket.receive(LINES.clearMsg);
        expect(events).toHaveLength(0);
        timers.advance(100);
        const appends = events.filter((event) => event.type === "append");
        expect(appends).toHaveLength(1);
        expect(appends[0].type === "append" && appends[0].messages.map((message) => message.id)).toEqual([
            "b34ccfc7-4977-403a-8a94-33c6bac34fb8",
            "ping-1",
            "emoji-1",
            "deleted-b34ccfc7-4977-403a-8a94-33c6bac34fb8",
        ]);
        expect(appends[0].type === "append" && appends[0].messages[0].disabled).toBe(true);
        expect(events.some((event) => event.type === "update")).toBe(false);
        core.dispose();
    });

    test("RECONNECT announces, reconnects and replaces the disconnected line", async () => {
        const { core, timers } = setup();
        const first = lastSocket();
        first.open();
        first.receive(LINES.welcome);
        const channel = core.join("forsen");
        await settle(timers);
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        first.receive(LINES.reconnect);
        timers.advance(100);
        expect(messageTexts(events, "append")).toEqual(["Twitch Servers requested us to reconnect, reconnecting", "disconnected"]);
        expect(core.status.get().connected).toBe(false);
        const second = lastSocket();
        expect(second).not.toBe(first);
        second.open();
        second.receive(LINES.welcome);
        timers.advance(100);
        expect(second.sent).toContain("JOIN #forsen");
        const update = events.find((event) => event.type === "update");
        expect(update?.type === "update" && texts(update.patches[0].elements ?? [])).toBe("reconnected");
        core.dispose();
    });

    test("reconnects with backoff after the socket drops", async () => {
        const { core, timers } = setup();
        const first = lastSocket();
        first.open();
        first.receive(LINES.welcome);
        first.drop();
        expect(FakeSocket.instances).toHaveLength(1);
        timers.advance(999);
        expect(FakeSocket.instances).toHaveLength(1);
        timers.advance(1);
        expect(FakeSocket.instances).toHaveLength(2);
        lastSocket().drop();
        timers.advance(1999);
        expect(FakeSocket.instances).toHaveLength(2);
        timers.advance(1);
        expect(FakeSocket.instances).toHaveLength(3);
        core.dispose();
    });

    test("reference counts joins and parts after a grace period", async () => {
        const { core, timers } = setup();
        const socket = lastSocket();
        socket.open();
        socket.receive(LINES.welcome);
        const a = core.join("forsen");
        const b = core.join("FORSEN");
        expect(a).toBe(b);
        expect(socket.sent.filter((line) => line === "JOIN #forsen")).toHaveLength(1);
        core.leave("forsen");
        timers.advance(10_000);
        expect(socket.sent).not.toContain("PART #forsen");
        core.leave("forsen");
        timers.advance(4_999);
        expect(socket.sent).not.toContain("PART #forsen");
        timers.advance(1);
        expect(socket.sent).toContain("PART #forsen");
        core.dispose();
    });
});

describe("history", () => {
    test("loads history on join, marks it historical and dedupes live duplicates", async () => {
        const history = [RECORDED.plain, LINES.privmsgKappa.replace("@badge-info", "@historical=1;rm-received-ts=1794168000000;badge-info")];
        const { core, timers } = setup(history);
        const socket = lastSocket();
        socket.open();
        socket.receive(LINES.welcome);
        const channel = core.join("forsen");
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        socket.receive(LINES.privmsgKappa);
        await settle(timers);
        await settle(timers);
        const prepend = events.find((event) => event.type === "prepend");
        expect(prepend?.type === "prepend" && prepend.messages.map((message) => [message.id, message.historical])).toEqual([
            ["9519740f-a5aa-47fa-ab0b-d58cde43983e", true],
        ]);
        expect(channel.snapshot().filter((message) => message.id === "b34ccfc7-4977-403a-8a94-33c6bac34fb8")).toHaveLength(1);
        core.dispose();
    });
});

describe("accounts and sending", () => {
    test("rejects invalid tokens and refuses to send anonymously", async () => {
        const { core, timers } = setup();
        await expect(core.addAccount("badtoken")).rejects.toThrow("The token is invalid or expired.");
        const channel = core.join("forsen");
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        const result = await channel.send("hello");
        expect(result).toEqual({ ok: false, reason: "You need to log in to send messages. You can link your Twitch account in the settings." });
        timers.advance(100);
        const lastAppend = messageTexts(events, "append").pop();
        expect(lastAppend).toBe("You need to log in to send messages. You can link your Twitch account in the settings.");
        core.dispose();
    });

    test("adds an account, reconnects as that user and confirms sends with USERSTATE", async () => {
        const { core, timers, storage, sounds } = setup();
        lastSocket().open();
        const account = await core.addAccount("oauth:goodtoken");
        expect(account).toEqual({ login: "mylogin", userId: "999", clientId: "client123", token: "goodtoken", scopes: ["chat:read", "chat:edit"] });
        expect(JSON.parse(storage.getItem(STORAGE_KEYS.accounts) ?? "{}")).toMatchObject({ current: "mylogin" });
        const [, read, write] = FakeSocket.instances;
        read.open();
        write.open();
        expect(read.sent.slice(0, 3)).toEqual(["CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership", "PASS oauth:goodtoken", "NICK mylogin"]);
        expect(write.sent[0]).toBe("CAP REQ :twitch.tv/tags twitch.tv/commands");
        read.receive(LINES.welcome);
        write.receive(LINES.welcome);
        expect(core.status.get()).toEqual({ connected: true, anonymous: false, login: "mylogin" });
        const channel = core.join("forsen");
        const pending = channel.send("hello :joy:");
        expect(write.sent.pop()).toBe("PRIVMSG #forsen :hello 😂");
        write.receive("@badges=;color=;display-name=MyLogin;emote-sets=0;id=abc;mod=0;subscriber=0;user-type= :tmi.twitch.tv USERSTATE #forsen");
        expect(await pending).toEqual({ ok: true });
        const tooFast = await channel.send("again");
        expect(tooFast).toEqual({ ok: false, reason: "You are sending messages too quickly." });
        timers.advance(1200);
        const duplicate = channel.send("again");
        write.receive(LINES.noticeGeneric);
        expect(await duplicate).toMatchObject({ ok: false, reason: expect.stringMatching(/^Your message was not sent/) });
        read.receive(LINES.privmsgSelfMention.replace("MyLogin", "mylogin"));
        await settle(timers);
        expect(core.mentions.snapshot().map((message) => message.id)).toEqual(["ping-1"]);
        expect(texts(core.mentions.snapshot()[0].elements)).toStartWith("#forsen Pinger:");
        expect(sounds).toEqual(["ping"]);
        core.dispose();
    });

    test("unknown commands are rejected locally", async () => {
        const { core } = setup();
        lastSocket().open();
        await core.addAccount("goodtoken");
        const result = await core.join("forsen").send("/definitelynot");
        expect(result).toEqual({ ok: false, reason: "/definitelynot is not a known command." });
        core.dispose();
    });
});

describe("settings", () => {
    test("theme changes re-render existing messages as update patches", async () => {
        const { core, timers } = setup();
        const socket = lastSocket();
        socket.open();
        socket.receive(LINES.welcome);
        const channel = core.join("forsen");
        socket.receive(LINES.privmsgKappa);
        await settle(timers);
        const events: ChannelEvent[] = [];
        channel.subscribe((event) => events.push(event));
        core.settings.set((current) => ({ ...current, theme: "white" }));
        timers.advance(100);
        const update = events.find((event) => event.type === "update");
        const patch = update?.type === "update" ? update.patches.find((entry) => entry.id === "b34ccfc7-4977-403a-8a94-33c6bac34fb8") : undefined;
        expect(patch?.elements?.find((element) => element.kind === "user")).toMatchObject({ text: "Ronni:", color: "#0000ff" });
        core.dispose();
    });
});
