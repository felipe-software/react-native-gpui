import type { ChatMessage } from "./model";

export type MessageSink = {
    messages(): readonly ChatMessage[];
    add(message: ChatMessage): void;
    replace(previous: ChatMessage, replacement: ChatMessage): void;
    findById(id: string): ChatMessage | undefined;
    changed(message: ChatMessage): void;
};

export class ArraySink implements MessageSink {
    readonly list: ChatMessage[] = [];
    private readonly byId = new Map<string, ChatMessage>();

    messages(): readonly ChatMessage[] {
        return this.list;
    }

    add(message: ChatMessage): void {
        this.list.push(message);
        this.byId.set(message.id, message);
    }

    replace(previous: ChatMessage, replacement: ChatMessage): void {
        const index = this.list.indexOf(previous);
        if (index === -1) return;
        this.byId.delete(previous.id);
        replacement.id = previous.id;
        this.list[index] = replacement;
        this.byId.set(replacement.id, replacement);
    }

    findById(id: string): ChatMessage | undefined {
        return this.byId.get(id);
    }

    changed(): void {}
}
