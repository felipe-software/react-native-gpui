import type { ChatListElement, ChatListMessage, ChatListProps } from "react-native-gpui";
import { LINK_ACCOUNTS, LINK_RECONNECT, parseModerationLink } from "../../data";
import { threadRootId } from "../../data/threads";
import { assetPath } from "../assetPaths";
import type { Settings } from "../../data/api";
import type { Fonts } from "../fonts";
import { splitLeaves } from "../layout/tree";
import type { AppServices } from "../state/AppContext";
import type { UiPrefs } from "../state/prefs";
import { uiScaleOf } from "../zoom";
import { authorOf, canReplyTo } from "./replyTarget";
import type { Theme } from "../theme";

const OVERLAY_OPACITY = 0.4;

export function chatListProps(theme: Theme, fonts: Fonts, settings: Settings, prefs: UiPrefs): Partial<ChatListProps> {
    const props: Partial<ChatListProps> = {
        fontFamily: fonts.chatFamily,
        fontSize: fonts.chatSize,
        textColor: theme.messages.text,
        mutedColor: theme.messages.system,
        linkColor: theme.messages.link,
        selectionColor: theme.messages.selection,
        scrollbarColor: theme.scrollbar.thumb,
        disabledOpacity: OVERLAY_OPACITY,
        historicalOpacity: prefs.fadeMessageHistory ? OVERLAY_OPACITY : 1,
        showTimestamps: settings.showTimestamps,
        emoteScale: settings.emoteScale * uiScaleOf(settings),
        animateEmotes: settings.animateEmotes,
        maxMessages: settings.messageLimit,
        pauseOnHover: settings.pauseChatOnHover,
    };
    if (settings.showMessageSeparators) props.separatorColor = theme.messages.separator;
    if (settings.alternateMessageBackground) props.alternateBackground = theme.messages.alternate;
    return props;
}

export function isChatMessage(message: ChatListMessage): boolean {
    if (message.historical) return false;
    return !!authorOf(message);
}

const CHANNEL_PREFIX = "chatterino://channel/";
export const REPLY_LINK = "chatterino://reply/";
export const THREAD_LINK = "chatterino://thread/";
const REPLY_BUTTON_SIZE = 13;

export function isReplyButton(link: string | undefined): boolean {
    return !!link && (link.startsWith(REPLY_LINK) || link.startsWith(THREAD_LINK));
}

function replyButton(message: ChatListMessage): ChatListElement {
    const rootId = threadRootId(message);
    const link = rootId ? `${THREAD_LINK}${rootId}` : `${REPLY_LINK}${message.id}`;
    const icon = rootId ? "replyThread.svg" : "reply.svg";
    return { kind: "emote", name: "", url: assetPath(icon), width: REPLY_BUTTON_SIZE, height: REPLY_BUTTON_SIZE, link, trailingSpace: false };
}

export function withReplyButton(message: ChatListMessage): ChatListMessage {
    if (!canReplyTo(message)) return message;
    const last = message.elements[message.elements.length - 1];
    const withoutSpace = last ? [...message.elements.slice(0, -1), { ...last, trailingSpace: true }] : message.elements;
    return { ...message, elements: [...withoutSpace, replyButton(message)] };
}

function copyTextOf(element: ChatListElement): string {
    if (element.kind === "emote") return element.name;
    if (element.kind === "badge") return "";
    return element.text;
}

export function copyMessageText(message: ChatListMessage): string {
    const author = authorOf(message);
    return message.elements
        .filter((element) => element !== author && element.kind !== "badge")
        .filter((element) => !(element.kind === "text" && element.link?.startsWith(CHANNEL_PREFIX)))
        .filter((element) => !(element.kind === "emote" && isReplyButton(element.link)))
        .map(copyTextOf)
        .join(" ");
}

export function messageText(message: ChatListMessage): string {
    const parts: string[] = [];
    if (message.timestamp) parts.push(message.timestamp);
    for (const element of message.elements) {
        if (element.kind === "badge") continue;
        if (element.kind === "emote" && isReplyButton(element.link)) continue;
        parts.push(element.kind === "emote" ? element.name : element.text);
    }
    return parts.join(" ");
}

export type InternalLinkContext = { splitId: string; channel: string };

export function handleInternalLink(link: string, services: AppServices, context?: InternalLinkContext): boolean {
    if (!link.startsWith("chatterino://")) return false;
    if (link.startsWith(THREAD_LINK)) {
        const rootId = link.slice(THREAD_LINK.length);
        if (context && rootId) services.openOverlay({ kind: "thread", splitId: context.splitId, channel: context.channel, rootId });
        return true;
    }
    if (link === LINK_ACCOUNTS) {
        services.openOverlay({ kind: "settings", page: "Accounts" });
        return true;
    }
    if (link === LINK_RECONNECT) {
        services.core.reconnect();
        return true;
    }
    const moderationLink = parseModerationLink(link);
    if (moderationLink) {
        if (context) services.core.runModerationAction(context.channel, moderationLink.index, moderationLink.messageId);
        return true;
    }
    if (link.startsWith(CHANNEL_PREFIX)) {
        const channel = link.slice(CHANNEL_PREFIX.length);
        const layout = services.core.layout.get();
        for (const tab of layout.tabs) {
            const split = splitLeaves(tab.root).find((leaf) => leaf.channel === channel);
            if (split) {
                services.actions.focusSplit(split.id);
                return true;
            }
        }
        return true;
    }
    return true;
}
