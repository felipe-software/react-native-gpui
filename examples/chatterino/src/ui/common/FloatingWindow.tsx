import { useRef, useState, type ReactNode } from "react";
import { Svg, Text, View, useWindowDimensions, type MouseResponderEvent } from "react-native-gpui";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = {
    testID: string;
    title: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    modal?: boolean;
    frameless?: boolean;
    onClose: () => void;
    onBackdropPress?: () => void;
    children: ReactNode;
};

const TITLE_HEIGHT = 28;

function clamp(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value));
}

export function FloatingWindow({ testID, title, width, height, x, y, modal, frameless, onClose, onBackdropPress, children }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const screen = useWindowDimensions();
    const initialX = x ?? Math.round((screen.width - width) / 2);
    const initialY = y ?? Math.round((screen.height - height) / 2);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const grab = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);
    const [closeHovered, setCloseHovered] = useState(false);
    const left = clamp(initialX + offset.x, 0, Math.max(0, screen.width - width));
    const top = clamp(initialY + offset.y, 0, Math.max(0, screen.height - height));
    const hasBackdrop = modal || !!onBackdropPress;

    const startMove = (event: MouseResponderEvent) => {
        if (event.nativeEvent.pressDrag) return;
        grab.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, start: offset };
    };
    const move = (event: MouseResponderEvent) => {
        const current = grab.current;
        if (!current) return;
        setOffset({ x: current.start.x + event.nativeEvent.pageX - current.x, y: current.start.y + event.nativeEvent.pageY - current.y });
    };

    return (
        <>
            {hasBackdrop ? (
                <View
                    testID={`${testID}-backdrop`}
                    style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
                    onMouseDown={() => onBackdropPress?.()}
                />
            ) : null}
            <View
                testID={testID}
                style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    height,
                    backgroundColor: frameless ? theme.window.background : colors.background,
                    borderWidth: 1,
                    borderColor: frameless ? colors.outline : colors.border,
                    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.45)",
                }}
            >
                {frameless ? null : (
                <View
                    style={{ height: TITLE_HEIGHT, flexDirection: "row", alignItems: "center", backgroundColor: colors.titleBar, paddingLeft: 10 }}
                    nativeListGroup={`window-${testID}`}
                    onMouseDown={startMove}
                    onMouseMove={move}
                    onMouseUp={(event) => {
                        if (event.nativeEvent.pressDrag) return;
                        move(event);
                        grab.current = null;
                    }}
                >
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1 }}>
                        {title}
                    </Text>
                    <View
                        testID={`${testID}-close`}
                        accessibilityLabel="Close"
                        style={{
                            width: TITLE_HEIGHT + 8,
                            height: TITLE_HEIGHT,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: closeHovered ? "#c42b1c" : undefined,
                        }}
                        onMouseEnter={() => setCloseHovered(true)}
                        onMouseLeave={() => setCloseHovered(false)}
                        onClick={onClose}
                    >
                        <Svg name={ICONS.close} style={{ width: 16, height: 16, color: closeHovered ? "#ffffff" : colors.text }} />
                    </View>
                </View>
                )}
                <View style={{ flex: 1 }}>{children}</View>
            </View>
        </>
    );
}
