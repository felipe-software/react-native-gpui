import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = { label: string; testID?: string; disabled?: boolean; primary?: boolean; onPress: () => void };

export function PushButton({ label, testID, disabled, primary, onPress }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [hovered, setHovered] = useState(false);
    const background = hovered && !disabled ? colors.buttonHover : colors.button;
    const borderColor = primary ? colors.focusBorder : colors.buttonBorder;
    const textColor = disabled ? colors.disabledText : colors.text;
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            style={{
                minWidth: 80,
                height: 24,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundImage: background,
                borderWidth: 1,
                borderColor,
                borderRadius: 2,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={disabled ? undefined : onPress}
        >
            <Text style={{ color: textColor, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{label}</Text>
        </View>
    );
}
