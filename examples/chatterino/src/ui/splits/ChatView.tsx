import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
    ChatList,
    NativeClipboard,
    View,
    type ChatListHandle,
    type ChatListHoverEvent,
    type ChatListMessage,
    type ChatListPressEvent,
    type ChatListScrollState,
} from "react-native-gpui";
import type { Channel } from "../../data/api";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import type { MenuEntry } from "../state/overlays";
import { MoreMessagesButton } from "./MoreMessagesButton";
import { PausedIndicator } from "./PausedIndicator";
import { chatListProps, handleInternalLink, isChatMessage, messageText } from "./chatHelpers";

export type ChatViewHandle = { scrollToBottom(): void };

type Props = {
    channel: Channel | undefined;
    splitId: string;
    tabId: string;
    channelName: string;
};

const INITIAL_SCROLL: ChatListScrollState = { atBottom: true, paused: false, unseen: 0 };

export const ChatView = forwardRef<ChatViewHandle, Props>(function ChatView({ channel, splitId, tabId, channelName }, ref) {
    const services = useApp();
    const { theme, fonts, settings, prefs } = services;
    const list = useRef<ChatListHandle>(null);
    const latest = useRef(services);
    latest.current = services;
    const [scroll, setScroll] = useState<ChatListScrollState>(INITIAL_SCROLL);
    const cursor = useRef<{ x: number; y: number } | undefined>(undefined);
    const tooltipOwner = `chat:${splitId}`;

    useImperativeHandle(ref, () => ({ scrollToBottom: () => list.current?.scrollToBottom() }), []);

    useEffect(() => {
        const handle = list.current;
        if (!handle) return;
        handle.clear();
        if (!channel) return;
        handle.append(channel.snapshot());
        const markActivity = (messages: ChatListMessage[]) => {
            const current = latest.current;
            const selectedTabId = current.core.layout.get().selectedTabId;
            const muted = current.prefs.mutedTabs.includes(tabId);
            if (selectedTabId === tabId || muted || !messages.some(isChatMessage)) return;
            current.tabActivity.set((activity) => (activity[tabId] ? activity : { ...activity, [tabId]: "newMessage" }));
        };
        return channel.subscribe((event) => {
            switch (event.type) {
                case "append":
                    handle.append(event.messages);
                    markActivity(event.messages);
                    return;
                case "prepend":
                    handle.prepend(event.messages);
                    return;
                case "update":
                    handle.update(event.patches);
                    return;
                case "clear":
                    handle.clear();
                    return;
            }
        });
    }, [channel, tabId]);

    const findMessage = (id: string) => channel?.snapshot().find((message) => message.id === id);

    const openContextMenu = (event: ChatListPressEvent) => {
        const entries: MenuEntry[] = [];
        const message = findMessage(event.messageId);
        if (event.target === "link" && event.url) {
            const url = event.url;
            entries.push({ kind: "item", label: "Open link", onSelect: () => services.openUrl(url) });
            entries.push({ kind: "item", label: "Copy link", onSelect: () => NativeClipboard.setString(url) });
            entries.push({ kind: "separator" });
        }
        if (event.target === "emote" && event.name) {
            const name = event.name;
            const link = event.link;
            entries.push({ kind: "item", label: "Copy emote name", onSelect: () => NativeClipboard.setString(name) });
            if (link) entries.push({ kind: "item", label: "Open emote link", onSelect: () => services.openUrl(link) });
            entries.push({ kind: "separator" });
        }
        if (message) entries.push({ kind: "item", label: "Copy message", onSelect: () => NativeClipboard.setString(messageText(message)) });
        if (entries.length > 0) services.openOverlay({ kind: "menu", x: event.x, y: event.y, entries });
    };

    const handlePress = ({ nativeEvent }: { nativeEvent: ChatListPressEvent }) => {
        const isLeft = nativeEvent.button === "left";
        const isRight = nativeEvent.button === "right";
        if (nativeEvent.target === "user" && nativeEvent.login) {
            if (isLeft) {
                services.openOverlay({ kind: "userCard", login: nativeEvent.login, channel: channelName, x: nativeEvent.x, y: nativeEvent.y });
            }
            if (isRight) inputRegistry.get(splitId)?.mention(nativeEvent.name?.replace(/:$/, "") ?? nativeEvent.login, false);
            return;
        }
        if (isRight) {
            openContextMenu(nativeEvent);
            return;
        }
        const link = nativeEvent.target === "link" ? nativeEvent.url : undefined;
        if (link && !handleInternalLink(link, services)) services.openUrl(link);
        if (nativeEvent.target === "emote" && nativeEvent.link) services.openUrl(nativeEvent.link);
    };

    const handleHover = ({ nativeEvent }: { nativeEvent: ChatListHoverEvent | null }) => {
        const showsTooltip = !!nativeEvent && (nativeEvent.target === "emote" || nativeEvent.target === "badge");
        const dragging = !!services.drag.get();
        if (!nativeEvent || !showsTooltip || dragging) {
            services.hideTooltip(tooltipOwner);
            return;
        }
        const image = nativeEvent.tooltipImage ?? nativeEvent.url;
        services.showTooltip({
            owner: tooltipOwner,
            text: nativeEvent.tooltip ?? nativeEvent.name ?? "",
            image,
            anchor: { x: nativeEvent.x, y: nativeEvent.y, width: nativeEvent.width, height: nativeEvent.height },
            cursor: cursor.current,
            placement: "cursor",
        });
    };

    return (
        <View
            style={{ flex: 1 }}
            onMouseMove={(event) => {
                cursor.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
            }}
            onMouseLeave={() => services.hideTooltip(tooltipOwner)}
        >
            <ChatList
                ref={list}
                testID={`chat-${splitId}`}
                style={{ flex: 1, backgroundColor: theme.messages.background }}
                {...chatListProps(theme, fonts, settings, prefs)}
                onPress={handlePress}
                onHover={handleHover}
                onScrollState={({ nativeEvent }) => setScroll(nativeEvent)}
            />
            {scroll.paused ? <PausedIndicator /> : null}
            {scroll.atBottom ? null : (
                <MoreMessagesButton
                    testID={`more-messages-${splitId}`}
                    theme={theme}
                    fonts={fonts}
                    onPress={() => setTimeout(() => list.current?.scrollToBottom(), 180)}
                />
            )}
        </View>
    );
});
