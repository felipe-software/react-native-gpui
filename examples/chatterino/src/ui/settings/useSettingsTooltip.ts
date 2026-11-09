import { useEffect, useRef } from "react";
import type { MouseResponderEvent } from "react-native-gpui";
import { useSettingsUi, wrapTooltip } from "./SettingsContext";

const SHOW_DELAY_MS = 600;
const CURSOR_OFFSET = 18;

type TooltipHandlers = {
    onMouseEnter?: (event: MouseResponderEvent) => void;
    onMouseMove?: (event: MouseResponderEvent) => void;
    onMouseLeave?: () => void;
};

export function useSettingsTooltip(text: string | undefined): TooltipHandlers {
    const ui = useSettingsUi();
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const cursor = useRef({ x: 0, y: 0 });
    const shown = useRef(false);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
            if (shown.current) ui.hideTooltip();
        },
        [ui],
    );

    if (!text) return {};

    const track = (event: MouseResponderEvent) => {
        cursor.current = ui.toLocal({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    };
    const show = () => {
        shown.current = true;
        ui.showTooltip(wrapTooltip(text), { x: cursor.current.x, y: cursor.current.y + CURSOR_OFFSET });
    };
    return {
        onMouseEnter: (event) => {
            track(event);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(show, SHOW_DELAY_MS);
        },
        onMouseMove: track,
        onMouseLeave: () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = undefined;
            if (!shown.current) return;
            shown.current = false;
            ui.hideTooltip();
        },
    };
}
