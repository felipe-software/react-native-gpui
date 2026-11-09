import {
    createWindowContainer,
    pushWindowTree,
    registerWindowContainer,
    unregisterWindowContainer,
    type Container,
} from "./reconciler";
import { sendHostCommand, type SerializedNode } from "./runtime";
import { sameTopLevelTree, sharedWireSources, toWireDelta, type BigFieldCache } from "./wire-delta";

export type WindowKind = "normal" | "dialog" | "popup";

export type WindowPosition =
    | "center"
    | "cursor"
    | { x: number; y: number; relativeTo?: "parent" | "screen" | "cursor" };

export type WindowCloseReason = "system" | "escape" | "blur" | "error";

export type WindowSpec = {
    title: string;
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    position: WindowPosition;
    kind: WindowKind;
    resizable?: boolean;
    alwaysOnTop?: boolean;
    closeOnBlur?: boolean;
    closeOnEscape?: boolean;
    testID?: string;
};

export type WindowHostEvent = {
    windowId: number;
    event: "open" | "resize" | "close" | "focus" | "blur";
    width?: number;
    height?: number;
    reason?: WindowCloseReason;
};

export interface WindowHost {
    readonly windowId: number;
    readonly container: Container;
    open(spec: WindowSpec, onEvent: (event: WindowHostEvent) => void): void;
    update(spec: WindowSpec): void;
    focus(): void;
    close(): void;
    readonly closed: boolean;
}

let nextWindowId = 1;
const handlers = new Map<number, (event: WindowHostEvent) => void>();

export function dispatchWindowEvent(event: WindowHostEvent) {
    handlers.get(event.windowId)?.(event);
}

export function openWindowIds(): number[] {
    return [...handlers.keys()];
}

export function createWindowHost(width: number, height: number): WindowHost {
    const windowId = nextWindowId++;
    const container = createWindowContainer(windowId, width, height);
    const sent = new WeakSet<SerializedNode>();
    const bigFields: BigFieldCache = new Map();
    let lastTree: SerializedNode | null = null;
    let state: "idle" | "open" | "closed" = "idle";

    const push = (tree: SerializedNode) => {
        if (state !== "open") return;
        if (lastTree && sameTopLevelTree(tree, lastTree)) return;
        const wire = toWireDelta(tree, sent, bigFields, undefined, sharedWireSources);
        lastTree = tree;
        sendHostCommand({ ...wire, $window: windowId });
    };

    return {
        windowId,
        container,
        get closed() {
            return state === "closed";
        },
        open(spec, onEvent) {
            if (state !== "idle") return;
            state = "open";
            handlers.set(windowId, onEvent);
            sendHostCommand({ $cmd: "windowOpen", windowId, ...spec });
            registerWindowContainer(container, push);
            pushWindowTree(windowId);
        },
        update(spec) {
            if (state !== "open") return;
            sendHostCommand({ $cmd: "windowUpdate", windowId, ...spec });
        },
        focus() {
            if (state !== "open") return;
            sendHostCommand({ $cmd: "windowFocus", windowId });
        },
        close() {
            if (state === "closed") return;
            const wasOpen = state === "open";
            state = "closed";
            handlers.delete(windowId);
            unregisterWindowContainer(windowId);
            if (wasOpen) sendHostCommand({ $cmd: "windowClose", windowId });
        },
    };
}
