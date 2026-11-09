const DROPPED_COMMANDS = new Set(["PRIVMSG", "USERNOTICE", "CLEARCHAT", "CLEARMSG"]);
const TWITCH_WS_URL = "wss://irc-ws.chat.twitch.tv:443";
const TWITCH_TCP_HOST = "irc.chat.twitch.tv";
const TWITCH_TCP_PORT = 6697;

export function ircCommand(line) {
    let rest = line;
    if (rest.startsWith("@")) rest = rest.slice(rest.indexOf(" ") + 1);
    if (rest.startsWith(":")) rest = rest.slice(rest.indexOf(" ") + 1);
    return rest.split(" ", 1)[0];
}

export function keepLine(line) {
    return line.length > 0 && !DROPPED_COMMANDS.has(ircCommand(line));
}

function filterFrame(text) {
    const kept = text.split("\r\n").filter(keepLine);
    return kept.length > 0 ? `${kept.join("\r\n")}\r\n` : "";
}

function startWebSocketSide() {
    return Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request, server) {
            if (server.upgrade(request, { data: { queue: [], upstream: undefined } })) return undefined;
            return new Response("irc quiet proxy", { status: 400 });
        },
        websocket: {
            open(client) {
                const upstream = new WebSocket(TWITCH_WS_URL);
                client.data.upstream = upstream;
                upstream.onopen = () => {
                    for (const message of client.data.queue) upstream.send(message);
                    client.data.queue = [];
                };
                upstream.onmessage = (event) => {
                    const kept = filterFrame(String(event.data));
                    if (kept) client.send(kept);
                };
                upstream.onclose = () => client.close();
                upstream.onerror = () => client.close();
            },
            message(client, message) {
                const upstream = client.data.upstream;
                if (upstream?.readyState === WebSocket.OPEN) upstream.send(message);
                else client.data.queue.push(message);
            },
            close(client) {
                client.data.upstream?.close();
            },
        },
    });
}

function startTcpSide() {
    return Bun.listen({
        hostname: "127.0.0.1",
        port: 0,
        socket: {
            open(client) {
                client.data = { pending: [], buffer: "", upstream: undefined };
                Bun.connect({
                    hostname: TWITCH_TCP_HOST,
                    port: TWITCH_TCP_PORT,
                    tls: true,
                    socket: {
                        open(upstream) {
                            client.data.upstream = upstream;
                            for (const chunk of client.data.pending) upstream.write(chunk);
                            client.data.pending = [];
                        },
                        data(_upstream, chunk) {
                            client.data.buffer += chunk.toString();
                            const end = client.data.buffer.lastIndexOf("\n");
                            if (end < 0) return;
                            const complete = client.data.buffer.slice(0, end + 1);
                            client.data.buffer = client.data.buffer.slice(end + 1);
                            const kept = complete
                                .split("\n")
                                .map((line) => line.replace(/\r$/, ""))
                                .filter(keepLine);
                            if (kept.length > 0) client.write(`${kept.join("\r\n")}\r\n`);
                        },
                        close() {
                            client.end();
                        },
                        error() {
                            client.end();
                        },
                    },
                }).catch(() => client.end());
            },
            data(client, chunk) {
                const upstream = client.data.upstream;
                if (upstream) upstream.write(chunk);
                else client.data.pending.push(Buffer.from(chunk));
            },
            close(client) {
                client.data.upstream?.end();
            },
        },
    });
}

export function startQuietIrcProxy() {
    const ws = startWebSocketSide();
    const tcp = startTcpSide();
    return {
        wsUrl: `ws://127.0.0.1:${ws.port}`,
        tcpPort: tcp.port,
        stop() {
            ws.stop(true);
            tcp.stop(true);
        },
    };
}
