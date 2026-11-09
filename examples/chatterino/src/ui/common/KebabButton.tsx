import { View, type MouseResponderEvent } from "react-native-gpui";
import { effectColor } from "../colors";
import { useApp } from "../state/AppContext";
import { HoverGlow } from "./HoverGlow";
import { useButtonEffect } from "./useButtonEffect";

type Props = {
    color: string;
    hoverColor: string;
    testID?: string;
    onOpen: (x: number, y: number) => void;
};

const DOT = 2;
const SPACING = 4;
const WIDTH = 28;
const HEIGHT = 28;
const CENTER = 13;

export function KebabButton({ color, hoverColor, testID, onOpen }: Props) {
    const { theme } = useApp();
    const effect = useButtonEffect();
    const dotColor = effect.hovered ? hoverColor : color;
    const open = (event: MouseResponderEvent) => {
        effect.press(event);
        const right = event.nativeEvent.pageX - event.nativeEvent.locationX + WIDTH;
        const bottom = event.nativeEvent.pageY - event.nativeEvent.locationY + HEIGHT;
        onOpen(right, bottom);
    };
    return (
        <View
            testID={testID}
            nativeListGroup={`kebab-${testID ?? "button"}`}
            style={{ width: WIDTH, height: HEIGHT }}
            onMouseEnter={effect.enter}
            onMouseMove={effect.move}
            onMouseLeave={effect.leave}
            onMouseDown={open}
            onMouseUp={effect.release}
        >
            {[-SPACING, 0, SPACING].map((offset) => (
                <View
                    key={offset}
                    style={{ position: "absolute", left: CENTER, top: CENTER + offset, width: DOT, height: DOT, backgroundColor: dotColor }}
                />
            ))}
            <HoverGlow
                width={WIDTH}
                height={HEIGHT}
                color={effectColor(theme.isLight)}
                factor={effect.factor}
                pointer={effect.pointer}
                ripples={effect.ripples}
            />
        </View>
    );
}
