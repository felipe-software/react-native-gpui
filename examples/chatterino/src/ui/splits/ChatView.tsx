import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
    ChatList,
    NativeClipboard,
    View,
    type ChatListHandle,
    type ChatListHoverEvent,
    type ChatListMessage,
    type ChatListMessagePatch,
    type ChatListPressEvent,
    type ChatListScrollState,
    type MouseResponderEvent,
} from "react-native-gpui";
import type { Channel } from "../../data/api";
import { threadRootId } from "../../data/threads";
import { useApp, type AppServices } from "../state/AppContext";
import { MENTIONS_CHANNEL } from "../state/ids";
import { inputRegistry } from "../state/inputs";
import { isSpecialChannel } from "../state/specialChannels";
import { useModRights } from "../state/useChannelRights";
import { useStore } from "../state/useStore";
import { MoreMessagesButton } from "./MoreMessagesButton";
import { PausedIndicator } from "./PausedIndicator";
import { ZoomWheel } from "./ZoomWheel";
import { uiScaleOf, zoomedScale } from "../zoom";
import {
    REPLY_LINK,
    THREAD_LINK,
    chatListProps,
    copyMessageText,
    handleInternalLink,
    isChatMessage,
    isReplyButton,
    messageText,
    withReplyButton,
} from "./chatHelpers";
import { messageMenuEntries, usernameRightClickAction, viewerCardUrl, type MessageMenuActions, type Modifiers } from "./messageMenu";
import { authorOf, isReplyable, linkNameOf, replyTargetFor } from "./replyTarget";

export type ChatViewHandle = { scrollToBottom(): void };

type Props = {
    channel: Channel | undefined;
    source: Channel | undefined;
    splitId: string;
    tabId: string;
    channelName: string;
    zoomWheel?: boolean;
};

const INITIAL_SCROLL: ChatListScrollState = { atBottom: true, paused: false, unseen: 0 };
const MODIFIER_WINDOW_MS = 150;

type RecentModifiers = Modifiers & { at: number; fromContextMenu: boolean };

function modifiersOf(event: MouseResponderEvent): Modifiers {
    const native = event.nativeEvent;
    return { shiftKey: !!native.shiftKey, ctrlKey: !!native.ctrlKey, altKey: !!native.altKey, metaKey: !!native.metaKey };
}

function mentionNameOf(event: ChatListPressEvent): string {
    const raw = event.name ?? event.login ?? "";
    return raw.replace(/^@/, "").replace(/[:,]$/, "");
}

