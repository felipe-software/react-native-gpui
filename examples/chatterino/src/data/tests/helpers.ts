import type { ChannelEvent, Settings } from "../api";
import { parseIvrBadges } from "../badges/twitch";
import { ChatChannel } from "../channel/chat-channel";
import { parseBttvChannel, parseBttvGlobal } from "../emotes/bttv";
import { parseFfzChannel, parseFfzGlobal } from "../emotes/ffz";
import { parseSeventvChannel, parseSeventvGlobal } from "../emotes/seventv";
import { buildHighlightChecker } from "../filters/highlights";
import { buildIgnoreFilter } from "../filters/ignores";
import { defaultSettings } from "../defaults";
import { parseIrcLine, type IrcMessage } from "../irc/message";
import type { FetchLike, FetchResponse } from "../util/http";
import api from "./fixtures/api.json";

export type ManualTimers = {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    now(): number;
    advance(ms: number): void;
    pending(): number;
};

export function manualTimers(start = Date.UTC(2026, 10, 8, 16, 0, 0)): ManualTimers {
    let now = start;
    let nextId = 0;
    const queue = new Map<number, { at: number; callback: () => void }>();
    return {
        setTimeout(callback, ms) {
            nextId += 1;
            queue.set(nextId, { at: now + Math.max(0, ms), callback });
            return nextId;
        },
        clearTimeout(handle) {
            queue.delete(handle as number);
        },
        now: () => now,
        advance(ms) {
            const target = now + ms;
            for (;;) {
                let earliest: [number, { at: number; callback: () => void }] | undefined;
                for (const entry of queue) {
                    if (entry[1].at <= target && (!earliest || entry[1].at < earliest[1].at)) earliest = entry;
                }
                if (!earliest) break;
                queue.delete(earliest[0]);
                now = earliest[1].at;
                earliest[1].callback();
            }
            now = target;
        },
        pending: () => queue.size,
    };
}

export function irc(line: string): IrcMessage {
    const parsed = parseIrcLine(line);
    if (!parsed) throw new Error(`unparseable line: ${line}`);
    return parsed;
}

export const globalEmoteSets = {
    bttv: parseBttvGlobal([
        ...(api.bttvGlobal as unknown[]),
        { id: "5e76d338d6581c3724c0f0b2", code: "SoSnowy", imageType: "gif", animated: true },
    ]),
    ffz: parseFfzGlobal(api.ffzGlobal),
    seventv: parseSeventvGlobal(api.seventvGlobal),
};

export const globalBadges = parseIvrBadges(api.badgesGlobal);

export type TestChannel = {
    channel: ChatChannel;
    events: ChannelEvent[];
    timers: ManualTimers;
    settings: { value: Settings };
    selfLogin: { value: string | undefined };
};

export function testChannel(name = "forsen", options: { settings?: Partial<Settings>; selfLogin?: string } = {}): TestChannel {
    const timers = manualTimers();
    const settings = { value: { ...defaultSettings("linux"), ...options.settings } };
    const selfLogin = { value: options.selfLogin };
    const channel = new ChatChannel(name, {
        fetch: notFoundFetch,
        timers,
        settings: () => settings.value,
        global: () => ({
            selfLogin: selfLogin.value,
            ignores: buildIgnoreFilter(settings.value),
            highlights: buildHighlightChecker(settings.value, selfLogin.value),
            now: () => timers.now(),
        }),
        globalEmotes: () => globalEmoteSets,
        globalBadges: () => globalBadges,
        userBadges: () => [],
        renderOptions: () => ({
            theme: settings.value.theme,
            timestampFormat: settings.value.timestampFormat,
            showBadges: settings.value.showBadges,
            hideModerated: !settings.value.showDeletedMessages,
        }),
        send: async () => ({ ok: false, reason: "not in tests" }),
        onMessage: () => undefined,
        onMessageChanged: () => undefined,
        twitchEmotes: () => [],
    });
    channel.emoteSets.bttv = parseBttvChannel(api.bttvChannel, "forsen");
    const ffz = parseFfzChannel(api.ffzRoom);
    channel.emoteSets.ffz = ffz.emotes;
    channel.emoteSets.seventv = parseSeventvChannel(api.seventvChannel);
    channel.emoteSets.badges = parseIvrBadges(api.badgesChannel);
    const events: ChannelEvent[] = [];
    channel.subscribe((event) => events.push(event));
    return { channel, events, timers, settings, selfLogin };
}

function response(status: number, body: string): FetchResponse {
    return {
        ok: status < 400,
        status,
        text: async () => body,
        json: async () => JSON.parse(body),
    };
}

export const notFoundFetch: FetchLike = async () => response(404, "{}");

export type FetchRoute = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
    | { status?: number; body: unknown }
    | undefined;

export function routedFetch(routes: FetchRoute[]): FetchLike & { calls: string[] } {
    const calls: string[] = [];
    const fn = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        for (const route of routes) {
            const result = route(url, init);
            if (result) {
                const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
                return response(result.status ?? 200, body);
            }
        }
        return response(404, '{"error":"not found"}');
    }) as FetchLike & { calls: string[] };
    fn.calls = calls;
    return fn;
}

export class FakeSocket {
    static instances: FakeSocket[] = [];
    readyState = 0;
    sent: string[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(readonly url: string) {
        FakeSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
    }

    open(): void {
        this.readyState = 1;
        this.onopen?.({});
    }

    receive(...lines: string[]): void {
        this.onmessage?.({ data: lines.map((line) => `${line}\r\n`).join("") });
    }

    drop(): void {
        this.readyState = 3;
        this.onclose?.({ code: 1006 });
    }
}

export function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

type LooseElement = { kind: string; text?: string; name?: string; trailingSpace?: boolean };

export function texts(elements: LooseElement[]): string {
    let out = "";
    for (const element of elements) {
        out += element.text ?? `<${element.kind}:${element.name}>`;
        if (element.trailingSpace !== false) out += " ";
    }
    return out.trimEnd();
}
