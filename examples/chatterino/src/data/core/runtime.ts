import type { SocketFactory, SocketLike, Timers } from "../irc/connection";
import { memoryStorage, type StorageLike } from "../persistence";

export function defaultTimers(): Timers {
    return {
        setTimeout: (callback, ms) => setTimeout(callback, ms),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        now: () => Date.now(),
    };
}

export function defaultSocketFactory(): SocketFactory {
    return (url) => new (globalThis as unknown as { WebSocket: new (url: string) => SocketLike }).WebSocket(url);
}

export function defaultStorage(): StorageLike {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    return storage ?? memoryStorage();
}

export function channelKey(name: string): string {
    return name.trim().replace(/^#/, "").toLowerCase();
}

export function waitAtMost(promise: Promise<unknown>, ms: number, timers: Timers): Promise<void> {
    return new Promise((resolve) => {
        const timer = timers.setTimeout(resolve, ms);
        const finish = () => {
            timers.clearTimeout(timer);
            resolve();
        };
        promise.then(finish, finish);
    });
}
