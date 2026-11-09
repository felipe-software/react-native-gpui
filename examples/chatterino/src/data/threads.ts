import type { ChatListElement, ChatListMessage } from "react-native-gpui";
import type { Channel } from "./api";
import { parseInternalLink } from "./links/internal";

function threadOfElement(element: ChatListElement): string | undefined {
    if (element.kind !== "text" || !element.link) return undefined;
    const link = parseInternalLink(element.link);
    return link?.type === "thread" ? link.rootId : undefined;
}

export function threadRootId(message: ChatListMessage): string | undefined {
    for (const element of message.reply ?? []) {
        const rootId = threadOfElement(element);
        if (rootId) return rootId;
    }
    return undefined;
}

export function belongsToThread(message: ChatListMessage, rootId: string): boolean {
    return message.id === rootId || threadRootId(message) === rootId;
}

export function withoutReplyContext(message: ChatListMessage): ChatListMessage {
    if (!message.reply) return message;
    const { reply: _reply, ...rest } = message;
    return rest;
}

export function threadMessages(messages: readonly ChatListMessage[], rootId: string): ChatListMessage[] {
    return messages.filter((message) => belongsToThread(message, rootId)).map(withoutReplyContext);
}

export function hasThread(messages: readonly ChatListMessage[], rootId: string): boolean {
    return messages.some((message) => message.id !== rootId && threadRootId(message) === rootId);
}

export type ThreadFeed = {
    messages(): ChatListMessage[];
    subscribe(append: (messages: ChatListMessage[]) => void): () => void;
};

export function threadFeed(channel: Channel, rootId: string): ThreadFeed {
    return {
        messages: () => threadMessages(channel.snapshot(), rootId),
        subscribe(append) {
            return channel.subscribe((event) => {
                if (event.type !== "append") return;
                const fresh = threadMessages(event.messages, rootId);
                if (fresh.length > 0) append(fresh);
            });
        },
    };
}
