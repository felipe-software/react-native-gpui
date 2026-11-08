import type { IrcMessage } from "../irc/message";
import { messageTime } from "../twitch/tags";
import type { ChatMessage } from "./model";
import type { MessageSink } from "./sink";
import { makeClearChatMessage, makeDeletionMessage, makeTimeoutMessage } from "./system";

const STACK_WINDOW_MESSAGES = 20;
const STACK_WINDOW_MS = 5_000;

function disableUser(sink: MessageSink, login: string): void {
    for (const message of sink.messages()) {
        const isTarget = message.login === login && !message.flags.moderation && !message.flags.disabled;
        if (!isTarget) continue;
        message.flags.disabled = true;
        sink.changed(message);
    }
}

function disableAll(sink: MessageSink): void {
    for (const message of sink.messages()) {
        if (message.flags.disabled || message.flags.moderation) continue;
        message.flags.disabled = true;
        sink.changed(message);
    }
}

function findStackable(
    sink: MessageSink,
    now: number,
    matches: (message: ChatMessage) => boolean,
    stops: (message: ChatMessage) => boolean = () => false,
): ChatMessage | undefined {
    const list = sink.messages();
    const end = Math.max(0, list.length - STACK_WINDOW_MESSAGES);
    for (let i = list.length - 1; i >= end; i--) {
        const candidate = list[i];
        if (candidate.time < now - STACK_WINDOW_MS) return undefined;
        if (stops(candidate)) return undefined;
        if (matches(candidate)) return candidate;
    }
    return undefined;
}

function wroteSinceTimeout(login: string): (message: ChatMessage) => boolean {
    return (message) => message.login === login && !message.flags.disabled && !message.flags.moderation;
}

export type ClearChatResult = { added?: ChatMessage; replaced?: ChatMessage };

export function applyClearChat(sink: MessageSink, irc: IrcMessage, fallbackTime: number): ClearChatResult {
    const channel = (irc.params[0] ?? "").replace(/^#/, "").toLowerCase();
    const time = messageTime(irc.tags, fallbackTime);
    const historical = "historical" in irc.tags;
    const target = irc.params[1]?.toLowerCase();
    if (!target) {
        disableAll(sink);
        const previous = findStackable(sink, time, (message) => !!message.flags.clearChat);
        const message = makeClearChatMessage(channel, time, (previous?.count ?? 0) + 1);
        if (historical) message.flags.historical = true;
        if (previous) {
            sink.replace(previous, message);
            return { replaced: message };
        }
        message.id = `clearchat-${irc.tags["tmi-sent-ts"] ?? time}`;
        sink.add(message);
        return { added: message };
    }
    const durationText = irc.tags["ban-duration"];
    const duration = durationText === undefined ? undefined : Number(durationText);
    const previous = findStackable(
        sink,
        time,
        (message) => !!message.flags.timeout && message.timeoutUser === target,
        wroteSinceTimeout(target),
    );
    disableUser(sink, target);
    const message = makeTimeoutMessage(channel, target, duration, time, (previous?.count ?? 0) + 1);
    if (historical) message.flags.historical = true;
    if (previous) {
        sink.replace(previous, message);
        return { replaced: message };
    }
    message.id = `timeout-${target}-${irc.tags["tmi-sent-ts"] ?? time}`;
    sink.add(message);
    return { added: message };
}

export function applyClearMsg(sink: MessageSink, irc: IrcMessage, fallbackTime: number): ChatMessage | undefined {
    const targetId = irc.tags["target-msg-id"];
    if (!targetId) return undefined;
    const original = sink.findById(targetId);
    if (!original) return undefined;
    if (!original.flags.disabled) {
        original.flags.disabled = true;
        sink.changed(original);
    }
    const channel = (irc.params[0] ?? "").replace(/^#/, "").toLowerCase();
    const deletion = makeDeletionMessage(channel, original, messageTime(irc.tags, fallbackTime));
    deletion.id = `deleted-${targetId}`;
    if ("historical" in irc.tags) deletion.flags.historical = true;
    if (sink.findById(deletion.id)) return undefined;
    sink.add(deletion);
    return deletion;
}
