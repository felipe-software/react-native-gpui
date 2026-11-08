import { useEffect, useRef } from "react";
import { View } from "react-native-gpui";
import type { SplitLeaf } from "../../data/api";
import type { Rect } from "../layout/geometry";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { useChannel, useChannelInfo } from "../state/useChannel";
import { ChatView, type ChatViewHandle } from "./ChatView";
import { SplitHeader } from "./SplitHeader";
import { SplitInput, type SplitInputHandle } from "./SplitInput";

type Props = {
    split: SplitLeaf;
    tabId: string;
    rect: Rect;
    pageOrigin: { x: number; y: number };
    focused: boolean;
    isTopRight: boolean;
    ghost: boolean;
};

export function SplitView({ split, tabId, rect, pageOrigin, focused, isTopRight, ghost }: Props) {
    const services = useApp();
    const { core, theme, actions } = services;
    const channel = useChannel(core, split.channel);
    const info = useChannelInfo(channel, services.channelInfos);
    const input = useRef<SplitInputHandle>(null);
    const chat = useRef<ChatViewHandle>(null);

    useEffect(
        () =>
            inputRegistry.register(split.id, {
                focus: () => input.current?.focus(),
                insert: (text) => input.current?.insert(text),
                mention: (name) => input.current?.mention(name),
                command: (command) => input.current?.command(command) ?? false,
                scrollToBottom: () => chat.current?.scrollToBottom(),
            }),
        [split.id],
    );

    const headerRect: Rect = { x: pageOrigin.x + rect.x + 1, y: pageOrigin.y + rect.y + 1, width: rect.width - 2, height: 28 };

    return (
        <View
            testID={`split-${split.id}`}
            accessibilityLabel={split.channel || "<empty>"}
            style={{
                position: "absolute",
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                padding: 1,
                backgroundColor: theme.splits.background,
                opacity: ghost ? 0 : 1,
                zIndex: ghost ? -1 : 0,
            }}
            onMouseDown={() => actions.focusSplit(split.id)}
        >
            <SplitHeader
                split={split}
                tabId={tabId}
                info={info}
                focused={focused}
                isTopRight={isTopRight}
                rect={headerRect}
                onClear={() => channel?.clear()}
            />
            <ChatView ref={chat} channel={channel} splitId={split.id} tabId={tabId} channelName={split.channel} />
            <SplitInput ref={input} splitId={split.id} channel={channel} channelName={split.channel} />
        </View>
    );
}
