import { View } from "react-native-gpui";
import type { DropZone } from "../layout/geometry";

type Props = { zone: DropZone; hovered: boolean; color: string; borderColor: string };

export function StripMarker({ zone, hovered, color, borderColor }: Props) {
    const inner = { x: zone.rect.x + 2, y: zone.rect.y + 2, width: zone.rect.width - 4, height: zone.rect.height - 4 };
    const cross = Math.max(0, Math.min(zone.rect.width, zone.rect.height) - 12);
    const centerX = Math.floor(inner.x + inner.width / 2);
    const centerY = Math.floor(inner.y + inner.height / 2);
    const half = Math.floor(cross / 2);
    return (
        <>
            <View
                style={{
                    position: "absolute",
                    left: inner.x,
                    top: inner.y,
                    width: inner.width + 1,
                    height: inner.height + 1,
                    borderWidth: 1,
                    borderColor: hovered ? borderColor : "rgba(0, 0, 0, 0)",
                }}
            />
            <View style={{ position: "absolute", left: centerX - half, top: centerY, width: half * 2 + 1, height: 1, backgroundColor: color }} />
            <View style={{ position: "absolute", left: centerX, top: centerY - half, width: 1, height: half * 2 + 1, backgroundColor: color }} />
        </>
    );
}
