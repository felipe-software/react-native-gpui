import { Svg, Text, View, type MouseResponderEvent } from "react-native-gpui";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

export type SelectOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
    testID: string;
    value: T;
    options: SelectOption<T>[];
    width?: number;
    onChange: (value: T) => void;
};

export function SelectBox<T extends string | number>({ testID, value, options, width = 160, onChange }: Props<T>) {
    const { theme, fonts, openOverlay } = useApp();
    const colors = chromeColors(theme);
    const current = options.find((option) => option.value === value);
    const open = (event: MouseResponderEvent) => {
        const left = event.nativeEvent.pageX - event.nativeEvent.locationX;
        const top = event.nativeEvent.pageY - event.nativeEvent.locationY + 24;
        openOverlay({
            kind: "menu",
            x: left,
            y: top,
            entries: options.map((option) => ({
                kind: "item",
                label: option.label,
                checked: option.value === value,
                onSelect: () => onChange(option.value),
            })),
        });
    };
    return (
        <View
            testID={testID}
            accessibilityRole="combobox"
            accessibilityLabel={current?.label ?? String(value)}
            style={{
                width,
                height: 24,
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 8,
                paddingRight: 4,
                borderWidth: 1,
                borderRadius: 2,
                borderColor: colors.buttonBorder,
                backgroundImage: colors.button,
            }}
            onClick={open}
        >
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>
                {current?.label ?? String(value)}
            </Text>
            <Svg name={ICONS.chevronDown} style={{ width: 14, height: 14, color: colors.text }} />
        </View>
    );
}
