import { useState } from "react";
import { Svg, View, type MouseResponderEvent } from "react-native-gpui";

type Props = {
    icon: string;
    color: string;
    hoverColor: string;
    testID: string;
    label: string;
    onPress: (event: MouseResponderEvent) => void;
};

export function CornerButton({ icon, color, hoverColor, testID, label, onPress }: Props) {
    const [hovered, setHovered] = useState(false);
    const iconColor = hovered ? hoverColor : color;
    return (
        <View
            testID={testID}
            accessibilityLabel={label}
            style={{ width: 28, height: 27, alignItems: "center", justifyContent: "center" }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onPress}
        >
            <Svg name={icon} style={{ width: 28, height: 28, color: iconColor }} />
        </View>
    );
}
