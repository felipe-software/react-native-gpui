export type InternalLink =
    | { type: "accounts" }
    | { type: "reconnect" }
    | { type: "channel"; name: string }
    | { type: "message"; id: string }
    | { type: "thread"; rootId: string };

const PREFIX = "chatterino://";

export function channelLink(name: string): string {
    return `${PREFIX}channel/${name}`;
}

export function threadLink(rootId: string): string {
    return `${PREFIX}thread/${rootId}`;
}

export function parseInternalLink(url: string): InternalLink | undefined {
    if (!url.startsWith(PREFIX)) return undefined;
    const [kind, ...rest] = url.slice(PREFIX.length).split("/");
    const value = decodeURIComponent(rest.join("/"));
    switch (kind) {
        case "accounts":
            return { type: "accounts" };
        case "reconnect":
            return { type: "reconnect" };
        case "channel":
            return value ? { type: "channel", name: value } : undefined;
        case "message":
            return value ? { type: "message", id: value } : undefined;
        case "thread":
            return value ? { type: "thread", rootId: value } : undefined;
        default:
            return undefined;
    }
}
