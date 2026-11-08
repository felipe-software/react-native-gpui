import type { ChatListMessage, ChatListMessagePatch } from "react-native-gpui";
import type { ChannelEvent, ChannelInfo } from "../api";
import type { ChatMessage } from "../messages/model";
import type { MessageSink } from "../messages/sink";

export type Renderer = (message: ChatMessage) => ChatListMessage;

type DirtyKind = "full" | "disabled";

type Pending = {
    clear: boolean;
    prepend: ChatMessage[];
    append: ChatMessage[];
    dirty: Map<string, DirtyKind>;
    info: ChannelInfo | undefined;
};

export type BufferTimers = {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
};

export const BATCH_INTERVAL_MS = 100;

function emptyPending(): Pending {
    return { clear: false, prepend: [], append: [], dirty: new Map(), info: undefined };
}

export class MessageBuffer implements MessageSink {
    private list: ChatMessage[] = [];
    private readonly byId = new Map<string, ChatMessage>();
    private readonly renderCache = new Map<string, ChatListMessage>();
    private readonly listeners = new Set<(event: ChannelEvent) => void>();
    private pending: Pending = emptyPending();
    private flushTimer: unknown;
    private disposed = false;

    constructor(
        private readonly render: Renderer,
        private readonly timers: BufferTimers,
        private limit: () => number,
        private readonly onChanged?: (message: ChatMessage) => void,
    ) {}

    messages(): readonly ChatMessage[] {
        return this.list;
    }

    size(): number {
        return this.list.length;
    }

    last(): ChatMessage | undefined {
        return this.list[this.list.length - 1];
    }

    findById(id: string): ChatMessage | undefined {
        return this.byId.get(id);
    }

    has(id: string): boolean {
        return this.byId.has(id);
    }

    subscribe(listener: (event: ChannelEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    rendered(message: ChatMessage): ChatListMessage {
        const cached = this.renderCache.get(message.id);
        if (cached) return cached;
        const rendered = this.render(message);
        this.renderCache.set(message.id, rendered);
        return rendered;
    }

    snapshot(): ChatListMessage[] {
        return this.list.map((message) => this.rendered(message));
    }

    add(message: ChatMessage): void {
        if (this.byId.has(message.id)) return;
        this.list.push(message);
        this.byId.set(message.id, message);
        this.pending.append.push(message);
        this.trim();
        this.schedule();
    }

    prepend(messages: ChatMessage[]): ChatMessage[] {
        const fresh = messages.filter((message) => !this.byId.has(message.id));
        const room = Math.max(0, this.limit() - this.list.length);
        const accepted = fresh.slice(Math.max(0, fresh.length - room));
        if (accepted.length === 0) return [];
        for (const message of accepted) this.byId.set(message.id, message);
        this.list = [...accepted, ...this.list];
        this.pending.prepend = [...accepted, ...this.pending.prepend];
        this.schedule();
        return accepted;
    }

    replace(previous: ChatMessage, replacement: ChatMessage): void {
        const index = this.list.indexOf(previous);
        if (index === -1) return;
        replacement.id = previous.id;
        this.list[index] = replacement;
        this.byId.set(replacement.id, replacement);
        this.renderCache.delete(replacement.id);
        const pendingIndex = this.pending.append.indexOf(previous);
        if (pendingIndex !== -1) this.pending.append[pendingIndex] = replacement;
        else this.pending.dirty.set(replacement.id, "full");
        this.schedule();
        this.onChanged?.(replacement);
    }

    changed(message: ChatMessage, kind: DirtyKind = "disabled"): void {
        if (this.byId.get(message.id) !== message) return;
        this.renderCache.delete(message.id);
        const current = this.pending.dirty.get(message.id);
        if (current !== "full") this.pending.dirty.set(message.id, kind);
        this.schedule();
        this.onChanged?.(message);
    }

    invalidateAll(): void {
        this.renderCache.clear();
        for (const message of this.list) this.pending.dirty.set(message.id, "full");
        this.schedule();
    }

    clear(): void {
        this.list = [];
        this.byId.clear();
        this.renderCache.clear();
        this.pending = { ...emptyPending(), clear: true, info: this.pending.info };
        this.schedule();
    }

    setInfo(info: ChannelInfo): void {
        this.pending.info = info;
        this.schedule();
    }

    setLimit(limit: () => number): void {
        this.limit = limit;
        this.trim();
    }

    flushNow(): void {
        if (this.flushTimer !== undefined) {
            this.timers.clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        this.flush();
    }

    dispose(): void {
        this.disposed = true;
        if (this.flushTimer !== undefined) this.timers.clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
        this.listeners.clear();
    }

    private trim(): void {
        const limit = Math.max(1, this.limit());
        if (this.list.length <= limit) return;
        const removed = this.list.splice(0, this.list.length - limit);
        for (const message of removed) {
            this.byId.delete(message.id);
            this.renderCache.delete(message.id);
            this.pending.dirty.delete(message.id);
        }
    }

    private schedule(): void {
        if (this.disposed || this.flushTimer !== undefined) return;
        this.flushTimer = this.timers.setTimeout(() => {
            this.flushTimer = undefined;
            this.flush();
        }, BATCH_INTERVAL_MS);
    }

    private isCurrent(message: ChatMessage): boolean {
        return this.byId.get(message.id) === message;
    }

    private patchFor(id: string, kind: DirtyKind): ChatListMessagePatch | undefined {
        const message = this.byId.get(id);
        if (!message) return undefined;
        const rendered = this.rendered(message);
        if (kind === "disabled") return { id, disabled: !!rendered.disabled, hidden: !!rendered.hidden };
        return { ...rendered, disabled: !!rendered.disabled, historical: !!rendered.historical, hidden: !!rendered.hidden };
    }

    private flush(): void {
        const pending = this.pending;
        this.pending = emptyPending();
        const events: ChannelEvent[] = [];
        if (pending.clear) events.push({ type: "clear" });
        const prepend = pending.prepend.filter((message) => this.isCurrent(message));
        const append = pending.append.filter((message) => this.isCurrent(message));
        if (prepend.length > 0) events.push({ type: "prepend", messages: prepend.map((m) => this.rendered(m)) });
        if (append.length > 0) events.push({ type: "append", messages: append.map((m) => this.rendered(m)) });
        const fresh = new Set([...prepend, ...append].map((message) => message.id));
        const patches: ChatListMessagePatch[] = [];
        for (const [id, kind] of pending.dirty) {
            if (fresh.has(id)) continue;
            const patch = this.patchFor(id, kind);
            if (patch) patches.push(patch);
        }
        if (patches.length > 0) events.push({ type: "update", patches });
        if (pending.info) events.push({ type: "info", info: pending.info });
        if (events.length === 0) return;
        for (const event of events) {
            for (const listener of [...this.listeners]) {
                try {
                    listener(event);
                } catch (error) {
                    console.error("channel listener failed", error);
                }
            }
        }
    }
}
