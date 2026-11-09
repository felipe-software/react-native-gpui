import type { ChatListMessage } from "react-native-gpui";
import type { Channel, ChannelEvent, ChannelInfo, Completion, EmoteInfo, SendResult, Settings } from "../api";
import type { ChatMessage } from "../messages/model";
import { renderMessage, type RenderOptions } from "../messages/render";
import { makeSystemMessage } from "../messages/system";
import { MessageBuffer, type BufferTimers } from "./buffer";

export const WHISPERS_CHANNEL = "/whispers";

const WHISPER_USAGE = "Use /w <username> <message> to whisper";

export class WhispersChannel implements Channel {
    readonly name = WHISPERS_CHANNEL;
    readonly buffer: MessageBuffer;
    private readonly state: ChannelInfo = { name: WHISPERS_CHANNEL, connected: true, modes: {} };

    constructor(
        timers: BufferTimers,
        settings: () => Settings,
        renderOptions: () => Omit<RenderOptions, "showChannelName">,
        private readonly sendWhisper: (text: string) => Promise<SendResult>,
        private readonly now: () => number,
    ) {
        this.buffer = new MessageBuffer(
            (message) => renderMessage(message, { ...renderOptions(), showChannelName: false, ignoreHighlights: true }),
            timers,
            () => settings().messageLimit,
        );
    }

    add(message: ChatMessage): void {
        this.buffer.add(message);
    }

    addSystemMessage(text: string): void {
        this.buffer.add(makeSystemMessage(this.name, text, this.now()));
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

    send(text: string): Promise<SendResult> {
        const trimmed = text.trim();
        const isWhisperCommand = /^[/.]w(\s|$)/i.test(trimmed);
        if (isWhisperCommand) return this.sendWhisper(trimmed);
        this.addSystemMessage(WHISPER_USAGE);
        return Promise.resolve({ ok: false, reason: WHISPER_USAGE });
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
