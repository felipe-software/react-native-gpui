import { parseIrcLine, splitIrcPayload, type IrcMessage } from "./message";

export const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

export type IrcCredentials = { nick: string; pass?: string };

export type SocketLike = {
    readyState: number;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    send(data: string): void;
    close(): void;
};

export type SocketFactory = (url: string) => SocketLike;

export type Timers = {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    now(): number;
};

export type IrcConnectionOptions = {
    url?: string;
    caps: string[];
    credentials: () => IrcCredentials;
    socketFactory: SocketFactory;
    timers: Timers;
    onMessage: (message: IrcMessage) => void;
    onRegistered: () => void;
    onDisconnected: (announcement?: string) => void;
    pingIntervalMs?: number;
    pongTimeoutMs?: number;
};

const OPEN = 1;
const MAX_BACKOFF_MS = 60_000;
const JOIN_WINDOW_MS = 12_500;
const JOINS_PER_WINDOW = 18;

export class IrcConnection {
    private socket: SocketLike | undefined;
    private registered = false;
    private stopped = true;
    private attempt = 0;
    private reconnectTimer: unknown;
    private pingTimer: unknown;
    private pongTimer: unknown;
    private joinTimer: unknown;
    private readonly joined = new Set<string>();
    private readonly joinQueue: string[] = [];
    private readonly joinTimes: number[] = [];

    constructor(private readonly options: IrcConnectionOptions) {}

    get isRegistered(): boolean {
        return this.registered;
    }

    get isActive(): boolean {
        return !this.stopped;
    }

    start(): void {
        if (!this.stopped) return;
        this.stopped = false;
        this.attempt = 0;
        this.open();
    }

    stop(): void {
        this.stopped = true;
        this.clearTimers();
        this.closeSocket();
        this.registered = false;
        this.joinQueue.length = 0;
    }

    restart(): void {
        this.stop();
        this.start();
    }

    join(channel: string): void {
        this.joined.add(channel);
        if (this.registered) this.enqueueJoin(channel);
    }

    part(channel: string): void {
        this.joined.delete(channel);
        const queued = this.joinQueue.indexOf(channel);
        if (queued !== -1) {
            this.joinQueue.splice(queued, 1);
            return;
        }
        if (this.registered) this.sendRaw(`PART #${channel}`);
    }

    channels(): string[] {
        return [...this.joined];
    }

    sendRaw(line: string): boolean {
        const socket = this.socket;
        if (!socket || socket.readyState !== OPEN) return false;
        socket.send(line);
        return true;
    }

    private open(): void {
        const { socketFactory, url } = this.options;
        let socket: SocketLike;
        try {
            socket = socketFactory(url ?? TWITCH_IRC_URL);
        } catch {
            this.handleClose();
            return;
        }
        this.socket = socket;
        socket.onopen = () => this.handleOpen(socket);
        socket.onmessage = (event) => this.handleData(socket, event.data);
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.handleClose();
        };
        socket.onerror = () => undefined;
    }

    private handleOpen(socket: SocketLike): void {
        if (this.socket !== socket) return;
        const credentials = this.options.credentials();
        socket.send(`CAP REQ :${this.options.caps.join(" ")}`);
        if (credentials.pass) socket.send(`PASS ${credentials.pass}`);
        socket.send(`NICK ${credentials.nick}`);
        this.touch();
    }

    private handleData(socket: SocketLike, data: unknown): void {
        if (this.socket !== socket || typeof data !== "string") return;
        this.touch();
        for (const line of splitIrcPayload(data)) {
            const message = parseIrcLine(line);
            if (message) this.handleMessage(message);
        }
    }

    private handleMessage(message: IrcMessage): void {
        switch (message.command) {
            case "PING":
                this.sendRaw(`PONG :${message.params[0] ?? "tmi.twitch.tv"}`);
                return;
            case "PONG":
                return;
            case "001":
                this.handleRegistered();
                break;
            case "RECONNECT":
                this.forceReconnect("Twitch Servers requested us to reconnect, reconnecting");
                return;
        }
        this.options.onMessage(message);
    }

    private handleRegistered(): void {
        this.registered = true;
        this.attempt = 0;
        this.joinQueue.length = 0;
        for (const channel of this.joined) this.enqueueJoin(channel);
        this.options.onRegistered();
    }

    private enqueueJoin(channel: string): void {
        if (!this.joinQueue.includes(channel)) this.joinQueue.push(channel);
        this.pumpJoins();
    }

    private pumpJoins(): void {
        const { timers } = this.options;
        if (this.joinTimer !== undefined) return;
        const now = timers.now();
        while (this.joinTimes.length > 0 && now - this.joinTimes[0] >= JOIN_WINDOW_MS) this.joinTimes.shift();
        while (this.joinQueue.length > 0 && this.joinTimes.length < JOINS_PER_WINDOW) {
            const channel = this.joinQueue.shift() as string;
            if (!this.joined.has(channel)) continue;
            this.sendRaw(`JOIN #${channel}`);
            this.joinTimes.push(now);
        }
        if (this.joinQueue.length === 0) return;
        const wait = JOIN_WINDOW_MS - (now - this.joinTimes[0]);
        this.joinTimer = timers.setTimeout(() => {
            this.joinTimer = undefined;
            this.pumpJoins();
        }, Math.max(50, wait));
    }

    private touch(): void {
        const { timers } = this.options;
        if (this.pongTimer !== undefined) {
            timers.clearTimeout(this.pongTimer);
            this.pongTimer = undefined;
        }
        if (this.pingTimer !== undefined) timers.clearTimeout(this.pingTimer);
        this.pingTimer = timers.setTimeout(() => this.sendKeepalive(), this.options.pingIntervalMs ?? 60_000);
    }

    private sendKeepalive(): void {
        const { timers } = this.options;
        this.pingTimer = undefined;
        if (!this.sendRaw("PING :keepalive")) return;
        this.pongTimer = timers.setTimeout(() => {
            this.pongTimer = undefined;
            this.forceReconnect("Server connection timed out, reconnecting");
        }, this.options.pongTimeoutMs ?? 10_000);
    }

    private forceReconnect(announcement: string): void {
        const socket = this.socket;
        this.socket = undefined;
        if (socket) {
            socket.onclose = null;
            socket.onmessage = null;
            try {
                socket.close();
            } catch {}
        }
        this.attempt = 0;
        this.handleClose(announcement, 0);
    }

    private handleClose(announcement?: string, delayOverride?: number): void {
        const wasRegistered = this.registered;
        this.registered = false;
        this.socket = undefined;
        this.clearTimers();
        if (wasRegistered) this.options.onDisconnected(announcement);
        if (this.stopped) return;
        const delay = delayOverride ?? Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
        this.attempt++;
        this.reconnectTimer = this.options.timers.setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.stopped) this.open();
        }, delay);
    }

    private closeSocket(): void {
        const socket = this.socket;
        this.socket = undefined;
        if (!socket) return;
        socket.onclose = null;
        socket.onmessage = null;
        socket.onopen = null;
        try {
            socket.close();
        } catch {}
    }

    private clearTimers(): void {
        const { timers } = this.options;
        for (const handle of [this.reconnectTimer, this.pingTimer, this.pongTimer, this.joinTimer]) {
            if (handle !== undefined) timers.clearTimeout(handle);
        }
        this.reconnectTimer = undefined;
        this.pingTimer = undefined;
        this.pongTimer = undefined;
        this.joinTimer = undefined;
        this.joinTimes.length = 0;
    }
}
