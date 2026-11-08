import { useState } from "react";
import { View, type MouseResponderEvent } from "react-native-gpui";

type Props = {
    color: string;
    hoverColor: string;
    testID?: string;
    onOpen: (x: number, y: number) => void;
};

const DOT = 2;
const SPACING = 4;
const WIDTH = 28;
const CENTER = 13;

export function KebabButton({ color, hoverColor, testID, onOpen }: Props) {
    const [hovered, setHovered] = useState(false);
    const dotColor = hovered ? hoverColor : color;
    const open = (event: MouseResponderEvent) => {
        const right = event.nativeEvent.pageX - event.nativeEvent.locationX + WIDTH;
        const bottom = event.nativeEvent.pageY - event.nativeEvent.locationY + 28;
        onOpen(right, bottom);
    };
    return (
        <View
            testID={testID}
            style={{ width: WIDTH, height: 28 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={open}
        >
            {[-SPACING, 0, SPACING].map((offset) => (
                <View
                    key={offset}
                    style={{ position: "absolute", left: CENTER, top: CENTER + offset, width: DOT, height: DOT, backgroundColor: dotColor }}
                />
            ))}
        </View>
    );
}
