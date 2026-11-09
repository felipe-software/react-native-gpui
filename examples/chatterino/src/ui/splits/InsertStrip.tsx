import { useState } from "react";
import { View } from "react-native-gpui";
import type { DropZone } from "../layout/geometry";
import { useApp } from "../state/AppContext";
import { StripMarker } from "./StripMarker";

type Props = { zone: DropZone; testID: string; onInsert: () => void };

export function InsertStrip({ zone, testID, onInsert }: Props) {
    const { theme } = useApp();
    const [hovered, setHovered] = useState(false);
    return (
        <>
            <StripMarker zone={zone} hovered={hovered} color={theme.splits.dropTargetCross} borderColor={theme.splits.dropTargetBorder} />
            <View
                testID={testID}
                nativeListGroup={testID}
                style={{ position: "absolute", left: zone.rect.x, top: zone.rect.y, width: zone.rect.width, height: zone.rect.height, cursor: "pointer" }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={onInsert}
            />
        </>
    );
}
