import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions, type ChatListMessage, type ChatListPressEvent } from "react-native-gpui";
import { threadFeed } from "../../data/threads";
import { Checkbox } from "../common/Checkbox";
import { FeedList } from "../common/FeedList";
import { FloatingWindow } from "../common/FloatingWindow";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { useChannel } from "../state/useChannel";
import { useStore } from "../state/useStore";
import { SplitInput, type SplitInputHandle } from "../splits/SplitInput";
import { authorOf, replyTargetFor } from "../splits/replyTarget";

type Props = { channel: string; rootId: string; x?: number; y?: number; onClose: () => void };

type ThreadState = {
    isThreadSubscribed?: (rootId: string) => boolean;
    subscribeThread?: (rootId: string) => void;
    unsubscribeThread?: (rootId: string) => void;
    threads?: Set<string>;
};

const WIDTH = 402;
const HEIGHT = 260;
const OFFSET_X = 150;
const OFFSET_Y = 70;

export function ThreadPopup({ channel, rootId, x, y, onClose }: Props) {
    const services = useApp();
    const { core, settings } = services;
    const screen = useWindowDimensions();
    const accounts = useStore(core.accounts);
    const source = useChannel(core, channel);
    const input = useRef<SplitInputHandle>(null);
    const feed = useMemo(() => (source ? threadFeed(source, rootId) : undefined), [source, rootId]);
    const messages = useMemo<ChatListMessage[]>(() => feed?.messages() ?? [], [feed]);
    const subscribe = useCallback((append: (fresh: ChatListMessage[]) => void) => feed?.subscribe(append) ?? (() => undefined), [feed]);
    const root = messages.find((message) => message.id === rootId);
    const rootAuthor = root ? authorOf(root) : undefined;
    const target = root ? replyTargetFor(source, root) : undefined;
    const title = rootAuthor ? `Reply Thread - @${rootAuthor.login} in #${channel}` : "Reply Thread";
    const threads = source as (typeof source & ThreadState) | undefined;
    const [subscribed, setSubscribed] = useState(() => !!threads?.isThreadSubscribed?.(rootId));
    const focusKey = `thread:${rootId}`;
    const showSubscribe = settings.enableThreadHighlight ?? true;
    const placeholder = accounts.current ? `Reply as ${accounts.current}...` : "Log in to send messages...";

    useEffect(() => {
        setSubscribed(!!threads?.isThreadSubscribed?.(rootId));
    }, [threads, rootId]);

    useEffect(() => {
        const timer = setTimeout(() => input.current?.focus(), 50);
        return () => clearTimeout(timer);
    }, []);

    useEffect(
        () =>
            inputRegistry.register(focusKey, {
                focus: () => input.current?.focus(),
                insert: (text) => input.current?.insert(text),
                mention: (name) => input.current?.mention(name),
                reply: () => undefined,
                command: (command) => input.current?.command(command) ?? false,
                scrollToBottom: () => undefined,
            }),
        [focusKey],
    );

    const toggleSubscribed = (next: boolean) => {
        if (!threads) return;
        if (next) threads.subscribeThread?.(rootId);
        else if (threads.unsubscribeThread) threads.unsubscribeThread(rootId);
        else threads.threads?.delete(rootId);
        setSubscribed(next);
    };

    const press = (event: ChatListPressEvent) => {
        if (event.button !== "left") return;
        if (event.target === "user" && event.login) {
            services.openOverlay({ kind: "userCard", login: event.login, channel, x: event.x, y: event.y });
            return;
        }
        if (event.target === "link" && event.url && !event.url.startsWith("chatterino://")) services.openUrl(event.url);
    };

    const left = x === undefined ? undefined : Math.max(0, Math.min(x - OFFSET_X, screen.width - WIDTH));
    const top = y === undefined ? undefined : Math.max(0, Math.min(y - OFFSET_Y, screen.height - HEIGHT));

    return (
        <FloatingWindow testID="thread-popup" title={title} width={WIDTH} height={HEIGHT} x={left} y={top} onClose={onClose}>
            <View style={{ flex: 1, padding: 1 }}>
                {showSubscribe ? (
                    <View style={{ flexDirection: "row", paddingLeft: 10, paddingBottom: 4 }}>
                        <Checkbox testID="thread-subscribe" label="Subscribe to thread" checked={subscribed} onChange={toggleSubscribed} />
                    </View>
                ) : null}
                <View style={{ flex: 1, minHeight: 100 }}>
                    <FeedList testID="thread-messages" messages={messages} subscribe={subscribe} onPress={press} />
                </View>
                <SplitInput
                    ref={input}
                    splitId={focusKey}
                    channel={source}
                    channelName={channel}
                    focusKey={focusKey}
                    fixedReply={target}
                    placeholder={placeholder}
                />
            </View>
        </FloatingWindow>
    );
}
