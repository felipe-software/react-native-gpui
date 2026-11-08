import { useEffect, useRef } from "react";
import { AppRegistry, ChatList, View, type ChatListElement, type ChatListHandle, type ChatListMessage } from "../src/index";

const env = (name: string, fallback: number) => {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
};

const LISTS = env("CHAT_STRESS_LISTS", 6);
const PREFILL = env("CHAT_STRESS_PREFILL", 1000);
const RATE = env("CHAT_STRESS_RATE", 20);
const ANIMATED_EVERY = env("CHAT_STRESS_ANIMATED_EVERY", 6);
const ANIMATE = env("CHAT_STRESS_ANIMATE", 1) !== 0;

const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url).pathname;
const EMOTE = asset("chat-emote.png");
const BADGE = asset("chat-badge.png");
const ANIMATED = asset("chat-emote-animated.gif");

const WORDS =
    "the quick brown fox jumps over lazy dogs while chat spams emotes and links about the stream tonight pog clip that"
        .split(" ");
const NAMES = ["alice", "bob", "carol", "dave", "erin", "frank", "gina", "hank", "ivy", "jules"];
const COLORS = ["#ff4040", "#40ff80", "#ffd040", "#c080ff", "#80c0ff", "#ff80c0", "#7ad4ff", "#ffa040"];

let sequence = 0;

function message(list: number): ChatListMessage {
    sequence += 1;
    const n = sequence;
    const name = NAMES[n % NAMES.length];
    const elements: ChatListElement[] = [];
    if (n % 3 === 0) elements.push({ kind: "badge", name: "subscriber", url: BADGE, width: 18, height: 18, tooltip: "Subscriber" });
    elements.push({ kind: "user", text: `${name}:`, login: name, color: COLORS[n % COLORS.length] });
    const length = 6 + (n % 14);
    for (let i = 0; i < length; i++) {
        const word = WORDS[(n * 7 + i * 3) % WORDS.length];
        if (i % 5 === 4) elements.push({ kind: "emote", name: "Kappa", url: EMOTE, width: 28, height: 28 });
        else elements.push({ kind: "text", text: word });
    }
    if (n % ANIMATED_EVERY === 0) elements.push({ kind: "emote", name: "Party", url: ANIMATED, width: 28, height: 28 });
    return {
        id: `l${list}-m${n}`,
        timestamp: `${12 + (Math.floor(n / 60) % 12)}:${String(n % 60).padStart(2, "0")}`,
        marker: n % 97 === 0 ? "#ff2d2d" : undefined,
        elements,
    };
}

function App() {
    const handles = useRef<Array<ChatListHandle | null>>([]);
    useEffect(() => {
        for (let list = 0; list < LISTS; list++) {
            const batch: ChatListMessage[] = [];
            for (let i = 0; i < PREFILL; i++) batch.push(message(list));
            handles.current[list]?.append(batch);
        }
        console.log(`CHAT_STRESS_READY lists=${LISTS} prefill=${PREFILL} rate=${RATE}`);
        if (RATE <= 0) return;
        let next = 0;
        const timer = setInterval(() => {
            const list = next % LISTS;
            next += 1;
            handles.current[list]?.append([message(list)]);
        }, 1000 / RATE);
        return () => clearInterval(timer);
    }, []);
    const columns = Math.ceil(LISTS / 2);
    return (
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", backgroundColor: "#0d0d0d", gap: 2 }}>
            {Array.from({ length: LISTS }, (_, list) => (
                <ChatList
                    key={list}
                    ref={(handle) => {
                        handles.current[list] = handle;
                    }}
                    testID={`stress-${list}`}
                    style={{ width: `${100 / columns - 0.5}%`, height: "49.5%", backgroundColor: "#191919" }}
                    showTimestamps
                    animateEmotes={ANIMATE}
                    maxMessages={1000}
                    alternateBackground="#1f1f1f"
                />
            ))}
        </View>
    );
}

AppRegistry.registerComponent("ChatListStress", () => App);
AppRegistry.runApplication("ChatListStress", { width: 1440, height: 900 });
