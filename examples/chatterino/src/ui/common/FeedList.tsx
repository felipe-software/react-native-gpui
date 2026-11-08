import { useEffect, useRef } from "react";
import { ChatList, type ChatListHandle, type ChatListHoverEvent, type ChatListMessage, type ChatListPressEvent } from "react-native-gpui";
import { chatListProps } from "../splits/chatHelpers";
import { useApp } from "../state/AppContext";

type Props = {
    testID: string;
    messages: ChatListMessage[];
    subscribe?: (append: (messages: ChatListMessage[]) => void) => () => void;
    showTimestamps?: boolean;
    background?: string;
    onPress?: (event: ChatListPressEvent) => void;
    onHover?: (event: ChatListHoverEvent | null) => void;
};

export function FeedList({ testID, messages, subscribe, showTimestamps, background, onPress, onHover }: Props) {
    const { theme, fonts, settings, prefs } = useApp();
    const list = useRef<ChatListHandle>(null);

    useEffect(() => {
        const handle = list.current;
        if (!handle) return;
        handle.clear();
        handle.append(messages);
        handle.scrollToBottom();
        if (!subscribe) return;
        return subscribe((next) => handle.append(next));
    }, [messages, subscribe]);

    const props = chatListProps(theme, fonts, settings, prefs);
    return (
        <ChatList
            ref={list}
            testID={testID}
            style={{ flex: 1, backgroundColor: background ?? theme.messages.background }}
            {...props}
            showTimestamps={showTimestamps ?? props.showTimestamps}
            onPress={onPress ? ({ nativeEvent }) => onPress(nativeEvent) : undefined}
            onHover={onHover ? ({ nativeEvent }) => onHover(nativeEvent) : undefined}
        />
    );
}
