import type { Settings } from "../api";
import type { IrcMessage, IrcTags } from "../irc/message";
import { badgeCategory } from "../badges/twitch";
import type { Badge } from "../emotes/types";
import { stylizeName } from "../filters/nicknames";
import { messageTime, parseBadgeInfoTag, parseBadgeTag, parseTwitchEmotes, type TwitchBadge } from "../twitch/tags";
import { normalizeHexColor, randomUserColor } from "../twitch/usercolor";
import { threadLink } from "../links/internal";
import { nextLocalId, PieceBuilder } from "./builder";
import type { ChannelContext, GlobalContext } from "./context";
import type { BadgeGroup, ChatMessage, MessageFlags, Tint } from "./model";
import { addWords } from "./words";

export type PrivmsgOptions = {
    content: string;
    isAction: boolean;
    isSubscription: boolean;
    allowIgnore: boolean;
};

const GRAY_NAME = "#999999";

export function stylizeUsername(login: string, localizedName: string | undefined, global?: GlobalContext): string {
    const mode = global?.settings?.usernameDisplayMode ?? "usernameAndLocalizedName";
    return stylizeName(login, localizedName, mode, global?.nickname ?? (() => undefined));
}

const BADGE_GROUP_SETTINGS: Record<BadgeGroup, keyof Settings> = {
    globalAuthority: "showBadgesGlobalAuthority",
    predictions: "showBadgesPredictions",
    channelAuthority: "showBadgesChannelAuthority",
    subscription: "showBadgesSubscription",
    vanity: "showBadgesVanity",
    chatterino: "showBadgesChatterino",
    ffz: "showBadgesFfz",
    bttv: "showBadgesBttv",
    seventv: "showBadgesSevenTV",
};

export function badgeGroupVisible(group: BadgeGroup | undefined, settings: Settings): boolean {
    if (!group) return true;
    return settings[BADGE_GROUP_SETTINGS[group]] !== false;
}

function userBadgeGroup(badge: Badge): BadgeGroup {
    if (badge.key.startsWith("chatterino:")) return "chatterino";
    if (badge.key.startsWith("betterttv:")) return "bttv";
    if (badge.key.startsWith("ffz:")) return "ffz";
    if (badge.key.startsWith("7tv:")) return "seventv";
    return "vanity";
}

function stripLeadingReplyMention(tags: IrcTags, content: string): { content: string; offset: number } {
    const displayName = tags["reply-parent-display-name"];
    if (displayName === undefined) return { content, offset: 0 };
    if (content.length <= 1 + displayName.length) return { content, offset: 0 };
    const startsWithMention = content.startsWith("@") && content.indexOf(displayName, 1) === 1;
    const followedBySpace = content[1 + displayName.length] === " ";
    if (!startsWithMention || !followedBySpace) return { content, offset: 0 };
    const offset = 1 + displayName.length + 1;
    return { content: content.slice(offset), offset };
}

function usernameColor(tags: IrcTags, settings: Settings | undefined): string | undefined {
    const tagged = normalizeHexColor(tags.color);
    if (tagged) return tagged;
    const userId = tags["user-id"];
    if (settings?.colorizeNicknames === false) return GRAY_NAME;
    return userId ? randomUserColor(userId) : undefined;
}

function subscriberTooltip(base: string, badge: TwitchBadge, infos: Map<string, string>): string {
    const months = infos.get(badge.key);
    if (months === undefined) return base;
    const tier = badge.value.length > 3 ? badge.value[0] : "1";
    const tierText = tier !== "1" ? `Tier ${tier}, ` : "";
    return `${base} (${tierText}${months} months)`;
}

