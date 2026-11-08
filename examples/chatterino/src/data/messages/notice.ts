import type { IrcMessage } from "../irc/message";
import { messageTime } from "../twitch/tags";
import { formatDuration } from "../util/time";
import type { ChatMessage, Tint } from "./model";
import { makeBannedMessage, makeLoginExpiredMessage, makeSystemMessage, makeUserListMessage } from "./system";

export type NoticeResult = {
    message?: ChatMessage;
    broadcast: boolean;
    sendWaitSeconds?: number;
    loginFailed?: boolean;
};

function wordAt(content: string, index: number): string | undefined {
    return content.split(" ")[index];
}

function waitSeconds(text: string | undefined): number | undefined {
    if (text === undefined) return undefined;
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) ? value : undefined;
}

function userList(channel: string, content: string, msgId: string, colorOf: (login: string) => Tint): ChatMessage {
    const text = msgId === "vips_success" ? content.slice(0, -1) : content;
    const colon = text.indexOf(":");
    const prefix = text.slice(0, colon);
    const users = text
        .slice(colon + 2)
        .split(", ")
        .filter(Boolean)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return makeUserListMessage(channel, prefix, users, colorOf);
}

export function buildNotice(
    irc: IrcMessage,
    selfLogin: string | undefined,
    colorOf: (login: string) => Tint,
    now: number,
): NoticeResult {
    const target = irc.params[0] ?? "";
    const content = irc.params[1] ?? "";
    const channel = target.startsWith("#") ? target.slice(1).toLowerCase() : "";
    const broadcast = !channel || channel === "jtv";
    const msgId = irc.tags["msg-id"] ?? "";
    const time = messageTime(irc.tags, now);

    if (content.toLowerCase().startsWith("login auth")) {
        return { message: makeLoginExpiredMessage(channel, selfLogin ?? ""), broadcast: true, loginFailed: true };
    }
    if (content.startsWith("You are permanently banned ")) {
        return { message: makeBannedMessage(channel, true), broadcast };
    }
    if (msgId === "msg_timedout") {
        const remaining = formatDuration(Number.parseInt(wordAt(content, 5) ?? "0", 10) || 0);
        return {
            message: makeSystemMessage(channel, `You are timed out for ${remaining || "0s"}.`, time),
            broadcast,
            sendWaitSeconds: waitSeconds(wordAt(content, 5)),
        };
    }
    if (broadcast) return { message: makeSystemMessage(channel, content, time), broadcast };
    if (msgId === "usage_delete") {
        const text = "Usage: /delete <msg-id> - Deletes the specified message. Can't take more than one argument.";
        return { message: makeSystemMessage(channel, text, time), broadcast };
    }
    if (msgId === "bad_delete_message_error") {
        const text = "There was a problem deleting the message. It might be from another channel or too old to delete.";
        return { message: makeSystemMessage(channel, text, time), broadcast };
    }
    if (msgId === "host_on" || msgId === "host_target_went_offline") return { broadcast };
    if ((msgId === "room_mods" || msgId === "vips_success") && content.includes(":")) {
        return { message: userList(channel, content, msgId, colorOf), broadcast };
    }
    const result: NoticeResult = { message: makeSystemMessage(channel, content, time), broadcast };
    if (msgId === "msg_slowmode") result.sendWaitSeconds = waitSeconds(wordAt(content, 21));
    return result;
}
