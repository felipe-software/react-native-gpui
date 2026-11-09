import { Image, View, type MouseResponderEvent } from "react-native-gpui";
import { assetPath, type AssetName } from "../assetPaths";
import type { Rect } from "../layout/geometry";
import { OVERLAY_ICON, type OverlayButtonKind } from "./overlayGeometry";

type Props = {
    kind: OverlayButtonKind;
    rect: Rect;
    hovered: boolean;
    testID: string;
    onHover: (kind: OverlayButtonKind | undefined) => void;
    onMouseDown?: (event: MouseResponderEvent) => void;
    onMouseMove?: (event: MouseResponderEvent) => void;
    onMouseUp?: (event: MouseResponderEvent) => void;
    onPress?: () => void;
};

const ICONS: Record<OverlayButtonKind, AssetName> = { move: "move.png", left: "left.png", right: "right.png", above: "up.png", below: "down.png" };

export function OverlayButton({ kind, rect, hovered, testID, onHover, onMouseDown, onMouseMove, onMouseUp, onPress }: Props) {
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={kind}
            nativeListGroup={testID}
            style={{
                position: "absolute",
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                alignItems: "center",
                justifyContent: "center",
                cursor: kind === "move" ? "grab" : "pointer",
            }}
            onMouseEnter={() => onHover(kind)}
            onMouseLeave={() => onHover(undefined)}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onClick={onPress}
        >
            <Image source={{ uri: assetPath(ICONS[kind]) }} style={{ width: OVERLAY_ICON, height: OVERLAY_ICON, opacity: hovered ? 0.99 : 0.7 }} />
        </View>
    );
}
