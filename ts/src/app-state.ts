import { useContext, useEffect, useState } from "react";
import { WindowContext } from "./window-context";

export type AppStateStatus = "active" | "inactive" | "background";

export type WindowFocusEvent = { windowId: number; focused: boolean };

type AppStateListenerMap = {
    change: (state: AppStateStatus) => void;
    focus: () => void;
    blur: () => void;
    windowFocus: (event: WindowFocusEvent) => void;
};
export type AppStateEventType = keyof AppStateListenerMap;

const listeners: { [K in AppStateEventType]: Set<AppStateListenerMap[K]> } = {
    change: new Set(),
    focus: new Set(),
    blur: new Set(),
    windowFocus: new Set(),
};

let currentState: AppStateStatus = "active";
let focusedWindowId: number | null = null;
const focusedWindows = new Set<number>();

export const AppState = {
    get currentState(): AppStateStatus {
        return currentState;
    },
    isAvailable: true,
    get focusedWindowId(): number | null {
        return focusedWindowId;
    },
    isWindowFocused(windowId = 0): boolean {
        return focusedWindows.has(windowId);
    },
    addEventListener<K extends AppStateEventType>(type: K, handler: AppStateListenerMap[K]): { remove: () => void } {
        const set = listeners[type] as Set<AppStateListenerMap[K]> | undefined;
        set?.add(handler);
        return { remove: () => set?.delete(handler) };
    },
    removeEventListener<K extends AppStateEventType>(type: K, handler: AppStateListenerMap[K]): void {
        (listeners[type] as Set<AppStateListenerMap[K]> | undefined)?.delete(handler);
    },
};

export function applyAppStateEvent(state: "active" | "inactive", windowId: number | null) {
    focusedWindowId = state === "active" ? windowId : null;
    if (state === currentState) return;
    currentState = state;
    for (const handler of listeners.change) handler(state);
    const edge = state === "active" ? listeners.focus : listeners.blur;
    for (const handler of edge) handler();
}

export function applyWindowFocus(windowId: number, focused: boolean) {
    const changed = focused ? !focusedWindows.has(windowId) : focusedWindows.has(windowId);
    if (!changed) return;
    if (focused) focusedWindows.add(windowId);
    else focusedWindows.delete(windowId);
    for (const handler of listeners.windowFocus) handler({ windowId, focused });
}

export function useAppState(): AppStateStatus {
    const [state, setState] = useState(currentState);
    useEffect(() => {
        setState(currentState);
        const subscription = AppState.addEventListener("change", setState);
        return () => subscription.remove();
    }, []);
    return state;
}

export function useWindowFocused(): boolean {
    const windowContext = useContext(WindowContext);
    const [mainFocused, setMainFocused] = useState(() => focusedWindows.has(0));
    useEffect(() => {
        if (windowContext) return;
        setMainFocused(focusedWindows.has(0));
        const subscription = AppState.addEventListener("windowFocus", (event) => {
            if (event.windowId === 0) setMainFocused(event.focused);
        });
        return () => subscription.remove();
    }, [windowContext === null]);
    if (windowContext) return windowContext.focused;
    return mainFocused;
}
