import { useRef } from "react";
import type { MouseResponderEvent } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { resolveDropTarget } from "../state/dragDrop";
import { hitAreas } from "../state/hitAreas";

type Press = { x: number; y: number; dragging: boolean };

export type SplitDrag = {
    begin: (event: MouseResponderEvent) => void;
    move: (event: MouseResponderEvent) => void;
    end: (event: MouseResponderEvent) => void;
    cancel: () => void;
};

export function useSplitDrag(splitId: string, tabId: string, threshold: number, onDragStart?: () => void): SplitDrag {
    const services = useApp();
    const press = useRef<Press | null>(null);

    const publish = (pageX: number, pageY: number) => {
        services.drag.set({ splitId, sourceTabId: tabId, x: pageX, y: pageY });
        const hoveredTab = hitAreas.tabAt(pageX, pageY);
        if (hoveredTab) services.actions.peekTab(hoveredTab);
    };

    const startDragging = (current: Press) => {
        current.dragging = true;
        services.hideTooltip(`header:${splitId}`);
        services.hideTooltip(`chat:${splitId}`);
        onDragStart?.();
    };

    return {
        begin(event) {
            const { pageX, pageY } = event.nativeEvent;
            const current: Press = { x: pageX, y: pageY, dragging: false };
            press.current = current;
            if (threshold > 0) return;
            startDragging(current);
            publish(pageX, pageY);
        },
        move(event) {
            const current = press.current;
            if (!current) return;
            const { pageX, pageY } = event.nativeEvent;
            if (!current.dragging) {
                const distance = Math.hypot(pageX - current.x, pageY - current.y);
                if (distance <= threshold) return;
                startDragging(current);
            }
            publish(pageX, pageY);
        },
        end(event) {
            if (event.nativeEvent.pressDrag) return;
            const current = press.current;
            press.current = null;
            if (!current) return;
            const { pageX, pageY } = event.nativeEvent;
            const movedFar = Math.hypot(pageX - current.x, pageY - current.y) > threshold;
            const wasDrag = current.dragging || movedFar;
            if (!wasDrag) {
                if (services.drag.get()?.splitId === splitId) services.drag.set(null);
                return;
            }
            const hoveredTab = hitAreas.tabAt(pageX, pageY);
            if (hoveredTab) services.actions.peekTab(hoveredTab);
            const target = resolveDropTarget(services.core.layout.get().selectedTabId, pageX, pageY);
            services.drag.set(null);
            if (target) services.actions.dropSplit(splitId, target);
            else services.actions.focusSplit(splitId);
        },
        cancel() {
            press.current = null;
        },
    };
}
