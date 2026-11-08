import type { ChatListMessage, ChatListProps } from "react-native-gpui";
import { LINK_ACCOUNTS, LINK_RECONNECT } from "../../data";
import type { Settings } from "../../data/api";
import type { Fonts } from "../fonts";
import { splitLeaves } from "../layout/tree";
import type { AppServices } from "../state/AppContext";
import type { UiPrefs } from "../state/prefs";
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
        emoteScale: settings.emoteScale,
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
    const author = message.elements.find((element) => element.kind === "user");
    return !!author && author.text.endsWith(":");
}

export function messageText(message: ChatListMessage): string {
    const parts: string[] = [];
    if (message.timestamp) parts.push(message.timestamp);
    for (const element of message.elements) {
        if (element.kind === "badge") continue;
        parts.push(element.kind === "emote" ? element.name : element.text);
    }
    return parts.join(" ");
}

const CHANNEL_PREFIX = "chatterino://channel/";

export function handleInternalLink(link: string, services: AppServices): boolean {
    if (!link.startsWith("chatterino://")) return false;
    if (link === LINK_ACCOUNTS) {
        services.openOverlay({ kind: "settings", page: "Accounts" });
        return true;
    }
    if (link === LINK_RECONNECT) {
        services.core.reconnect();
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
