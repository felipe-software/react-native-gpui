import type { Store } from "./api";

export function createStore<T>(initial: T, onChange?: (value: T, previous: T) => void): Store<T> {
    let value = initial;
    const listeners = new Set<(value: T) => void>();
    return {
        get: () => value,
        set(next) {
            const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
            if (Object.is(resolved, value)) return;
            const previous = value;
            value = resolved;
            onChange?.(value, previous);
            for (const listener of [...listeners]) {
                try {
                    listener(value);
                } catch (error) {
                    console.error("store listener failed", error);
                }
            }
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
