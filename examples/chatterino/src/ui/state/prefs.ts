import type { Store } from "../../data/api";

export type TabVisibility = "all" | "live" | "none";

export type UiPrefs = {
    showMessageLength: boolean;
    showTabCloseButton: boolean;
    showTabLive: boolean;
    tabVisibility: TabVisibility;
    lockTabs: boolean;
    fadeMessageHistory: boolean;
    mutedTabs: string[];
};

const KEY = "chatterino-gpui/v1/ui";

const DEFAULTS: UiPrefs = {
    showMessageLength: false,
    showTabCloseButton: true,
    showTabLive: true,
    tabVisibility: "all",
    lockTabs: false,
    fadeMessageHistory: true,
    mutedTabs: [],
};

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function storage(): StorageLike | undefined {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
}

function load(): UiPrefs {
    try {
        const raw = storage()?.getItem(KEY);
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw) as Partial<UiPrefs>;
        return { ...DEFAULTS, ...parsed, mutedTabs: Array.isArray(parsed.mutedTabs) ? parsed.mutedTabs : [] };
    } catch {
        return DEFAULTS;
    }
}

export function createPrefsStore(): Store<UiPrefs> {
    let value = load();
    const listeners = new Set<(value: UiPrefs) => void>();
    return {
        get: () => value,
        set(next) {
            const resolved = typeof next === "function" ? (next as (current: UiPrefs) => UiPrefs)(value) : next;
            if (resolved === value) return;
            value = resolved;
            try {
                storage()?.setItem(KEY, JSON.stringify(value));
            } catch {}
            for (const listener of [...listeners]) listener(value);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
