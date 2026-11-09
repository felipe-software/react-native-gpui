import {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import Reconciler from "./reconciler";
import { applyWindowFocus } from "./app-state";
import { WindowContext, type WindowContextValue } from "./window-context";
import {
    createWindowHost,
    type WindowCloseReason,
    type WindowHostEvent,
    type WindowKind,
    type WindowPosition,
    type WindowSpec,
} from "./window-host";

export type WindowCloseEvent = { reason: WindowCloseReason };

export interface WindowProps {
    title?: string;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    position?: WindowPosition;
    kind?: WindowKind;
    resizable?: boolean;
    alwaysOnTop?: boolean;
    closeOnBlur?: boolean;
    closeOnEscape?: boolean;
    testID?: string;
    onClose?: (event: WindowCloseEvent) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onResize?: (size: { width: number; height: number }) => void;
    children?: ReactNode;
}

export interface WindowHandle {
    readonly windowId: number;
    focus(): void;
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;

function defaultPosition(kind: WindowKind): WindowPosition {
    return kind === "popup" ? "cursor" : "center";
}

function windowSpec(props: WindowProps): WindowSpec {
    const kind = props.kind ?? "normal";
    return {
        title: props.title ?? "",
        width: props.width ?? DEFAULT_WIDTH,
        height: props.height ?? DEFAULT_HEIGHT,
        minWidth: props.minWidth,
        minHeight: props.minHeight,
        position: props.position ?? defaultPosition(kind),
        kind,
        resizable: props.resizable,
        alwaysOnTop: props.alwaysOnTop,
        closeOnBlur: props.closeOnBlur,
        closeOnEscape: props.closeOnEscape,
        testID: props.testID,
    };
}

export const Window = forwardRef<WindowHandle, WindowProps>(function Window(props, ref) {
    const initialWidth = props.width ?? DEFAULT_WIDTH;
    const initialHeight = props.height ?? DEFAULT_HEIGHT;
    const [host] = useState(() => createWindowHost(initialWidth, initialHeight));
    const latest = useRef(props);
    latest.current = props;
    const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
    const [focused, setFocused] = useState(false);
    const [closedItself, setClosedItself] = useState(false);
    const specKey = JSON.stringify(windowSpec(props));
    const openedSpecKey = useRef<string | null>(null);

    useLayoutEffect(() => {
        const onEvent = (event: WindowHostEvent) => {
            const current = latest.current;
            const hasSize = typeof event.width === "number" && typeof event.height === "number";
            if ((event.event === "open" || event.event === "resize") && hasSize) {
                const next = { width: event.width as number, height: event.height as number };
                host.container.width = next.width;
                host.container.height = next.height;
                setSize(next);
                if (event.event === "resize") current.onResize?.(next);
                return;
            }
            if (event.event === "focus" || event.event === "blur") {
                const isFocused = event.event === "focus";
                setFocused(isFocused);
                applyWindowFocus(host.windowId, isFocused);
                if (isFocused) current.onFocus?.();
                else current.onBlur?.();
                return;
            }
            if (event.event === "close") {
                const reason = event.reason ?? "system";
                if (current.onClose) {
                    current.onClose({ reason });
                    return;
                }
                host.close();
                setClosedItself(true);
            }
        };
        openedSpecKey.current = specKey;
        host.open(JSON.parse(specKey) as WindowSpec, onEvent);
        return () => {
            host.close();
            applyWindowFocus(host.windowId, false);
        };
    }, [host]);

    useLayoutEffect(() => {
        if (openedSpecKey.current === specKey) return;
        openedSpecKey.current = specKey;
        host.update(JSON.parse(specKey) as WindowSpec);
    }, [host, specKey]);

    useImperativeHandle(
        ref,
        () => ({
            windowId: host.windowId,
            focus: () => host.focus(),
        }),
        [host],
    );

    const context = useMemo<WindowContextValue>(
        () => ({ windowId: host.windowId, width: size.width, height: size.height, focused }),
        [host, size.width, size.height, focused],
    );

    if (closedItself) return null;
    const content = createElement(WindowContext.Provider, { value: context }, props.children ?? null);
    return (Reconciler as unknown as {
        createPortal(children: ReactNode, container: unknown, implementation: unknown, key: string | null): ReactNode;
    }).createPortal(content, host.container, null, null);
});

export type { WindowCloseReason, WindowKind, WindowPosition } from "./window-host";
