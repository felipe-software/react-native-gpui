import { useState } from "react";
import { View } from "react-native-gpui";
import type { Direction } from "../layout/tree";
import { useApp } from "../state/AppContext";
import { OverlayButton } from "./OverlayButton";
import { overlayButtons, overlayPreview, type OverlayButtonKind } from "./overlayGeometry";
import { useSplitDrag } from "./useSplitDrag";

type Props = {
    splitId: string;
    tabId: string;
    width: number;
    height: number;
    onInsert: (direction: Direction) => void;
    onDragStart: () => void;
};

const DARK_FILL = "rgba(0, 0, 0, 0.588)";
const LIGHT_FILL = "rgba(255, 255, 255, 0.784)";

export function SplitOverlay({ splitId, tabId, width, height, onInsert, onDragStart }: Props) {
    const { theme } = useApp();
    const [hovered, setHovered] = useState<OverlayButtonKind | undefined>(undefined);
    const drag = useSplitDrag(splitId, tabId, 0, onDragStart);
    const preview = hovered ? overlayPreview(hovered, width, height) : undefined;
    return (
        <View
            testID={`split-overlay-${splitId}`}
            style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: theme.isLight ? LIGHT_FILL : DARK_FILL, zIndex: 25 }}
            onMouseDown={() => undefined}
        >
            {preview ? (
                <View
                    testID={`split-overlay-preview-${splitId}`}
                    pointerEvents="none"
                    style={{
                        position: "absolute",
                        left: preview.x,
                        top: preview.y,
                        width: preview.width,
                        height: preview.height,
                        borderWidth: 1,
                        borderColor: theme.splits.dropPreviewBorder,
                        backgroundColor: theme.splits.dropPreview,
                    }}
                />
            ) : null}
            {overlayButtons(width, height).map((box) => {
                const isMove = box.kind === "move";
                return (
                    <OverlayButton
                        key={box.kind}
                        kind={box.kind}
                        rect={box.rect}
                        hovered={hovered === box.kind}
                        testID={`split-overlay-${box.kind}-${splitId}`}
                        onHover={setHovered}
                        onMouseDown={isMove ? drag.begin : undefined}
                        onMouseMove={isMove ? drag.move : undefined}
                        onMouseUp={isMove ? drag.end : undefined}
                        onPress={isMove ? undefined : () => onInsert(box.kind as Direction)}
                    />
                );
            })}
        </View>
    );
}
