import type { ChatListMessage, ChatListMessagePatch } from "react-native-gpui";
import type { Channel, ChannelEvent, ChannelInfo, Completion, EmoteInfo, ModerationAction, SendResult } from "../api";
import { filterContext } from "../filters/lang/context";
import { runFilter, type CompiledFilter } from "../filters/lang/filter";
import type { ChatMessage } from "../messages/model";
import { moderationElements } from "../twitch/moderation-actions";
import type { MessageBuffer } from "./buffer";

export type BufferedChannel = Channel & { readonly buffer: MessageBuffer };

export type SplitViewDeps = {
    filters: CompiledFilter[] | undefined;
    excludeSelf: () => boolean;
    selfLogin: () => string | undefined;
    moderationMode: boolean;
    moderationActions: () => ModerationAction[];
    systemColor: () => string;
    watching?: () => string | undefined;
};

function isChatMessage(message: ChatMessage): boolean {
    return !message.flags.system && !!message.login && !message.flags.whisper;
}

export class SplitChannelView implements Channel {
    readonly name: string;
    private readonly shown = new Set<string>();

    constructor(
        private readonly source: BufferedChannel,
        private readonly deps: SplitViewDeps,
    ) {
        this.name = source.name;
    }

    get buffer(): MessageBuffer {
        return this.source.buffer;
    }

    info(): ChannelInfo {
        return this.source.info();
    }

    snapshot(): ChatListMessage[] {
        this.shown.clear();
        const out: ChatListMessage[] = [];
        for (const message of this.source.buffer.messages()) {
            if (!this.passes(message)) continue;
            this.shown.add(message.id);
            out.push(this.decorate(message, this.source.buffer.rendered(message)));
        }
        return out;
    }

    subscribe(listener: (event: ChannelEvent) => void): () => void {
        return this.source.subscribe((event) => {
            const mapped = this.map(event);
            if (mapped) listener(mapped);
        });
    }

    send(text: string): Promise<SendResult> {
        return this.source.send(text);
    }

    emotes(): EmoteInfo[] {
        return this.source.emotes();
    }

    complete(word: string, atStartOfMessage: boolean): Completion[] {
        return this.source.complete(word, atStartOfMessage);
    }

    userMessages(login: string): ChatListMessage[] {
        return this.source.userMessages(login);
    }

    search(query: string): ChatListMessage[] {
        const visible = new Set(this.snapshot().map((message) => message.id));
        return this.source.search(query).filter((message) => visible.has(message.id));
    }

    clear(): void {
        this.source.clear();
    }

    private passes(message: ChatMessage): boolean {
        const filters = this.deps.filters;
        if (!filters || filters.length === 0) return true;
        const self = this.deps.selfLogin()?.toLowerCase() ?? "justinfan64537";
        if (this.deps.excludeSelf() && message.login === self) return true;
        const context = filterContext(message, { live: !!this.source.info().live?.live, watching: this.deps.watching?.() });
        return filters.every((filter) => runFilter(filter, context));
    }

    private showsModerationButtons(message: ChatMessage): boolean {
        if (!this.deps.moderationMode || !isChatMessage(message)) return false;
        const badges = message.badges ?? [];
        if (badges.includes("broadcaster")) return false;
        const selfIsBroadcaster = this.deps.selfLogin()?.toLowerCase() === this.name.toLowerCase();
        const isModerator = badges.includes("moderator") || badges.includes("lead_moderator");
        return !isModerator || selfIsBroadcaster;
    }

    private decorate(message: ChatMessage, rendered: ChatListMessage): ChatListMessage {
        if (!this.showsModerationButtons(message)) return rendered;
        const actions = this.deps.moderationActions();
        if (actions.length === 0) return rendered;
        return { ...rendered, elements: [...moderationElements(actions, message.id, this.deps.systemColor()), ...rendered.elements] };
    }

    private messagesFor(rendered: ChatListMessage[]): ChatListMessage[] {
        const out: ChatListMessage[] = [];
        for (const entry of rendered) {
            const message = this.source.buffer.findById(entry.id);
            if (!message || !this.passes(message)) continue;
            this.shown.add(entry.id);
            out.push(this.decorate(message, entry));
        }
        return out;
    }

    private patchesFor(patches: ChatListMessagePatch[]): ChatListMessagePatch[] {
        const out: ChatListMessagePatch[] = [];
        for (const patch of patches) {
            if (!this.shown.has(patch.id)) continue;
            const message = this.source.buffer.findById(patch.id);
            const hasElements = !!patch.elements && !!message;
            if (!hasElements) {
                out.push(patch);
                continue;
            }
            const decorated = this.decorate(message as ChatMessage, { id: patch.id, elements: patch.elements ?? [] });
            out.push({ ...patch, elements: decorated.elements });
        }
        return out;
    }

    private map(event: ChannelEvent): ChannelEvent | undefined {
        switch (event.type) {
            case "append": {
                const messages = this.messagesFor(event.messages);
                return messages.length > 0 ? { type: "append", messages } : undefined;
            }
            case "prepend": {
                const messages = this.messagesFor(event.messages);
                return messages.length > 0 ? { type: "prepend", messages } : undefined;
            }
            case "update": {
                const patches = this.patchesFor(event.patches);
                return patches.length > 0 ? { type: "update", patches } : undefined;
            }
            case "clear":
                this.shown.clear();
                return event;
            default:
                return event;
        }
    }
}