function mentionsSourceChannel(message: ChatListMessage | undefined): string {
    const first = message?.elements[0];
    if (first?.kind !== "text") return "";
    return first.text.replace(/^#/, "");
}

function openPlayer(services: AppServices, channel: string): void {
    services.openUrl(`https://player.twitch.tv/?parent=twitch.tv&channel=${channel}`);
}

export const ChatView = forwardRef<ChatViewHandle, Props>(function ChatView({ channel, source, splitId, tabId, channelName, zoomWheel }, ref) {
    const services = useApp();
    const { theme, fonts, settings, prefs, core } = services;
    const accounts = useStore(core.accounts);
    const list = useRef<ChatListHandle>(null);
    const latest = useRef(services);
    latest.current = services;
    const [scroll, setScroll] = useState<ChatListScrollState>(INITIAL_SCROLL);
    const cursor = useRef<{ x: number; y: number } | undefined>(undefined);
    const modifiers = useRef<RecentModifiers>({ at: 0, fromContextMenu: false });
    const pendingRight = useRef<{ event: ChatListPressEvent; timer: ReturnType<typeof setTimeout> } | null>(null);
    const tooltipOwner = `chat:${splitId}`;
    const isMentions = channelName === MENTIONS_CHANNEL;
    const canReply = !isSpecialChannel(channelName) && !!source;
    const showReplyButton = !!settings.showReplyButton && canReply;
    const hasModRights = useModRights(isSpecialChannel(channelName) ? undefined : source, accounts.current);

    useImperativeHandle(ref, () => ({ scrollToBottom: () => list.current?.scrollToBottom() }), []);

    useEffect(() => {
        const handle = list.current;
        if (!handle) return;
        handle.clear();
        if (!channel) return;
        const decorate = (messages: ChatListMessage[]) => (showReplyButton ? messages.map(withReplyButton) : messages);
        const decoratePatches = (patches: ChatListMessagePatch[]) =>
            showReplyButton ? patches.map((patch) => (patch.elements ? (withReplyButton(patch as ChatListMessage) as ChatListMessagePatch) : patch)) : patches;
        handle.append(decorate(channel.snapshot()));
        const markActivity = (messages: ChatListMessage[]) => {
            const current = latest.current;
            const selectedTabId = current.core.layout.get().selectedTabId;
            const muted = current.prefs.mutedTabs.includes(tabId);
            if (selectedTabId === tabId || muted || !messages.some(isChatMessage)) return;
            const highlightTab = isMentions && current.settings.highlightMentions && messages.some((message) => !message.historical);
            if (highlightTab) current.tabActivity.set((activity) => ({ ...activity, [tabId]: "highlighted" }));
            else current.tabActivity.set((activity) => (activity[tabId] ? activity : { ...activity, [tabId]: "newMessage" }));
        };
        return channel.subscribe((event) => {
            switch (event.type) {
                case "append":
                    handle.append(decorate(event.messages));
                    markActivity(event.messages);
                    return;
                case "prepend":
                    handle.prepend(decorate(event.messages));
                    return;
                case "update":
                    handle.update(decoratePatches(event.patches));
                    return;
                case "clear":
                    handle.clear();
                    return;
            }
        });
    }, [channel, tabId, showReplyButton]);

    const findMessage = (id: string) => channel?.snapshot().find((message) => message.id === id);

    const startReply = (message: ChatListMessage | undefined) => {
        if (!message) return;
        const target = replyTargetFor(source, message);
        if (target) inputRegistry.get(splitId)?.reply(target);
    };

    const openThread = (rootId: string) => services.openOverlay({ kind: "thread", splitId, channel: channelName, rootId });

    const menuActions = (message: ChatListMessage | undefined): MessageMenuActions => {
        const rootId = message ? threadRootId(message) : undefined;
        const root = rootId ? findMessage(rootId) : undefined;
        const actions: MessageMenuActions = {
            openUrl: services.openUrl,
            copy: (text) => NativeClipboard.setString(text),
            openPlayer: (name) => openPlayer(services, name),
            openChannelInSplit: (name) => services.actions.openChannelInNewSplit(splitId, name),
            openChannelInTab: (name) => services.actions.openChannelInNewTab(name),
        };
        if (canReply && message) actions.reply = () => startReply(message);
        if (canReply && root) actions.replyToThread = () => startReply(root);
        if (rootId) actions.viewThread = () => openThread(rootId);
        if (hasModRights && message && source) actions.deleteMessage = () => void source.send(`/delete ${message.id}`);
        const menuCommands = core.messageMenuCommands();
        if (message) actions.commands = menuCommands.map((command) => ({ label: command.trigger, run: () => core.runMessageCommand(channelName, command.trigger, message.id) }));
        const streamlink = (core as { openInStreamlink?: (name: string) => Promise<unknown> }).openInStreamlink;
        if (typeof streamlink === "function") actions.openStreamlink = (name) => void streamlink.call(core, name);
        const customPlayer = (core as { customPlayerUrl?: (name: string) => string | undefined }).customPlayerUrl;
        if (typeof customPlayer === "function") {
            actions.openCustomPlayer = (name) => {
                const url = customPlayer.call(core, name);
                if (url) services.openUrl(url);
            };
        }
        return actions;
    };

    const openContextMenu = (event: ChatListPressEvent, held: Modifiers) => {
        const message = findMessage(event.messageId);
        const entries = messageMenuEntries(
            {
                event,
                message,
                copyMessage: message ? copyMessageText(message) : "",
                copyFullMessage: message ? messageText(message) : "",
                shift: !!held.shiftKey && !held.ctrlKey && !held.altKey && !held.metaKey,
                canReply,
                replyable: !!message && isReplyable(source, message),
                inThread: !!message && !!threadRootId(message),
            },
            menuActions(message),
        );
        if (entries.length > 0) services.openOverlay({ kind: "menu", x: event.x, y: event.y, entries });
    };

    const rightClickUser = (event: ChatListPressEvent, held: Modifiers) => {
        const message = findMessage(event.messageId);
        const author = message ? authorOf(message) : undefined;
        const isAuthor = !!author && author.login.toLowerCase() === (event.login ?? "").toLowerCase();
        const action = usernameRightClickAction(isAuthor, held, settings);
        if (action === "reply" && canReply) {
            startReply(message);
            return;
        }
        if (action === "ignore") return;
        const name = isAuthor && author ? linkNameOf(author) : mentionNameOf(event);
        if (name) inputRegistry.get(splitId)?.mention(name, false);
    };

    const resolveRight = (event: ChatListPressEvent, held: Modifiers) => {
        if (event.target === "user" && event.login) rightClickUser(event, held);
        else openContextMenu(event, held);
    };

    const flushPendingRight = (held: Modifiers) => {
        const pending = pendingRight.current;
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingRight.current = null;
        resolveRight(pending.event, held);
    };

    const handleRightPress = (event: ChatListPressEvent) => {
        const recent = Date.now() - modifiers.current.at < MODIFIER_WINDOW_MS;
        if (recent && modifiers.current.fromContextMenu) {
            resolveRight(event, modifiers.current);
            return;
        }
        if (pendingRight.current) clearTimeout(pendingRight.current.timer);
        const timer = setTimeout(() => flushPendingRight(modifiers.current), MODIFIER_WINDOW_MS);
        pendingRight.current = { event, timer };
    };

    const handleMiddlePress = (event: ChatListPressEvent) => {
        if (event.target === "link" && event.url && !event.url.startsWith("chatterino://")) {
            services.openUrl(event.url);
            return;
        }
        if (event.target !== "user" || !event.login) return;
        const message = findMessage(event.messageId);
        const author = message ? authorOf(message) : undefined;
        if (author?.login !== event.login) return;
        const ownerChannel = isMentions ? mentionsSourceChannel(message) : channelName;
        if (ownerChannel) services.openUrl(viewerCardUrl(ownerChannel, event.login));
    };

    const handleLeftPress = (event: ChatListPressEvent) => {
        if (event.target === "user" && event.login) {
            services.openOverlay({ kind: "userCard", login: event.login, channel: channelName, x: event.x, y: event.y });
            return;
        }
        if (event.target === "emote" && isReplyButton(event.link)) {
            const link = event.link ?? "";
            if (link.startsWith(THREAD_LINK)) openThread(link.slice(THREAD_LINK.length));
            else if (link.startsWith(REPLY_LINK)) {
                const message = findMessage(event.messageId);
                if (message && isReplyable(source, message)) startReply(message);
            }
            return;
        }
        const link = event.target === "link" ? event.url : undefined;
        if (link && !handleInternalLink(link, services, { splitId, channel: channelName })) services.openUrl(link);
        if (event.target === "emote" && event.link) services.openUrl(event.link);
    };

    const handlePress = ({ nativeEvent }: { nativeEvent: ChatListPressEvent }) => {
        services.hideTooltip(tooltipOwner);
        if (nativeEvent.button === "right") handleRightPress(nativeEvent);
        else if (nativeEvent.button === "middle") handleMiddlePress(nativeEvent);
        else handleLeftPress(nativeEvent);
    };

    const handleHover = ({ nativeEvent }: { nativeEvent: ChatListHoverEvent | null }) => {
        const isImage = !!nativeEvent && (nativeEvent.target === "emote" || nativeEvent.target === "badge");
        const showsTooltip = isImage && !isReplyButton(nativeEvent?.link);
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

    const rememberModifiers = (event: MouseResponderEvent, fromContextMenu: boolean) => {
        modifiers.current = { ...modifiersOf(event), at: Date.now(), fromContextMenu };
    };

    return (
        <View
            style={{ flex: 1 }}
            onMouseMove={(event) => {
                cursor.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
                rememberModifiers(event, false);
            }}
            onContextMenu={(event) => {
                rememberModifiers(event, true);
                flushPendingRight(modifiers.current);
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
            {zoomWheel ? (
                <ZoomWheel
                    testID={`zoom-wheel-${splitId}`}
                    onZoom={(direction) => core.settings.set((current) => ({ ...current, uiScale: zoomedScale(uiScaleOf(current), direction) }))}
                />
            ) : null}
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
