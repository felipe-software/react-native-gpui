import type { Store } from "../../data/api";

export function createUiStore<T>(initial: T): Store<T> {
    let value = initial;
    const listeners = new Set<(value: T) => void>();
    return {
        get: () => value,
        set(next) {
            const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
            if (Object.is(resolved, value)) return;
            value = resolved;
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
