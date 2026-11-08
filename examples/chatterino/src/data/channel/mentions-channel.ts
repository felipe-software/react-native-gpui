import type { ChatListMessage } from "react-native-gpui";
import type { Channel, ChannelEvent, ChannelInfo, Completion, EmoteInfo, SendResult, Settings } from "../api";
import type { ChatMessage } from "../messages/model";
import { renderMessage, type RenderOptions } from "../messages/render";
import { MessageBuffer, type BufferTimers } from "./buffer";

export const MENTIONS_CHANNEL = "/mentions";

export class MentionsChannel implements Channel {
    readonly name = MENTIONS_CHANNEL;
    readonly buffer: MessageBuffer;
    private readonly state: ChannelInfo = { name: MENTIONS_CHANNEL, connected: true, modes: {} };

    constructor(timers: BufferTimers, settings: () => Settings, renderOptions: () => Omit<RenderOptions, "showChannelName">) {
        this.buffer = new MessageBuffer(
            (message) => renderMessage(message, { ...renderOptions(), showChannelName: true }),
            timers,
            () => settings().messageLimit,
        );
    }

    add(message: ChatMessage): void {
        this.buffer.add(message);
    }

    fillIn(messages: ChatMessage[]): void {
        const fresh = messages.filter((message) => !this.buffer.has(message.id));
        if (fresh.length === 0) return;
        const first = this.buffer.messages()[0];
        const older = first ? fresh.filter((message) => message.time <= first.time) : fresh;
        const newer = first ? fresh.filter((message) => message.time > first.time) : [];
        if (older.length > 0) this.buffer.prepend(older);
        for (const message of newer) this.buffer.add(message);
    }

    changed(message: ChatMessage): void {
        const current = this.buffer.findById(message.id);
        if (!current) return;
        if (current !== message) {
            this.buffer.replace(current, message);
            return;
        }
        this.buffer.changed(message);
    }

    info(): ChannelInfo {
        return this.state;
    }

    snapshot(): ChatListMessage[] {
        return this.buffer.snapshot();
    }

    subscribe(listener: (event: ChannelEvent) => void): () => void {
        return this.buffer.subscribe(listener);
    }

    send(): Promise<SendResult> {
        return Promise.resolve({ ok: false, reason: "You cannot send messages in the mentions channel." });
    }

    emotes(): EmoteInfo[] {
        return [];
    }

    complete(): Completion[] {
        return [];
    }

    userMessages(login: string): ChatListMessage[] {
        const lower = login.toLowerCase();
        return this.buffer
            .messages()
            .filter((message) => message.login === lower)
            .map((message) => this.buffer.rendered(message));
    }

    search(query: string): ChatListMessage[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        return this.buffer
            .messages()
            .filter((message) => message.searchText.toLowerCase().includes(needle))
            .map((message) => this.buffer.rendered(message));
    }

    clear(): void {
        this.buffer.clear();
    }

    dispose(): void {
        this.buffer.dispose();
    }
}
