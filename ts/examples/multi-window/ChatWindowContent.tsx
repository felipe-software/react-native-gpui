import type { RefObject } from "react";
import { ChatList, Text, View, type ChatListHandle } from "../../src/index";
import { COLORS, log } from "./shared";

export function ChatWindowContent({ chatRef, count }: { chatRef: RefObject<ChatListHandle | null>; count: number }) {
    return (
        <View testID="chat-window-root" style={{ flex: 1, backgroundColor: COLORS.page }}>
            <Text testID="chat-window-count" style={{ color: COLORS.text, fontSize: 13, padding: 6 }}>{`chat window count: ${count}`}</Text>
            <ChatList
                ref={chatRef}
                testID="window-chat"
                style={{ flex: 1, backgroundColor: COLORS.chat }}
                textColor={COLORS.text}
                fontSize={13}
                showTimestamps
                onPress={(event) => log("chatPress", { ...event.nativeEvent })}
                onHover={(event) => log("chatHover", { ...(event.nativeEvent ?? { target: null }) })}
            />
        </View>
    );
}
