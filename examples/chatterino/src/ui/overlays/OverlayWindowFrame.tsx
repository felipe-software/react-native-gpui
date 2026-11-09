import type { ReactNode } from "react";
import { View, Window, type WindowPosition } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import type { OverlayWindow } from "./overlayWindows";

type Props = {
    window: OverlayWindow;
    testID: string;
    title: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    frameless?: boolean;
    onClose: () => void;
    onBackdropPress?: () => void;
    children: ReactNode;
};

const IN_WINDOW_TITLE_HEIGHT = 28;

function positionFor(window: OverlayWindow, x: number | undefined, y: number | undefined): WindowPosition {
    if (x === undefined || y === undefined) return "center";
    if (window.anchor) return { x: x - window.anchor.x, y: y - window.anchor.y, relativeTo: "cursor" };
    return { x, y, relativeTo: "parent" };
}

export function OverlayWindowFrame({ window, testID, title, width, height, x, y, frameless, onClose, onBackdropPress, children }: Props) {
    const { theme } = useApp();
    const colors = chromeColors(theme);
    const contentHeight = frameless ? height : height - IN_WINDOW_TITLE_HEIGHT;
    const closesOnBlur = window.kind === "popup" ? Boolean(onBackdropPress) : false;
    return (
        <Window
            testID={testID}
            title={title}
            kind={window.kind}
            width={width}
            height={contentHeight}
            position={positionFor(window, x, y)}
            closeOnEscape={window.closeOnEscape}
            closeOnBlur={closesOnBlur}
            onClose={onClose}
        >
            <View
                testID={testID}
                style={{
                    flex: 1,
                    backgroundColor: frameless ? theme.window.background : colors.background,
                    borderWidth: frameless ? 1 : 0,
                    borderColor: colors.outline,
                }}
            >
                {children}
            </View>
        </Window>
    );
}
