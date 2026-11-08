import { useRef, useState } from "react";
import { View, type MouseResponderEvent } from "react-native-gpui";
import { clampFraction, handleFraction, type HandleBox, type Rect } from "../layout/geometry";
import type { Theme } from "../theme";

type Props = {
    handle: HandleBox;
    expanded: boolean;
    pageOrigin: { x: number; y: number };
    theme: Theme;
    onResize: (fraction: number) => void;
    onReset: () => void;
    onActiveChange: (active: boolean) => void;
};

const DOUBLE_CLICK_MS = 400;
const THIN = 4;

function thinRect(rect: Rect, isVertical: boolean): Rect {
    if (isVertical) return { x: rect.x, y: rect.y + (rect.height - THIN) / 2, width: rect.width, height: THIN };
    return { x: rect.x + (rect.width - THIN) / 2, y: rect.y, width: THIN, height: rect.height };
}

export function ResizeHandle({ handle, expanded, pageOrigin, theme, onResize, onReset, onActiveChange }: Props) {
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const draggingRef = useRef(false);
    const lastDown = useRef(0);
    const isVertical = handle.axis === "vertical";
    const painted = expanded || hovered || dragging;
    const rect = painted ? handle.rect : thinRect(handle.rect, isVertical);

    const pointerOf = (event: MouseResponderEvent) => (isVertical ? event.nativeEvent.pageY - pageOrigin.y : event.nativeEvent.pageX - pageOrigin.x);

    const handleDown = (event: MouseResponderEvent) => {
        if (event.nativeEvent.pressDrag) return;
        const now = Date.now();
        const isDoubleClick = now - lastDown.current < DOUBLE_CLICK_MS;
        lastDown.current = now;
        if (isDoubleClick) {
            onReset();
            return;
        }
        draggingRef.current = true;
        setDragging(true);
        onActiveChange(true);
    };

    const handleMove = (event: MouseResponderEvent) => {
        if (!draggingRef.current) return;
        onResize(clampFraction(handle, handleFraction(handle, pointerOf(event))));
    };

    const handleUp = (event: MouseResponderEvent) => {
        if (event.nativeEvent.pressDrag) return;
        if (draggingRef.current) onResize(clampFraction(handle, handleFraction(handle, pointerOf(event))));
        draggingRef.current = false;
        setDragging(false);
        onActiveChange(false);
    };

    const lineStyle = isVertical
        ? { left: 0, right: 0, top: rect.height / 2 - 1, height: 2 }
        : { top: 0, bottom: 0, left: rect.width / 2 - 1, width: 2 };

    return (
        <View
            testID={`resize-${handle.containerId}-${handle.index}`}
            nativeListGroup={`resize-${handle.containerId}-${handle.index}`}
            style={{
                position: "absolute",
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                backgroundColor: painted ? theme.splits.resizeHandleBackground : undefined,
                cursor: isVertical ? "row-resize" : "col-resize",
                zIndex: 10,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onContextMenu={onReset}
        >
            {painted ? <View style={{ position: "absolute", ...lineStyle, backgroundColor: theme.splits.resizeHandle }} /> : null}
        </View>
    );
}
