import { useState } from "react";
import { View, type MouseResponderEvent } from "react-native-gpui";

type Props = {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    length: number;
    color: string;
    hoverColor: string;
    testID?: string;
    onPress: () => void;
    onMouseUp?: (event: MouseResponderEvent) => void;
};

export function PlusButton({ width, height, centerX, centerY, length, color, hoverColor, testID, onPress, onMouseUp }: Props) {
    const [hovered, setHovered] = useState(false);
    const lineColor = hovered ? hoverColor : color;
    const half = (length - 1) / 2;
    return (
        <View
            testID={testID}
            nativeListGroup={`plus-${testID ?? "button"}`}
            style={{ width, height }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onPress}
            onMouseUp={onMouseUp}
        >
            <View style={{ position: "absolute", left: centerX - half, top: centerY, width: length, height: 1, backgroundColor: lineColor }} />
            <View style={{ position: "absolute", left: centerX, top: centerY - half, width: 1, height: length, backgroundColor: lineColor }} />
        </View>
    );
}
