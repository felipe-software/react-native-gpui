import type { ChatListMessage } from "../../src/index";

export const COLORS = {
    page: "#14161a",
    button: "#2d3340",
    text: "#e8e8e8",
    dialog: "#2a8cff",
    chat: "#1c1c1c",
    popup: "#e0a030",
};

export function log(kind: string, payload: Record<string, unknown> = {}) {
    console.log(`MW_EVENT ${JSON.stringify({ kind, ...payload })}`);
}

export function message(index: number): ChatListMessage {
    return {
        id: `m-${index}`,
        timestamp: "12:00",
        elements: [
            { kind: "user", text: "viewer:", login: "viewer", color: "#ff7f50" },
            { kind: "text", text: `message number ${index}` },
        ],
    };
}
