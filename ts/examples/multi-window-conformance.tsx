import { useEffect, useRef, useState } from "react";
import {
    AppRegistry,
    AppState,
    NativeClipboard,
    Text,
    View,
    Window,
    type ChatListHandle,
    type ChatListMessage,
    type WindowCloseEvent,
} from "../src/index";
import { ChatWindowContent } from "./multi-window/ChatWindowContent";
import { DialogContent } from "./multi-window/DialogContent";
import { FixtureButton } from "./multi-window/FixtureButton";
import { PressDragRow } from "./multi-window/PressDragRow";
import { COLORS, log, message } from "./multi-window/shared";

function App() {
    const [count, setCount] = useState(0);
    const [text, setText] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [popupOpen, setPopupOpen] = useState(false);
    const [clipboard, setClipboard] = useState("");
    const [appState, setAppState] = useState(AppState.currentState);
    const chatRef = useRef<ChatListHandle | null>(null);
    const nextMessage = useRef(0);

    useEffect(() => {
        log("ready");
        console.log("MW_READY");
        const subscription = AppState.addEventListener("change", (state) => {
            setAppState(state);
            log("appState", { state });
        });
        return () => subscription.remove();
    }, []);

    const appendMessages = (amount: number) => {
        const batch: ChatListMessage[] = [];
        for (let index = 0; index < amount; index++) batch.push(message(nextMessage.current++));
        chatRef.current?.append(batch);
        log("appended", { total: nextMessage.current });
    };

    const closeDialog = (event?: WindowCloseEvent) => {
        log("dialogClose", { reason: event?.reason ?? "button" });
        setDialogOpen(false);
    };

    return (
        <View
            testID="main-root"
            style={{ flex: 1, backgroundColor: COLORS.page, padding: 12 }}
            onKeyPress={(event: { key?: string; ctrlKey?: boolean }) => log("keyPress", { key: event.key, ctrlKey: event.ctrlKey })}
            onKeyUp={(event) => log("keyUp", { key: event.key, ctrlKey: event.ctrlKey })}
        >
            <Text testID="main-count" style={{ color: COLORS.text, fontSize: 14 }}>{`count: ${count}`}</Text>
            <Text testID="main-text" style={{ color: COLORS.text, fontSize: 14 }}>{`text: ${text}`}</Text>
            <Text testID="main-clipboard" style={{ color: COLORS.text, fontSize: 14 }}>{`clipboard: ${clipboard}`}</Text>
            <Text testID="main-app-state" style={{ color: COLORS.text, fontSize: 14 }}>{`app: ${appState}`}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                <FixtureButton testID="open-dialog" label="Dialog" onPress={() => setDialogOpen(true)} />
                <FixtureButton testID="open-chat" label="Chat window" onPress={() => setChatOpen(true)} />
                <FixtureButton testID="open-popup" label="Popup" onPress={() => setPopupOpen(true)} />
                <FixtureButton testID="append" label="Append" onPress={() => appendMessages(5)} />
                <FixtureButton testID="increment" label="Increment" onPress={() => setCount((value) => value + 1)} />
                <FixtureButton
                    testID="read-clipboard"
                    label="Read clipboard"
                    onPress={() => {
                        NativeClipboard.read().then((value) => {
                            setClipboard(value);
                            log("clipboard", { value });
                        });
                    }}
                />
                <FixtureButton testID="chat-top" label="Top" onPress={() => chatRef.current?.scrollToTop()} />
                <FixtureButton testID="chat-reveal" label="Reveal m-3" onPress={() => chatRef.current?.scrollToMessage("m-3", { align: "top" })} />
                <FixtureButton testID="chat-page-up" label="Page up" onPress={() => chatRef.current?.pageUp()} />
                <FixtureButton testID="chat-page-down" label="Page down" onPress={() => chatRef.current?.pageDown()} />
                <FixtureButton
                    testID="close-all"
                    label="Close all"
                    onPress={() => {
                        setDialogOpen(false);
                        setChatOpen(false);
                        setPopupOpen(false);
                    }}
                />
            </View>
            <View style={{ flexDirection: "row", marginTop: 4 }}>
                <View>
                    <PressDragRow testID="drag-default" optOut={false} />
                    <PressDragRow testID="drag-opt-out" optOut />
                </View>
                <View
                    testID="middle-target"
                    onAuxClick={(event) => log("auxClick", { button: event.nativeEvent.button })}
                    style={{ width: 70, height: 58, marginLeft: 10, backgroundColor: "#4a3d52" }}
                />
                <View testID="transparent-host" style={{ width: 70, height: 58, marginLeft: 10, backgroundColor: "#ff0000", padding: 10 }}>
                    <View
                        testID="transparent-probe"
                        style={{ flex: 1, backgroundColor: "transparent", borderWidth: 4, borderColor: "transparent", borderRadius: 4 }}
                    >
                        <Text style={{ color: "transparent", fontSize: 12 }}>hidden</Text>
                    </View>
                </View>
            </View>
            {dialogOpen ? (
                <Window
                    testID="fixture-dialog"
                    kind="dialog"
                    title="Fixture Dialog"
                    width={360}
                    height={220}
                    minWidth={300}
                    minHeight={180}
                    onClose={closeDialog}
                    onFocus={() => log("dialogFocus")}
                    onBlur={() => log("dialogBlur")}
                >
                    <DialogContent
                        count={count}
                        text={text}
                        onIncrement={() => setCount((value) => value + 1)}
                        onText={setText}
                        onClose={() => closeDialog()}
                    />
                </Window>
            ) : null}
            {chatOpen ? (
                <Window
                    testID="fixture-chat"
                    kind="normal"
                    title="Fixture Chat"
                    width={420}
                    height={300}
                    position={{ x: 40, y: 40 }}
                    onClose={(event) => {
                        log("chatClose", { reason: event.reason });
                        setChatOpen(false);
                    }}
                >
                    <ChatWindowContent chatRef={chatRef} count={count} />
                </Window>
            ) : null}
            {popupOpen ? (
                <Window
                    testID="fixture-popup"
                    kind="popup"
                    width={200}
                    height={120}
                    position="cursor"
                    onClose={(event) => {
                        log("popupClose", { reason: event.reason });
                        setPopupOpen(false);
                    }}
                >
                    <View testID="popup-body" style={{ flex: 1, backgroundColor: COLORS.popup, padding: 8 }}>
                        <Text style={{ color: "#111111", fontSize: 13 }}>{`popup count: ${count}`}</Text>
                    </View>
                </Window>
            ) : null}
        </View>
    );
}

AppRegistry.registerComponent("MultiWindowConformance", () => App);
AppRegistry.runApplication("MultiWindowConformance", { width: 640, height: 420 });
