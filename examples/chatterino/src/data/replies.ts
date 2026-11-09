import type { Account, AccountsState, Channel, SendResult, Store } from "./api";
import { defaultSocketFactory, defaultTimers } from "./core/runtime";
import { emojiByShortCode } from "./emotes/emoji";
import { IrcConnection, type SocketFactory, type Timers } from "./irc/connection";
import type { IrcMessage } from "./irc/message";

export type ReplySenderOptions = {
    socketFactory?: SocketFactory;
    timers?: Timers;
    url?: string;
    registerTimeoutMs?: number;
};

export type ReplySender = {
    send(channel: Channel, parentId: string, text: string): Promise<SendResult>;
    dispose(): void;
};

const REGISTER_TIMEOUT_MS = 8_000;
const MESSAGE_ID = /^[A-Za-z0-9-]+$/;
const NOT_CONNECTED = "Not connected to Twitch chat yet. Try again in a moment.";

type SystemMessageHost = { addSystemMessage?: (text: string) => void };

export function replyLine(channel: string, parentId: string, text: string): string {
    return `@reply-parent-msg-id=${parentId} PRIVMSG #${channel} :${text}`;
}

export function prepareReplyText(text: string): string {
    const withEmoji = text.replace(/:([a-z0-9_+-]+):/gi, (match, code: string) => emojiByShortCode(code.toLowerCase())?.name ?? match);
    return withEmoji.replace(/\s+/g, " ").trim();
}

function isCommand(text: string): boolean {
    return text.startsWith("/") || text.startsWith(".");
}

function currentAccount(state: AccountsState): Account | undefined {
    return state.accounts.find((account) => account.login === state.current);
}

export function createReplySender(accounts: Store<AccountsState>, options: ReplySenderOptions = {}): ReplySender {
    const timers = options.timers ?? defaultTimers();
    const socketFactory = options.socketFactory ?? defaultSocketFactory();
    const registerTimeout = options.registerTimeoutMs ?? REGISTER_TIMEOUT_MS;
    const channels = new Map<string, Channel>();
    let connection: IrcConnection | undefined;
    let login: string | undefined;
    let waiters: Array<() => void> = [];

    const wake = () => {
        const pending = waiters;
        waiters = [];
        for (const waiter of pending) waiter();
    };

    const handleMessage = (message: IrcMessage) => {
        if (message.command !== "NOTICE") return;
        const target = (message.params[0] ?? "").replace(/^#/, "");
        const text = message.params[1];
        const channel = channels.get(target) as (Channel & SystemMessageHost) | undefined;
        if (text && channel?.addSystemMessage) channel.addSystemMessage(text);
    };

    const stop = () => {
        connection?.stop();
        connection = undefined;
        login = undefined;
        wake();
    };

    const ensure = (): IrcConnection | undefined => {
        const account = currentAccount(accounts.get());
        if (!account) {
            stop();
            return undefined;
        }
        if (connection && login === account.login) return connection;
        stop();
        login = account.login;
        const next = new IrcConnection({
            url: options.url,
            caps: ["twitch.tv/tags", "twitch.tv/commands"],
            credentials: () => ({ nick: account.login, pass: `oauth:${account.token}` }),
            socketFactory,
            timers,
            onMessage: handleMessage,
            onRegistered: wake,
            onDisconnected: () => undefined,
        });
        connection = next;
        next.start();
        return next;
    };

    const registered = (target: IrcConnection): Promise<boolean> => {
        if (target.isRegistered) return Promise.resolve(true);
        return new Promise((resolve) => {
            const timer = timers.setTimeout(() => {
                waiters = waiters.filter((waiter) => waiter !== done);
                resolve(target.isRegistered);
            }, registerTimeout);
            const done = () => {
                timers.clearTimeout(timer);
                resolve(target.isRegistered);
            };
            waiters.push(done);
        });
    };

    const unsubscribe = accounts.subscribe((state) => {
        if (connection && currentAccount(state)?.login !== login) stop();
    });

    return {
        async send(channel, parentId, text) {
            const prepared = prepareReplyText(text);
            if (!prepared) return { ok: false, reason: "The message is empty." };
            const target = ensure();
            const canReply = !!target && MESSAGE_ID.test(parentId) && !isCommand(prepared);
            if (!target || !canReply) return channel.send(prepared);
            channels.set(channel.name, channel);
            const ready = await registered(target);
            if (!ready || connection !== target) return { ok: false, reason: NOT_CONNECTED };
            const sent = target.sendRaw(replyLine(channel.name, parentId, prepared));
            return sent ? { ok: true } : { ok: false, reason: NOT_CONNECTED };
        },
        dispose() {
            unsubscribe();
            stop();
            channels.clear();
        },
    };
}
