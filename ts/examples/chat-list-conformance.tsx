import { useEffect, useRef } from "react";
import {
    AppRegistry,
    ChatList,
    Pressable,
    Text,
    View,
    type ChatListElement,
    type ChatListHandle,
    type ChatListMessage,
} from "../src/index";

const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url).pathname;
const EMOTE = asset("chat-emote.png");
const BADGE = asset("chat-badge.png");
const ZERO_WIDTH = asset("chat-zero-width.png");
const ANIMATED = asset("chat-emote-animated.gif");

const LONG_WORD = "Supercalifragilisticexpialidocious".repeat(3);

const DARK = {
    page: "#101010",
    control: "#2a2a2a",
    controlText: "#dddddd",
    list: "#191919",
    text: "#e6e6e6",
    muted: "#8c7f7f",
    link: "#4286f4",
    selection: "rgba(255, 255, 255, 0.25)",
    scrollbar: "#575757",
    highlight: "#3a1f1f",
};
const LIGHT = {
    page: "#e9e9e9",
    control: "#d4d4d4",
    controlText: "#222222",
    list: "#fafafa",
    text: "#111111",
    muted: "#6f6363",
    link: "#2a64c8",
    selection: "rgba(0, 0, 0, 0.25)",
    scrollbar: "#a8a8a8",
    highlight: "#fde2e2",
};
const THEME = process.env.CHAT_LIST_FIXTURE_THEME === "light" ? LIGHT : DARK;

function user(name: string, color: string): ChatListElement {
    return { kind: "user", text: `${name}:`, login: name, color };
}

function text(value: string, extra: Partial<Extract<ChatListElement, { kind: "text" }>> = {}): ChatListElement {
    return { kind: "text", text: value, ...extra };
}

function emote(name: string, url: string, extra: Partial<Extract<ChatListElement, { kind: "emote" }>> = {}): ChatListElement {
    return { kind: "emote", name, url, width: 28, height: 28, tooltip: `${name} tooltip`, ...extra };
}

function filler(id: string, index: number): ChatListMessage {
    return {
        id,
        timestamp: `12:${String(index % 60).padStart(2, "0")}`,
        elements: [user(`viewer${index}`, "#7ad4ff"), text(`filler message number ${index}`)],
    };
}

const INITIAL: ChatListMessage[] = [
    {
        id: "m-first",
        timestamp: "12:00",
        marker: "#ff2d2d",
        elements: [
            { kind: "badge", name: "moderator", url: BADGE, width: 18, height: 18, tooltip: "Moderator" },
            user("alice", "#ff4040"),
            text("hello world"),
            emote("Kappa", EMOTE),
        ],
    },
    {
        id: "m-wrap",
        timestamp: "12:01",
        elements: [
            user("bob", "#40ff80"),
            text("this message is long enough that it has to wrap across several lines inside the chat list box"),
            text(LONG_WORD),
        ],
    },
    {
        id: "m-reply",
        timestamp: "12:02",
        reply: [text("Replying to"), { kind: "user", text: "@alice:", login: "alice", color: "#ff4040" }, text("hello world")],
        elements: [user("carol", "#ffd040"), text("replying with a short line")],
    },
    {
        id: "m-zero",
        timestamp: "12:03",
        elements: [user("dave", "#c080ff"), emote("Base", EMOTE), emote("Cover", ZERO_WIDTH, { zeroWidth: true }), text("after")],
    },
    {
        id: "m-link",
        timestamp: "12:04",
        background: THEME.highlight,
        elements: [user("erin", "#80c0ff"), text("visit"), text("https://example.com/page", { link: "https://example.com/page" })],
    },
    {
        id: "m-animated",
        timestamp: "12:05",
        elements: [user("frank", "#ff80c0"), emote("Party", ANIMATED), text("animated")],
    },
    {
        id: "m-disabled",
        timestamp: "12:06",
        disabled: true,
        elements: [user("gina", "#9a9a9a"), text("deleted message")],
    },
    {
        id: "m-history",
        timestamp: "12:07",
        historical: true,
        marker: "#2dff6a",
        elements: [user("hank", "#9a9a9a"), text("old message from history")],
    },
];

let appended = 0;
let prepended = 0;

function log(kind: string, payload: unknown) {
    console.log(`CHAT_EVENT ${JSON.stringify({ kind, payload })}`);
}

function renderControl(id: string, label: string, onPress: () => void) {
    return (
        <Pressable
            key={id}
            testID={id}
            onPress={onPress}
            style={{ height: 22, paddingHorizontal: 6, justifyContent: "center", backgroundColor: THEME.control }}
        >
            <Text style={{ color: THEME.controlText, fontSize: 11 }}>{label}</Text>
        </Pressable>
    );
}

function App() {
    const list = useRef<ChatListHandle>(null);
    const appendMany = (count: number) => {
        const batch: ChatListMessage[] = [];
        for (let i = 0; i < count; i++) {
            appended += 1;
            batch.push(filler(`m-new-${appended}`, appended));
        }
        list.current?.append(batch);
        console.log(`CHAT_CONTROL appended=${appended}`);
    };
    const prependMany = (count: number) => {
        const batch: ChatListMessage[] = [];
        for (let i = count; i > 0; i--) batch.push(filler(`m-old-${prepended + i}`, prepended + i));
        prepended += count;
        list.current?.prepend(batch);
        console.log(`CHAT_CONTROL prepended=${prepended}`);
    };
    useEffect(() => {
        list.current?.append(INITIAL);
        console.log("CHAT_READY");
    }, []);
    return (
        <View style={{ flex: 1, backgroundColor: THEME.page }}>
            <View style={{ flexDirection: "row", gap: 4, padding: 4, height: 30 }}>
                {renderControl("ctl-append-1", "+1", () => appendMany(1))}
                {renderControl("ctl-append-20", "+20", () => appendMany(20))}
                {renderControl("ctl-prepend-20", "prepend 20", () => prependMany(20))}
                {renderControl("ctl-bottom", "bottom", () => list.current?.scrollToBottom())}
                {renderControl("ctl-patch", "patch", () => list.current?.update([{ id: "m-first", disabled: true }]))}
            </View>
            <ChatList
                ref={list}
                testID="chat"
                style={{ position: "absolute", left: 20, top: 40, width: 420, height: 320, backgroundColor: THEME.list }}
                fontSize={13}
                showTimestamps
                textColor={THEME.text}
                mutedColor={THEME.muted}
                linkColor={THEME.link}
                selectionColor={THEME.selection}
                scrollbarColor={THEME.scrollbar}
                maxMessages={80}
                pauseOnHover
                onPress={(event) => log("press", event.nativeEvent)}
                onHover={(event) => log("hover", event.nativeEvent)}
                onScrollState={(event) => log("scroll", event.nativeEvent)}
            />
            <Pressable
                testID="overlay"
                onPress={() => console.log("CHAT_OVERLAY_PRESS")}
                style={{ position: "absolute", left: 330, top: 118, width: 60, height: 22, backgroundColor: "#2d4a7a" }}
            />
        </View>
    );
}

AppRegistry.registerComponent("ChatListConformance", () => App);
AppRegistry.runApplication("ChatListConformance", { width: 640, height: 400 });
