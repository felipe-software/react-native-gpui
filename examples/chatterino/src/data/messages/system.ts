import { formatDuration } from "../util/time";
import { createMessage, PieceBuilder } from "./builder";
import type { ChatMessage, Tint } from "./model";

export const LINK_RECONNECT = "chatterino://reconnect";
export const LINK_ACCOUNTS = "chatterino://accounts";

export function messageLink(id: string): string {
    return `chatterino://message/${encodeURIComponent(id)}`;
}

const SYSTEM_FLAGS = { system: true, doNotNotify: true } as const;

export function makeSystemMessage(channel: string, text: string, time: number = Date.now()): ChatMessage {
    const builder = new PieceBuilder();
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (builder.link(word)) continue;
        builder.appendText(word, "system");
    }
    return createMessage({ channel, time, pieces: builder.pieces, flags: { ...SYSTEM_FLAGS }, text });
}

export function makeSystemMessageWithUser(
    channel: string,
    text: string,
    login: string,
    displayName: string,
    userColor: Tint,
    time: number,
): ChatMessage {
    const builder = new PieceBuilder();
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (word === displayName) {
            builder.user(displayName, login, userColor, true);
            continue;
        }
        builder.appendText(word, "system");
    }
    return createMessage({ channel, time, pieces: builder.pieces, flags: { ...SYSTEM_FLAGS }, text });
}

export type SubgiftParties = {
    gifterLogin: string;
    gifterDisplayName: string;
    gifterColor: Tint;
    recipientLogin: string;
    recipientDisplayName: string;
    recipientColor: Tint;
};

export function makeSubgiftMessage(channel: string, text: string, parties: SubgiftParties, time: number): ChatMessage {
    const builder = new PieceBuilder();
    const recipientWithBang = `${parties.recipientDisplayName}!`;
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (word === parties.gifterDisplayName) {
            builder.user(parties.gifterDisplayName, parties.gifterLogin, parties.gifterColor, true);
            continue;
        }
        if (word === recipientWithBang) {
            builder.user(parties.recipientDisplayName, parties.recipientLogin, parties.recipientColor, true);
            builder.noSpaceAfterLast();
            builder.text("!", "system");
            continue;
        }
        builder.appendText(word, "system");
    }
    return createMessage({ channel, time, pieces: builder.pieces, flags: { ...SYSTEM_FLAGS }, text });
}

export function timeoutText(durationSeconds: number | undefined): string {
    if (durationSeconds === undefined) return "has been permanently banned.";
    return `has been timed out for ${formatDuration(durationSeconds)}.`;
}

export function makeTimeoutMessage(
    channel: string,
    username: string,
    durationSeconds: number | undefined,
    time: number,
    count = 1,
): ChatMessage {
    const builder = new PieceBuilder();
    builder.user(username, username, "system");
    const base = timeoutText(durationSeconds);
    const body = count > 1 ? `${base} (${count} times)` : base;
    builder.text(body, "system");
    const message = createMessage({
        channel,
        time,
        pieces: builder.pieces,
        flags: { system: true, timeout: true, moderation: true, doNotNotify: true },
        text: `${username} ${body}`,
    });
    message.timeoutUser = username;
    message.count = count;
    return message;
}

export function makeClearChatMessage(channel: string, time: number, count = 1): ChatMessage {
    const builder = new PieceBuilder();
    builder.text("Chat has been cleared by a moderator.", "system");
    let text = "Chat has been cleared by a moderator.";
    if (count > 1) {
        builder.appendText(`(${count} times)`, "system");
        text += ` (${count} times)`;
    }
    const message = createMessage({
        channel,
        time,
        pieces: builder.pieces,
        flags: { system: true, clearChat: true, moderation: true, doNotNotify: true },
        text,
    });
    message.count = count;
    return message;
}

const DELETED_MESSAGE_LENGTH_LIMIT = 50;

function truncateDeleted(text: string): string {
    const chars = Array.from(text);
    if (chars.length <= DELETED_MESSAGE_LENGTH_LIMIT) return text;
    return `${chars.slice(0, DELETED_MESSAGE_LENGTH_LIMIT).join("")}…`;
}

export function makeDeletionMessage(channel: string, original: ChatMessage, time: number): ChatMessage {
    const deletedText = truncateDeleted(original.text);
    const builder = new PieceBuilder();
    builder.text("A message from", "system");
    builder.user(original.displayName || original.login, original.login, "system", true);
    builder.text("was deleted:", "system");
    builder.text(deletedText, "text", { link: messageLink(original.id) });
    const message = createMessage({
        channel,
        time,
        pieces: builder.pieces,
        flags: { system: true, moderation: true, doNotNotify: true },
        text: `A message from ${original.login} was deleted: ${deletedText}`,
    });
    message.timeoutUser = `msg:${original.id}`;
    return message;
}

export function makeBannedMessage(channel: string, confirmedBan: boolean): ChatMessage {
    const bannedText = confirmedBan
        ? "You were banned from this channel!"
        : "Your connection to this channel was unexpectedly dropped.";
    const promptText = confirmedBan ? "If you believe you have been unbanned, try reconnecting." : "Try reconnecting.";
    const builder = new PieceBuilder();
    builder.text(bannedText, "system");
    builder.text(promptText, "link", { link: LINK_RECONNECT });
    return createMessage({
        channel,
        time: Date.now(),
        pieces: builder.pieces,
        flags: { system: true },
        text: `${bannedText} ${promptText}`,
    });
}

export function makeLoginExpiredMessage(channel: string, login: string): ChatMessage {
    const expirationText = `Login expired for user "${login}"!`;
    const promptText = "Try adding your account again.";
    const builder = new PieceBuilder();
    builder.text(expirationText, "system");
    builder.text(promptText, "link", { link: LINK_ACCOUNTS });
    return createMessage({
        channel,
        time: Date.now(),
        pieces: builder.pieces,
        flags: { system: true, doNotNotify: true },
        text: `${expirationText} ${promptText}`,
    });
}

export function makeLiveMessage(channel: string, displayName: string, time: number = Date.now()): ChatMessage {
    const builder = new PieceBuilder();
    builder.user(displayName, channel, "text", true);
    builder.text("is live!", "text");
    return createMessage({
        channel,
        time,
        pieces: builder.pieces,
        flags: { system: true, doNotNotify: true },
        text: `${displayName} is live!`,
    });
}

export function makeOfflineMessage(channel: string, displayName: string, time: number = Date.now()): ChatMessage {
    const builder = new PieceBuilder();
    builder.user(displayName, channel, "system", true);
    builder.text("is now offline.", "system");
    return createMessage({
        channel,
        time,
        pieces: builder.pieces,
        flags: { system: true, doNotNotify: true },
        text: `${displayName} is now offline.`,
    });
}

export function makeUserListMessage(
    channel: string,
    prefix: string,
    users: string[],
    colorOf: (login: string) => Tint,
): ChatMessage {
    const builder = new PieceBuilder();
    builder.text(prefix, "system");
    users.forEach((user, index) => {
        if (index > 0) builder.text(",", "system");
        builder.user(user, user.toLowerCase(), colorOf(user.toLowerCase()), true);
        builder.noSpaceAfterLast();
    });
    return createMessage({
        channel,
        time: Date.now(),
        pieces: builder.pieces,
        flags: { system: true, doNotNotify: true },
        text: `${prefix} ${users.join(", ")}`,
    });
}
