import { beforeEach, describe, expect, test } from "bun:test";
import type { ChatListMessage } from "react-native-gpui";
import type { AccountsState, Channel, SendResult } from "./api";
import { createReplySender, prepareReplyText, replyLine } from "./replies";
import { createStore } from "./store";
import { belongsToThread, hasThread, threadFeed, threadMessages, threadRootId } from "./threads";
import { FakeSocket, flushPromises, manualTimers } from "./tests/helpers";
import { hasModRights, rightsFromUserState, watchChannelRights } from "./user-state";

const WELCOME = ":tmi.twitch.tv 001 mylogin :Welcome, GLHF!";
const ACCOUNT = { login: "mylogin", userId: "999", clientId: "c", token: "tok", scopes: ["chat:edit"] };

type FakeChannel = Channel & { sent: string[]; system: string[] };

function fakeChannel(name = "forsen", messages: ChatListMessage[] = []): FakeChannel {
    const sent: string[] = [];
    const system: string[] = [];
    const listeners = new Set<(event: { type: "append"; messages: ChatListMessage[] }) => void>();
    return {
        name,
        sent,
        system,
        info: () => ({ name, connected: true, modes: {} }),
        snapshot: () => messages,
        subscribe: (listener) => {
            listeners.add(listener as never);
            return () => listeners.delete(listener as never);
        },
        send: async (text: string): Promise<SendResult> => {
            sent.push(text);
            return { ok: true };
        },
        emotes: () => [],
        complete: () => [],
        userMessages: () => [],
        search: () => [],
        clear: () => undefined,
        addSystemMessage: (text: string) => system.push(text),
        emit: (fresh: ChatListMessage[]) => {
            for (const listener of listeners) listener({ type: "append", messages: fresh });
        },
    } as unknown as FakeChannel;
}

function setup(state: AccountsState) {
    const accounts = createStore<AccountsState>(state);
    const timers = manualTimers();
    const sender = createReplySender(accounts, { socketFactory: (url) => new FakeSocket(url), timers });
    return { accounts, timers, sender };
}

beforeEach(() => {
    FakeSocket.instances = [];
});

describe("reply sending (TwitchIrcServer::onReplySendRequested)", () => {
    test("formats the tagged PRIVMSG", () => {
        expect(replyLine("forsen", "abc-1", "hi")).toBe("@reply-parent-msg-id=abc-1 PRIVMSG #forsen :hi");
        expect(prepareReplyText("  hello   :joy:  ")).toBe("hello 😂");
    });

    test("anonymous users fall back to the normal send, which shows the login message", async () => {
        const { sender } = setup({ accounts: [] });
        const channel = fakeChannel();
        await sender.send(channel, "abc", "hello");
        expect(channel.sent).toEqual(["hello"]);
        expect(FakeSocket.instances).toHaveLength(0);
    });

    test("logged in: opens its own connection and sends with reply-parent-msg-id", async () => {
        const { sender } = setup({ accounts: [ACCOUNT], current: "mylogin" });
        const channel = fakeChannel();
        const pending = sender.send(channel, "abc-123", "hello :joy:");
        const socket = FakeSocket.instances[0];
        socket.open();
        expect(socket.sent.slice(0, 3)).toEqual(["CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS oauth:tok", "NICK mylogin"]);
        socket.receive(WELCOME);
        expect(await pending).toEqual({ ok: true });
        expect(socket.sent.pop()).toBe("@reply-parent-msg-id=abc-123 PRIVMSG #forsen :hello 😂");
        expect(channel.sent).toEqual([]);
    });

    test("commands and unsafe ids go through the normal send", async () => {
        const { sender } = setup({ accounts: [ACCOUNT], current: "mylogin" });
        const channel = fakeChannel();
        await sender.send(channel, "abc", "/me waves");
        await sender.send(channel, "bad id;x", "hello");
        expect(channel.sent).toEqual(["/me waves", "hello"]);
    });

    test("notices on the reply connection become system messages", async () => {
        const { sender } = setup({ accounts: [ACCOUNT], current: "mylogin" });
        const channel = fakeChannel();
        const pending = sender.send(channel, "abc", "hello");
        const socket = FakeSocket.instances[0];
        socket.open();
        socket.receive(WELCOME);
        await pending;
        socket.receive("@msg-id=msg_duplicate :tmi.twitch.tv NOTICE #forsen :Your message was not sent.");
        expect(channel.system).toEqual(["Your message was not sent."]);
    });

    test("switching accounts closes the old connection", async () => {
        const { sender, accounts } = setup({ accounts: [ACCOUNT], current: "mylogin" });
        const pending = sender.send(fakeChannel(), "abc", "hello");
        const socket = FakeSocket.instances[0];
        socket.open();
        socket.receive(WELCOME);
        await pending;
        accounts.set({ accounts: [ACCOUNT] });
        expect(socket.readyState).toBe(3);
        sender.dispose();
    });

    test("gives up when the connection never registers", async () => {
        const { sender, timers } = setup({ accounts: [ACCOUNT], current: "mylogin" });
        const pending = sender.send(fakeChannel(), "abc", "hello");
        await flushPromises();
        timers.advance(8_000);
        expect(await pending).toEqual({ ok: false, reason: "Not connected to Twitch chat yet. Try again in a moment." });
    });
});

