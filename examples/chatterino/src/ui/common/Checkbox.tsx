import { Svg, Text, View } from "react-native-gpui";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import { MENU_COLORS, chromeColors } from "../theme";

type Props = { label: string; checked: boolean; testID?: string; disabled?: boolean; onChange: (checked: boolean) => void };

export function Checkbox({ label, checked, testID, disabled, onChange }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const textColor = disabled ? colors.disabledText : colors.text;
    return (
        <View
            testID={testID}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 22 }}
            onClick={disabled ? undefined : () => onChange(!checked)}
        >
            <View
                style={{
                    width: 14,
                    height: 14,
                    borderWidth: 1,
                    borderColor: MENU_COLORS.checkBorder,
                    borderRadius: 2,
                    backgroundColor: MENU_COLORS.checkFill,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {checked ? <Svg name={ICONS.check} style={{ width: 12, height: 12, color: MENU_COLORS.checkMark }} /> : null}
            </View>
            <Text style={{ color: textColor, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{label}</Text>
        </View>
    );
}
