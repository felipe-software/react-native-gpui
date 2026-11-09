import { Image, View, type MouseResponderEvent } from "react-native-gpui";
import { effectColor } from "../colors";
import { useApp } from "../state/AppContext";
import { HoverGlow } from "./HoverGlow";
import { useButtonEffect } from "./useButtonEffect";

type Props = {
    testID: string;
    label: string;
    icon: string;
    width: number;
    height: number;
    iconWidth: number;
    iconHeight: number;
    opacity?: number;
    onPress: (event: MouseResponderEvent) => void;
    onContextMenu?: (event: MouseResponderEvent) => void;
};

export function IconButton({ testID, label, icon, width, height, iconWidth, iconHeight, opacity, onPress, onContextMenu }: Props) {
    const { theme } = useApp();
    const effect = useButtonEffect();
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            nativeListGroup={`icon-${testID}`}
            style={{ width, height, alignItems: "center", justifyContent: "center" }}
            onMouseEnter={effect.enter}
            onMouseMove={effect.move}
            onMouseLeave={effect.leave}
            onMouseDown={effect.press}
            onMouseUp={effect.release}
            onClick={onPress}
            onContextMenu={onContextMenu}
        >
            <Image source={{ uri: icon }} style={{ width: iconWidth, height: iconHeight, opacity: opacity ?? 1 }} resizeMode="contain" />
            <HoverGlow
                width={width}
                height={height}
                color={effectColor(theme.isLight)}
                factor={effect.factor}
                pointer={effect.pointer}
                ripples={effect.ripples}
            />
        </View>
    );
}
