import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { MENU_COLORS, chromeColors } from "../theme";

type Props = { label: string; selected: boolean; testID: string; disabled?: boolean; onSelect: () => void };

export function RadioOption({ label, selected, testID, disabled, onSelect }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const textColor = disabled ? colors.disabledText : colors.text;
    return (
        <View
            testID={testID}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected, disabled }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 21 }}
            onClick={disabled ? undefined : onSelect}
        >
            <View
                style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: MENU_COLORS.checkBorder,
                    backgroundColor: MENU_COLORS.checkFill,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {selected ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: MENU_COLORS.checkMark }} /> : null}
            </View>
            <Text style={{ color: textColor, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{label}</Text>
        </View>
    );
}
