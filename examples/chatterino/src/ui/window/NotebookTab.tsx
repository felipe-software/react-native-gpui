import { useRef, useState } from "react";
import { Svg, Text, View, type LayoutChangeEvent, type MouseResponderEvent } from "react-native-gpui";
import { HoverGlow } from "../common/HoverGlow";
import { useButtonEffect } from "../common/useButtonEffect";
import type { Fonts } from "../fonts";
import { ICONS } from "../icons";
import type { Rect } from "../layout/geometry";
import type { TabState, Theme } from "../theme";

type Props = {
    id: string;
    title: string;
    state: TabState;
    live: boolean;
    showLive: boolean;
    closable: boolean;
    theme: Theme;
    fonts: Fonts;
    onSelect: () => void;
    onClose: () => void;
    onRename: () => void;
    onMenu: (x: number, y: number) => void;
    onReorder: (x: number, y: number) => void;
    onLayout: (rect: Rect) => void;
};

const HEIGHT = 28;
const DOUBLE_CLICK_MS = 400;

export function NotebookTab(props: Props) {
    const { title, state, live, showLive, closable, theme, fonts } = props;
    const effect = useButtonEffect();
    const hovered = effect.hovered;
    const [closeHovered, setCloseHovered] = useState(false);
    const [size, setSize] = useState({ width: HEIGHT, height: HEIGHT });
    const pressed = useRef(false);
    const lastDown = useRef(0);
    const rect = useRef<Rect | null>(null);
    const selected = state === "selected";
    const colors = theme.tabs[state];
    const showClose = closable && (selected || hovered);
    const backgroundTop = selected ? 0 : 1;
    const lineHeight = selected ? 2 : 1;
    const lineColor = colors.line;
    const textPadding = selected ? 2 : 6;
    const paddingLeft = showClose ? 9 : 16;
    const paddingRight = showClose ? 23 : 16;
    const bodyHeight = selected ? HEIGHT : HEIGHT - backgroundTop - 1;

    const handleDown = (event: MouseResponderEvent) => {
        const width = rect.current?.width ?? 0;
        const { locationX, locationY } = event.nativeEvent;
        const onClose = showClose && locationX >= width - 21 && locationX < width - 5 && locationY >= 7 && locationY < 23;
        if (event.nativeEvent.pressDrag || onClose) return;
        effect.press(event);
        pressed.current = true;
        const now = Date.now();
        const isDoubleClick = now - lastDown.current < DOUBLE_CLICK_MS;
        lastDown.current = now;
        props.onSelect();
        if (isDoubleClick) props.onRename();
    };

    const handleMove = (event: MouseResponderEvent) => {
        effect.move(event);
        if (!pressed.current || !rect.current) return;
        const { pageX, pageY } = event.nativeEvent;
        const own = rect.current;
        const inside = pageX >= own.x && pageX < own.x + own.width && pageY >= own.y && pageY < own.y + own.height;
        if (!inside) props.onReorder(pageX, pageY);
    };

    const handleLayout = (event: LayoutChangeEvent) => {
        const layout = event.nativeEvent.layout;
        rect.current = layout;
        setSize((current) => (current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height }));
        props.onLayout(layout);
    };

    return (
        <View
            testID={`tab-${props.id}`}
            accessibilityLabel={title}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityHint={state}
            nativeListGroup={`tab-${props.id}`}
            style={{ height: HEIGHT, minWidth: HEIGHT, maxWidth: 150, marginRight: 1, paddingLeft, paddingRight, paddingTop: textPadding, justifyContent: "center" }}
            onLayout={handleLayout}
            onMouseEnter={effect.enter}
            onMouseLeave={effect.leave}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={(event) => {
                if (event.nativeEvent.pressDrag) return;
                handleMove(event);
                effect.release();
                pressed.current = false;
            }}
            onContextMenu={(event) => props.onMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        >
            <View style={{ position: "absolute", left: 0, right: 0, top: backgroundTop, height: bodyHeight, backgroundColor: colors.background }} />
            <View style={{ position: "absolute", left: 0, right: 0, top: backgroundTop, height: lineHeight, backgroundColor: lineColor }} />
            {live && showLive ? (
                <View
                    style={{
                        position: "absolute",
                        right: 3,
                        top: selected ? 4 : 5,
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: theme.tabs.live,
                    }}
                />
            ) : null}
            <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize, textAlign: "center" }}>
                {title}
            </Text>
            {selected ? null : (
                <HoverGlow
                    width={size.width}
                    height={size.height}
                    color={theme.tabs.regular.text}
                    factor={effect.factor}
                    pointer={effect.pointer}
                    ripples={effect.ripples}
                />
            )}
            {showClose ? (
                <View
                    testID={`tab-close-${props.id}`}
                    nativeListGroup={`tab-close-${props.id}`}
                    style={{
                        position: "absolute",
                        right: 5,
                        top: 7,
                        width: 16,
                        height: 16,
                        backgroundColor: closeHovered ? "rgba(0, 0, 0, 0.25)" : undefined,
                    }}
                    onMouseEnter={() => setCloseHovered(true)}
                    onMouseLeave={() => setCloseHovered(false)}
                    onClick={props.onClose}
                >
                    <Svg name={ICONS.close} style={{ width: 16, height: 16, color: colors.text }} />
                </View>
            ) : null}
        </View>
    );
}
