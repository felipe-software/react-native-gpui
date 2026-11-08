import { View } from "react-native-gpui";
import { dropZoneAt, type DropZone } from "../layout/geometry";
import { useApp } from "../state/AppContext";
import { useStore } from "../state/useStore";
import { StripMarker } from "./StripMarker";

type Props = { zones: DropZone[]; pageOrigin: { x: number; y: number } };

export function DropOverlay({ zones, pageOrigin }: Props) {
    const { theme, drag } = useApp();
    const state = useStore(drag);
    const hovered = state ? dropZoneAt(zones, state.x - pageOrigin.x, state.y - pageOrigin.y) : undefined;
    const strips = zones.filter((zone) => zone.kind === "strip");
    return (
        <View testID="drop-overlay" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 30 }} pointerEvents="none">
            {strips.map((zone, index) => (
                <StripMarker
                    key={`strip-${index}`}
                    zone={zone}
                    hovered={zone === hovered}
                    color={theme.splits.dropTargetCross}
                    borderColor={theme.splits.dropTargetBorder}
                />
            ))}
            {hovered ? (
                <View
                    testID="drop-preview"
                    style={{
                        position: "absolute",
                        left: hovered.rect.x,
                        top: hovered.rect.y,
                        width: hovered.rect.width + 1,
                        height: hovered.rect.height + 1,
                        borderWidth: 1,
                        borderColor: theme.splits.dropPreviewBorder,
                        backgroundColor: theme.splits.dropPreview,
                    }}
                />
            ) : null}
        </View>
    );
}