function appendTwitchBadges(builder: PieceBuilder, tags: IrcTags, channel: ChannelContext, settings: Settings | undefined): string[] {
    const badges = parseBadgeTag(tags);
    const infos = parseBadgeInfoTag(tags);
    const customMod = settings?.useCustomFfzModeratorBadges !== false;
    const customVip = settings?.useCustomFfzVipBadges !== false;
    for (const badge of badges) {
        if (badge.key === "moderator" && customMod) {
            const custom = channel.customModBadge();
            if (custom) {
                builder.badge(custom, custom.tooltip, "channelAuthority");
                continue;
            }
        }
        if (badge.key === "vip" && customVip) {
            const custom = channel.customVipBadge();
            if (custom) {
                builder.badge(custom, custom.tooltip, "channelAuthority");
                continue;
            }
        }
        const resolved = channel.twitchBadge(badge.key, badge.value);
        if (!resolved) continue;
        const category = badgeCategory(badge.key);
        let tooltip = resolved.tooltip;
        if (badge.key === "bits") tooltip = `Twitch cheer ${badge.value}`;
        else if (category === "subscription") tooltip = subscriberTooltip(tooltip, badge, infos);
        else if (category === "predictions" && infos.has(badge.key)) {
            tooltip = `Predicted ${(infos.get(badge.key) ?? "").replace(/⸝/g, ",")}`;
        }
        builder.badge(resolved, tooltip, category);
    }
    return badges.map((badge) => badge.key);
}

function appendReply(
    message: ChatMessage,
    tags: IrcTags,
    channel: ChannelContext,
    global: GlobalContext,
    textTint: Tint,
): void {
    const parentId = tags["reply-parent-msg-id"];
    if (!parentId) return;
    message.flags.reply = true;
    message.replyParentId = parentId;
    const parent = channel.findMessage(parentId);
    const rootId = tags["reply-thread-parent-msg-id"] ?? parentId;
    const builder = new PieceBuilder();
    if (parent && !parent.flags.system) {
        const parentIsAction = !!parent.flags.action;
        const name = stylizeUsername(parent.login, parent.localizedName, global);
        const parentTint = (parent.userColor as Tint | undefined) ?? "text";
        const suffix = parentIsAction ? "" : ":";
        builder.text("Replying to", "system", { link: threadLink(rootId) });
        builder.user(`@${name}${suffix}`, parent.login, parentTint);
        builder.text(parent.text, parentIsAction ? parentTint : "text", { link: threadLink(rootId) });
        message.reply = builder.pieces;
        return;
    }
    builder.text("Replying to", "system");
    const replyName = tags["reply-parent-display-name"];
    const replyBody = tags["reply-parent-msg-body"];
    if (replyName === undefined || replyBody === undefined) return;
    const parentLogin = (tags["reply-parent-user-login"] ?? replyName).toLowerCase();
    if (global.ignores.isIgnoredUser(parentLogin)) {
        builder.text("[Blocked user]", textTint);
    } else {
        builder.user(`@${replyName}:`, parentLogin, textTint);
        builder.text(replyBody, textTint);
    }
    message.reply = builder.pieces;
}

function displayNames(tags: IrcTags, login: string): { displayName: string; localizedName?: string } {
    const display = (tags["display-name"] ?? "").trim();
    if (!display) return { displayName: login };
    if (display.toLowerCase() === login.toLowerCase()) return { displayName: display };
    return { displayName: login, localizedName: display };
}

function rewardFlags(tags: IrcTags, flags: MessageFlags): void {
    const msgId = tags["msg-id"] ?? "";
    const hasReward = !!tags["custom-reward-id"] || msgId === "animated-message" || msgId === "gigantified-emote-message";
    if (hasReward) flags.redeemed = true;
    if (msgId.split(";").includes("highlighted-message")) flags.redeemed = true;
}

function threadState(tags: IrcTags, login: string, channel: ChannelContext, global: GlobalContext): boolean {
    const rootId = tags["reply-thread-parent-msg-id"];
    if (!rootId || !global.selfLogin) return false;
    const self = global.selfLogin.toLowerCase();
    const parentLogin = (tags["reply-parent-user-login"] ?? "").toLowerCase();
    const participated = login === self || parentLogin === self;
    const autoSubscribe = global.settings?.autoSubToParticipatedThreads !== false;
    if (participated && autoSubscribe) channel.subscribeThread(rootId);
    return channel.isThreadSubscribed(rootId);
}

function rewardInfo(tags: IrcTags, message: ChatMessage): void {
    const rewardId = tags["custom-reward-id"];
    if (rewardId) message.rewardId = rewardId;
}

