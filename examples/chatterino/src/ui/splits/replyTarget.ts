import type { ChatListElement, ChatListMessage, ChatListUserElement } from "react-native-gpui";
import type { Channel } from "../../data/api";
import { threadRootId } from "../../data/threads";

export type ReplyTarget = {
    messageId: string;
    login: string;
    displayName: string;
    text: string;
    threadRootId?: string;
};

type StoredMessage = { displayName?: string; login?: string; text?: string; time?: number; flags?: Record<string, boolean | undefined> };
type MessageLookup = { findMessage?: (id: string) => StoredMessage | undefined };

const TWITCH_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_REPLYABLE_FLAGS = ["system", "subscription", "timeout", "moderation"];

export function authorOf(message: ChatListMessage): ChatListUserElement | undefined {
    for (const element of message.elements) {
        if (element.kind === "badge") continue;
        if (element.kind === "user") return element;
        return undefined;
    }
    return undefined;
}

export function displayNameFromLabel(label: string): string {
    const name = label.replace(/:$/, "");
    const localized = /^[^()]+\((.+)\)$/.exec(name);
    return localized ? localized[1] : name;
}

export function linkNameOf(author: ChatListUserElement): string {
    const name = author.text.replace(/:$/, "");
    return name.toLowerCase() === author.login.toLowerCase() ? name : author.login;
}

function elementText(element: ChatListElement): string {
    if (element.kind === "emote") return element.name;
    if (element.kind === "badge") return "";
    return element.text;
}

export function bodyText(message: ChatListMessage): string {
    const author = authorOf(message);
    const start = author ? message.elements.indexOf(author) + 1 : 0;
    return message.elements
        .slice(start)
        .map(elementText)
        .filter(Boolean)
        .join(" ");
}

function lookup(channel: Channel | undefined, id: string): StoredMessage | undefined {
    return (channel as (Channel & MessageLookup) | undefined)?.findMessage?.(id);
}

export function canReplyTo(message: ChatListMessage): boolean {
    return TWITCH_MESSAGE_ID.test(message.id) && !!authorOf(message);
}

export function isReplyable(channel: Channel | undefined, message: ChatListMessage, now = Date.now()): boolean {
    if (!canReplyTo(message)) return false;
    const stored = lookup(channel, message.id);
    if (!stored) return true;
    const blocked = NOT_REPLYABLE_FLAGS.some((flag) => !!stored.flags?.[flag]);
    const tooOld = typeof stored.time === "number" && now - stored.time > DAY_MS;
    return !blocked && !tooOld;
}

export function replyTargetFor(channel: Channel | undefined, message: ChatListMessage): ReplyTarget | undefined {
    const author = authorOf(message);
    if (!author || !canReplyTo(message)) return undefined;
    const stored = lookup(channel, message.id);
    const target: ReplyTarget = {
        messageId: message.id,
        login: author.login,
        displayName: stored?.displayName || linkNameOf(author),
        text: stored?.text ?? bodyText(message),
    };
    const rootId = threadRootId(message);
    if (rootId) target.threadRootId = rootId;
    return target;
}
