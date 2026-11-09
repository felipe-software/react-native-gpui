import { Svg, View, type MouseResponderEvent } from "react-native-gpui";
import { effectColor } from "../colors";
import { HoverGlow } from "../common/HoverGlow";
import { useButtonEffect } from "../common/useButtonEffect";
import { useApp } from "../state/AppContext";

type Props = {
    icon: string;
    color: string;
    hoverColor: string;
    testID: string;
    label: string;
    onPress: (event: MouseResponderEvent) => void;
};

const WIDTH = 28;
const HEIGHT = 27;

export function CornerButton({ icon, color, hoverColor, testID, label, onPress }: Props) {
    const { theme } = useApp();
    const effect = useButtonEffect();
    const iconColor = effect.hovered ? hoverColor : color;
    return (
        <View
            testID={testID}
            accessibilityLabel={label}
            nativeListGroup={`corner-${testID}`}
            style={{ width: WIDTH, height: HEIGHT, alignItems: "center", justifyContent: "center" }}
            onMouseEnter={effect.enter}
            onMouseMove={effect.move}
            onMouseLeave={effect.leave}
            onMouseDown={effect.press}
            onMouseUp={effect.release}
            onClick={onPress}
        >
            <Svg name={icon} style={{ width: 28, height: 28, color: iconColor }} />
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
