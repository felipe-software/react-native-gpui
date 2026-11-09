import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsTooltip } from "./useSettingsTooltip";

type Props = {
    label: string;
    testID?: string;
    disabled?: boolean;
    primary?: boolean;
    tooltip?: string;
    minWidth?: number;
    grow?: boolean;
    onPress: () => void;
};

export function SPushButton({ label, testID, disabled, primary, tooltip, minWidth = 78, grow, onPress }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const hover = useSettingsTooltip(tooltip);
    const [hovered, setHovered] = useState(false);
    const background = hovered && !disabled ? colors.buttonHover : colors.button;
    const borderColor = primary ? colors.focusBorder : colors.buttonBorder;
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            style={{
                minWidth,
                flexGrow: grow ? 1 : 0,
                height: 24,
                paddingHorizontal: 7,
                alignItems: "center",
                justifyContent: "center",
                backgroundImage: background,
                borderWidth: 1,
                borderColor,
                borderRadius: 2,
            }}
            onMouseEnter={(event) => {
                setHovered(true);
                hover.onMouseEnter?.(event);
            }}
            onMouseMove={hover.onMouseMove}
            onMouseLeave={() => {
                setHovered(false);
                hover.onMouseLeave?.();
            }}
            onClick={disabled ? undefined : onPress}
        >
            <Text style={{ color: disabled ? SETTINGS_STYLE.disabledText : SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE }}>
                {label}
            </Text>
        </View>
    );
}
