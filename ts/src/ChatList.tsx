import { createElement, forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { ChatListHandle, ChatListProps } from "./chat-list-types";
import { sendCommand } from "./commands";
import { createHostCommandId } from "./components";

export const ChatList = forwardRef<ChatListHandle, ChatListProps>(function ChatList(props, ref) {
    const commandIdRef = useRef<number | null>(null);
    if (commandIdRef.current == null) commandIdRef.current = createHostCommandId();
    const id = commandIdRef.current;
    const handle = useMemo<ChatListHandle>(
        () => ({
            append(messages) {
                if (messages.length > 0) sendCommand({ $cmd: "chatList", id, op: "append", messages });
            },
            prepend(messages) {
                if (messages.length > 0) sendCommand({ $cmd: "chatList", id, op: "prepend", messages });
            },
            update(patches) {
                if (patches.length > 0) sendCommand({ $cmd: "chatList", id, op: "update", patches });
            },
            clear() {
                sendCommand({ $cmd: "chatList", id, op: "clear" });
            },
            scrollToBottom() {
                sendCommand({ $cmd: "chatList", id, op: "scrollToBottom" });
            },
            scrollToTop() {
                sendCommand({ $cmd: "chatList", id, op: "scrollToTop" });
            },
            scrollToMessage(messageId, options) {
                sendCommand({ $cmd: "chatList", id, op: "scrollToMessage", messageId, align: options?.align });
            },
            pageUp() {
                sendCommand({ $cmd: "chatList", id, op: "page", direction: -1 });
            },
            pageDown() {
                sendCommand({ $cmd: "chatList", id, op: "page", direction: 1 });
            },
        }),
        [id],
    );
    useImperativeHandle(ref, () => handle, [handle]);
    const { onPress, onHover, onScrollState, ...hostProps } = props;
    return createElement("ChatList" as never, {
        ...hostProps,
        onChatListPress: onPress,
        onChatListHover: onHover,
        onChatListScroll: onScrollState,
        __rngpuiHostId: id,
    });
});