function message(id: string, rootId?: string): ChatListMessage {
    const reply = rootId ? [{ kind: "text" as const, text: "Replying to", link: `chatterino://thread/${rootId}` }] : undefined;
    return { id, elements: [{ kind: "text", text: id }], ...(reply ? { reply } : {}) };
}

describe("reply threads", () => {
    const messages = [message("root"), message("other"), message("a", "root"), message("b", "x"), message("c", "root")];

    test("the thread root comes from the reply line link", () => {
        expect(threadRootId(messages[2])).toBe("root");
        expect(threadRootId(messages[0])).toBeUndefined();
        expect(belongsToThread(messages[0], "root")).toBe(true);
    });

    test("collects the root and its replies in order without the reply line", () => {
        const thread = threadMessages(messages, "root");
        expect(thread.map((entry) => entry.id)).toEqual(["root", "a", "c"]);
        expect(thread.every((entry) => entry.reply === undefined)).toBe(true);
        expect(hasThread(messages, "root")).toBe(true);
        expect(hasThread(messages, "other")).toBe(false);
    });

    test("the feed appends only new replies of that thread", () => {
        const channel = fakeChannel("forsen", messages) as FakeChannel & { emit: (fresh: ChatListMessage[]) => void };
        const feed = threadFeed(channel, "root");
        const appended: string[] = [];
        const stop = feed.subscribe((fresh) => appended.push(...fresh.map((entry) => entry.id)));
        channel.emit([message("d", "root"), message("e")]);
        stop();
        expect(appended).toEqual(["d"]);
        expect(feed.messages()).toHaveLength(3);
    });
});

describe("moderator rights from USERSTATE", () => {
    test("mod tag, badges and broadcaster", () => {
        expect(rightsFromUserState({ mod: "1", badges: "" })).toMatchObject({ moderator: true });
        expect(rightsFromUserState({ mod: "0", badges: "vip/1,subscriber/12" })).toMatchObject({ moderator: false, vip: true });
        const none = rightsFromUserState({});
        expect(hasModRights(none, "mylogin", "MyLogin")).toBe(true);
        expect(hasModRights(none, "forsen", "mylogin")).toBe(false);
        expect(hasModRights(rightsFromUserState({ mod: "1" }), "forsen", undefined)).toBe(false);
    });

    test("watching wraps the channel's USERSTATE handler once", () => {
        const handled: string[] = [];
        const channel = { ...fakeChannel(), handleUserState: (msg: { tags: Record<string, string> }) => handled.push(msg.tags.mod) };
        const seen: boolean[] = [];
        const stopA = watchChannelRights(channel as unknown as Channel, (rights) => seen.push(rights.moderator));
        const stopB = watchChannelRights(channel as unknown as Channel, () => undefined);
        channel.handleUserState({ tags: { mod: "1" } });
        stopA();
        stopB();
        expect(handled).toEqual(["1"]);
        expect(seen).toEqual([false, true]);
    });
});
