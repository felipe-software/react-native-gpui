import type { ChatChannel } from "./channel/chat-channel";
import { parseIrcLine, unescapeZeroWidthJoiner, type IrcMessage } from "./irc/message";
import { ArraySink } from "./messages/sink";
import type { ChatMessage } from "./messages/model";
import { makeSystemMessage } from "./messages/system";
import { formatHttpError, requestJson, type FetchLike } from "./util/http";
import { formatLongDate, localDayKey, startOfLocalDay } from "./util/time";

export type RecentMessagesResponse = { messages?: string[]; error?: string | null; error_code?: string | null };

const RECENT_MESSAGES_TEMPLATE = "https://recent-messages.robotty.de/api/v2/recent-messages/%1";

export function recentMessagesUrl(channel: string, limit: number, template: string = RECENT_MESSAGES_TEMPLATE): string {
    const base = template.replace("%1", encodeURIComponent(channel));
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}limit=${limit}`;
}

export function parseRecentMessages(response: RecentMessagesResponse): IrcMessage[] {
    const parsed: IrcMessage[] = [];
    for (const line of response.messages ?? []) {
        const message = parseIrcLine(unescapeZeroWidthJoiner(line));
        if (message) parsed.push(message);
    }
    return parsed;
}

function markHistorical(message: ChatMessage): void {
    message.flags.historical = true;
    message.alert = undefined;
}

export function buildHistory(channel: ChatChannel, lines: IrcMessage[], today: number): ChatMessage[] {
    const sink = new ArraySink();
    let lastDay = localDayKey(today);
    for (const irc of lines) {
        const received = Number(irc.tags["rm-received-ts"]);
        if (Number.isFinite(received) && received > 0) {
            const day = localDayKey(received);
            if (day !== lastDay) {
                lastDay = day;
                const separator = makeSystemMessage(channel.name, formatLongDate(received), startOfLocalDay(received));
                separator.id = `history-day-${channel.name}-${day}`;
                sink.add(separator);
            }
        }
        switch (irc.command) {
            case "PRIVMSG":
                channel.handlePrivmsg(irc, sink);
                break;
            case "USERNOTICE":
                channel.handleUserNotice(irc, sink);
                break;
            case "CLEARCHAT":
                channel.handleClearChat(irc, sink);
                break;
            case "CLEARMSG":
                channel.handleClearMsg(irc, sink);
                break;
        }
    }
    for (const message of sink.list) markHistorical(message);
    return sink.list;
}

export async function fetchHistory(
    fetchFn: FetchLike,
    channel: string,
    limit: number,
    template?: string,
): Promise<{ lines: IrcMessage[]; notice?: string }> {
    try {
        const response = await requestJson<RecentMessagesResponse>(fetchFn, recentMessagesUrl(channel, limit, template), { timeoutMs: 20_000 });
        const lines = parseRecentMessages(response);
        const recovering = response.error_code === "channel_not_joined" && lines.length > 0;
        const notice = recovering ? "Message history service recovering, there may be gaps in the message history." : undefined;
        return { lines, notice };
    } catch (error) {
        return { lines: [], notice: `Message history service unavailable (Error: ${formatHttpError(error)})` };
    }
}
