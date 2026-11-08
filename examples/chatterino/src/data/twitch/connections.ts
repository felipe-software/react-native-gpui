import type { Account, SendResult } from "../api";
import { IrcConnection, type SocketFactory, type Timers } from "../irc/connection";
import type { IrcMessage } from "../irc/message";

export type ConnectionEvents = {
    onReadMessage(message: IrcMessage): void;
    onWriteMessage(message: IrcMessage): void;
    onReadRegistered(): void;
    onReadDisconnected(announcement?: string): void;
};

type PendingSend = { resolve: (result: SendResult) => void; timer: unknown };

const SEND_CONFIRM_TIMEOUT_MS = 3_000;

const ANONYMOUS_NICK = "justinfan64537";

export class TwitchConnections {
    readonly read: IrcConnection;
    readonly write: IrcConnection;
    private account: Account | undefined;
    private readonly anonymous = ANONYMOUS_NICK;
    private readonly pending = new Map<string, PendingSend[]>();

    constructor(
        socketFactory: SocketFactory,
        private readonly timers: Timers,
        events: ConnectionEvents,
        url?: string,
    ) {
        this.read = new IrcConnection({
            url,
            caps: ["twitch.tv/tags", "twitch.tv/commands", "twitch.tv/membership"],
            credentials: () => this.credentials(),
            socketFactory,
            timers,
            onMessage: (message) => events.onReadMessage(message),
            onRegistered: () => events.onReadRegistered(),
            onDisconnected: (announcement) => events.onReadDisconnected(announcement),
        });
        this.write = new IrcConnection({
            url,
            caps: ["twitch.tv/tags", "twitch.tv/commands"],
            credentials: () => this.credentials(),
            socketFactory,
            timers,
            onMessage: (message) => events.onWriteMessage(message),
            onRegistered: () => undefined,
            onDisconnected: () => this.failAllPending("Disconnected from Twitch chat."),
        });
    }

    get nick(): string {
        return this.account?.login ?? this.anonymous;
    }

    get isAnonymous(): boolean {
        return !this.account;
    }

    start(account: Account | undefined): void {
        this.account = account;
        this.read.start();
        if (account) this.write.start();
    }

    switchAccount(account: Account | undefined): void {
        this.account = account;
        this.read.restart();
        this.write.stop();
        this.failAllPending("The account changed.");
        if (account) this.write.start();
    }

    stop(): void {
        this.read.stop();
        this.write.stop();
        this.failAllPending("Disconnected from Twitch chat.");
    }

    sendPrivmsg(channel: string, text: string): Promise<SendResult> {
        if (!this.write.isRegistered) {
            return Promise.resolve({ ok: false, reason: "Not connected to Twitch chat yet. Try again in a moment." });
        }
        const sent = this.write.sendRaw(`PRIVMSG #${channel} :${text}`);
        if (!sent) return Promise.resolve({ ok: false, reason: "Not connected to Twitch chat yet. Try again in a moment." });
        return new Promise((resolve) => {
            const queue = this.pending.get(channel) ?? [];
            const entry: PendingSend = {
                resolve,
                timer: this.timers.setTimeout(() => this.settle(channel, entry, { ok: true }), SEND_CONFIRM_TIMEOUT_MS),
            };
            queue.push(entry);
            this.pending.set(channel, queue);
        });
    }

    confirmSent(channel: string): void {
        const entry = this.pending.get(channel)?.[0];
        if (entry) this.settle(channel, entry, { ok: true });
    }

    rejectSent(channel: string, reason: string): boolean {
        const entry = this.pending.get(channel)?.[0];
        if (!entry) return false;
        this.settle(channel, entry, { ok: false, reason });
        return true;
    }

    private settle(channel: string, entry: PendingSend, result: SendResult): void {
        const queue = this.pending.get(channel);
        if (!queue) return;
        const index = queue.indexOf(entry);
        if (index === -1) return;
        queue.splice(index, 1);
        if (queue.length === 0) this.pending.delete(channel);
        this.timers.clearTimeout(entry.timer);
        entry.resolve(result);
    }

    private failAllPending(reason: string): void {
        for (const [channel, queue] of [...this.pending]) {
            for (const entry of [...queue]) this.settle(channel, entry, { ok: false, reason });
        }
    }

    private credentials() {
        if (!this.account) return { nick: this.anonymous };
        return { nick: this.account.login, pass: `oauth:${this.account.token}` };
    }
}