export function buildPrivmsg(
    irc: IrcMessage,
    channel: ChannelContext,
    global: GlobalContext,
    options: PrivmsgOptions,
): ChatMessage | undefined {
    const { tags } = irc;
    const nick = irc.nick || tags.login || "";
    const login = (options.isSubscription || !irc.nick ? tags.login || nick : nick).toLowerCase();
    const settings = global.settings;
    const stripReply = settings?.stripReplyMention !== false && !settings?.hideReplyContext;
    const stripped = stripReply ? stripLeadingReplyMention(tags, options.content) : { content: options.content, offset: 0 };
    const { ignores } = global;
    const viewer = { isModerator: !!channel.isModerator?.(), isBroadcaster: !!channel.isBroadcaster?.() };
    const isIgnored = ignores.isIgnoredUser(login, viewer) || ignores.isBlocked(options.content);
    if (options.allowIgnore && isIgnored) return undefined;

    const color = usernameColor(tags, settings);
    if (color) channel.setUserColor(login, color);
    const textTint: Tint = options.isAction && color ? (color as Tint) : "text";
    const flags: MessageFlags = {};
    if (options.isAction) flags.action = true;
    if ("rm-deleted" in tags) flags.disabled = true;
    if (tags["first-msg"] === "1") flags.firstMessage = true;
    if ("pinned-chat-paid-amount" in tags) flags.elevated = true;
    if ("bits" in tags) flags.cheer = true;
    if ("historical" in tags) flags.historical = true;
    rewardFlags(tags, flags);
    const isSubscribedThread = threadState(tags, login, channel, global);

    const { displayName, localizedName } = displayNames(tags, login);
    const message: ChatMessage = {
        id: tags.id || nextLocalId("msg"),
        channel: channel.name,
        time: messageTime(tags, global.now()),
        login,
        displayName,
        localizedName,
        userId: tags["user-id"],
        userColor: color,
        pieces: [],
        flags,
        text: "",
        searchText: "",
        count: 1,
    };
    if (global.selfLogin && login === global.selfLogin.toLowerCase()) flags.self = true;
    appendReply(message, tags, channel, global, textTint);

    const builder = new PieceBuilder();
    message.badges = appendTwitchBadges(builder, tags, channel, settings);
    message.twitchBadges = parseBadgeTag(tags);
    message.badgeInfos = Object.fromEntries(parseBadgeInfoTag(tags));
    rewardInfo(tags, message);
    const userId = tags["user-id"];
    if (userId) for (const badge of channel.userBadges(userId)) builder.badge(badge, badge.tooltip, userBadgeGroup(badge));

    const nameText = stylizeUsername(localizedName ? login : displayName, localizedName, global);
    const usernameTint = (color as Tint | undefined) ?? "text";
    builder.user(options.isAction ? nameText : `${nameText}:`, login, usernameTint, true);

    const occurrences = parseTwitchEmotes(tags, stripped.content, stripped.offset);
    const replaced = ignores.replace(stripped.content, occurrences);
    addWords(builder, replaced.content, replaced.emotes, {
        textTint,
        lookupEmote: (name) => channel.lookupEmote(name),
        userColor: (name) => channel.userColor(name),
        cheermotes: channel.cheermotes(),
        bits: Number(tags.bits ?? 0) || 0,
        isKnownChatter: channel.isKnownChatter ? (name) => !!channel.isKnownChatter?.(name) : undefined,
        findAllUsernames: settings?.findAllUsernames,
        lowercaseDomains: settings?.lowercaseDomains,
        zeroWidthEmotes: settings?.enableZeroWidthEmotes,
        stackBits: settings?.stackBits,
    });
    message.pieces = builder.pieces;
    message.text = replaced.content;
    message.searchText = `${nameText} ${localizedName ?? ""} ${login}: ${replaced.content}`;

    const highlight = global.highlights.check({
        senderLogin: login,
        content: stripped.content,
        isSubscription: options.isSubscription,
        isSubscribedThread,
        badges: message.twitchBadges,
    });
    if (highlight) {
        flags.highlighted = true;
        message.highlightColor = highlight.color;
        if (highlight.showInMentions) flags.showInMentions = true;
        const quiet = !!flags.historical;
        message.alert = { playSound: !quiet && highlight.playSound, windowAlert: !quiet && highlight.alert };
        if (highlight.soundUrl) message.alert.soundUrl = highlight.soundUrl;
    }
    return message;
}
