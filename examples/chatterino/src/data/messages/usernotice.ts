import type { IrcMessage, IrcTags } from "../irc/message";
import { messageTime } from "../twitch/tags";
import { normalizeHexColor } from "../twitch/usercolor";
import type { ChannelContext, GlobalContext } from "./context";
import type { ChatMessage, Tint } from "./model";
import { buildPrivmsg } from "./privmsg";
import { makeSubgiftMessage, makeSystemMessageWithUser } from "./system";

const SPECIAL_MESSAGE_TYPES = new Set([
    "sub",
    "subgift",
    "resub",
    "bitsbadgetier",
    "ritual",
    "announcement",
    "viewermilestone",
]);

const ANONYMOUS_GIFTER_ID = "274598607";

function resolveType(tags: IrcTags): { msgType: string; mirrored: boolean } {
    let msgType = tags["msg-id"] ?? "";
    let mirrored = msgType === "sharedchatnotice";
    if (mirrored) msgType = tags["source-msg-id"] ?? "";
    else if (tags["room-id"] !== undefined && tags["source-room-id"] !== undefined) {
        mirrored = tags["room-id"] !== tags["source-room-id"];
    }
    return { msgType, mirrored };
}

function kFormat(value: number): string {
    return `${Math.trunc(value / 1000)}K`;
}

function subgiftText(tags: IrcTags, fallback: string): string {
    const months = Number(tags["msg-param-gift-months"] ?? 0);
    if (!(months > 1)) return fallback;
    const plan = tags["msg-param-sub-plan"] ?? "";
    const isAnonymous = tags["user-id"] === ANONYMOUS_GIFTER_ID;
    const name = isAnonymous ? "An anonymous user" : tags["display-name"] ?? "";
    const tier = plan ? plan[0] : "1";
    const recipient = tags["msg-param-recipient-display-name"] ?? "";
    let text = `${name} gifted ${months} months of a Tier ${tier} sub to ${recipient}!`;
    const senderCount = Number(tags["msg-param-sender-count"] ?? 0);
    if (senderCount > months) text += ` They've gifted ${senderCount} months in the channel.`;
    return text;
}

function multiMonthText(tags: IrcTags, msgType: string, fallback: string): string {
    const tenure = tags["msg-param-multimonth-tenure"];
    if (tenure === undefined || Number(tenure) !== 0) return fallback;
    const months = Number(tags["msg-param-multimonth-duration"] ?? 0);
    if (!(months > 1)) return fallback;
    const tier = Math.trunc(Number(tags["msg-param-sub-plan"] ?? 0) / 1000);
    const head = `${tags["display-name"] ?? ""} subscribed at Tier ${tier} for ${months} months in advance`;
    if (msgType !== "resub") return `${head}!`;
    const cumulative = Number(tags["msg-param-cumulative-months"] ?? 0);
    return `${head}, reaching ${cumulative} months cumulatively so far!`;
}

function colorTint(tags: IrcTags, login: string, channel: ChannelContext, tagName = "color"): Tint {
    const color = normalizeHexColor(tags[tagName]) ?? channel.userColor(login);
    return (color as Tint | undefined) ?? "system";
}

function markSubscription(message: ChatMessage, msgType: string): void {
    if (msgType === "viewermilestone") message.flags.watchStreak = true;
    else message.flags.subscription = true;
}

function systemText(tags: IrcTags, msgType: string): string {
    const base = tags["system-msg"] ?? "";
    if (msgType === "bitsbadgetier") {
        return `${tags["display-name"] ?? ""} just earned a new ${kFormat(Number(tags["msg-param-threshold"] ?? 0))} Bits badge!`;
    }
    if (msgType === "announcement") return "Announcement";
    if (msgType === "sub" || msgType === "resub") return multiMonthText(tags, msgType, base);
    return base;
}

function buildSubgift(irc: IrcMessage, channel: ChannelContext, text: string, time: number): ChatMessage {
    const { tags } = irc;
    const gifterLogin = (tags.login ?? "").toLowerCase();
    const recipientLogin = (tags["msg-param-recipient-user-name"] || tags["msg-param-recipient-name"] || "").toLowerCase();
    const message = makeSubgiftMessage(
        channel.name,
        text,
        {
            gifterLogin,
            gifterDisplayName: tags["display-name"] || gifterLogin,
            gifterColor: colorTint(tags, gifterLogin, channel),
            recipientLogin,
            recipientDisplayName: tags["msg-param-recipient-display-name"] || recipientLogin,
            recipientColor: (channel.userColor(recipientLogin) ?? "system") as Tint,
        },
        time,
    );
    message.flags.subscription = true;
    return message;
}

export function buildUserNotice(irc: IrcMessage, channel: ChannelContext, global: GlobalContext): ChatMessage[] {
    const { tags } = irc;
    const { msgType, mirrored } = resolveType(tags);
    if (mirrored && msgType !== "announcement") return [];
    const content = irc.params[1] ?? "";
    const login = (tags.login ?? "").toLowerCase();
    if (global.ignores.isIgnoredUser(login) || global.ignores.isBlocked(content)) return [];
    const results: ChatMessage[] = [];
    const time = messageTime(tags, global.now());
    const historical = "historical" in tags;

    if (SPECIAL_MESSAGE_TYPES.has(msgType) && content) {
        const userMessage = buildPrivmsg(irc, channel, global, {
            content,
            isAction: false,
            isSubscription: true,
            allowIgnore: false,
        });
        if (userMessage) {
            markSubscription(userMessage, msgType);
            if (msgType === "announcement") userMessage.flags.announcement = true;
            else userMessage.flags.highlighted = false;
            results.push(userMessage);
        }
    }

    if (tags["system-msg"] === undefined) return results;
    let text = systemText(tags, msgType);
    if (msgType === "subgift") {
        text = subgiftText(tags, text);
        const gift = buildSubgift(irc, channel, text, time);
        if (tags.id) gift.id = `${tags.id}-system`;
        if (historical) gift.flags.historical = true;
        results.push(gift);
        return results;
    }
    const displayName = (msgType === "raid" ? tags["msg-param-displayName"] : tags["display-name"]) || login;
    const message = makeSystemMessageWithUser(
        channel.name,
        text,
        login,
        displayName,
        colorTint(tags, login, channel),
        time,
    );
    markSubscription(message, msgType);
    if (tags.id) message.id = `${tags.id}-system`;
    if (historical) message.flags.historical = true;
    results.push(message);
    return results;
}
