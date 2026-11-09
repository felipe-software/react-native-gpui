import { useState } from "react";
import { Svg, Text, View, type MouseResponderEvent } from "react-native-gpui";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { matchesQuery, useSettingsUi, type ListOption } from "./SettingsContext";
import { SETTINGS_CONTROL_HEIGHT, SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsTooltip } from "./useSettingsTooltip";

type Props = {
    testID: string;
    value: string;
    options: ListOption[];
    width?: number;
    grow?: boolean;
    placeholder?: string;
    tooltip?: string;
    disabled?: boolean;
    greyable?: boolean;
    onChange: (value: string) => void;
};

const CHAR_WIDTH = 8;
const MIN_WIDTH = 120;
const ARROW_SPACE = 34;

export function comboWidth(options: ListOption[]): number {
    const longest = options.reduce((max, option) => Math.max(max, option.label.length), 0);
    return Math.max(MIN_WIDTH, Math.round(longest * CHAR_WIDTH + ARROW_SPACE));
}

export function SComboBox({ testID, value, options, width, grow, placeholder, tooltip, disabled, greyable = true, onChange }: Props) {
    const { theme, fonts } = useApp();
    const ui = useSettingsUi();
    const colors = chromeColors(theme);
    const hover = useSettingsTooltip(tooltip);
    const [hovered, setHovered] = useState(false);
    const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
    const current = options.find((option) => option.value === value);
    const label = current?.label ?? placeholder ?? "";
    const greyed = greyable && !matchesQuery(ui.query, ...options.map((option) => option.label));
    const fixedWidth = width ?? comboWidth(options);
    const boxWidth = grow && measuredWidth !== null ? measuredWidth : fixedWidth;
    const textColor = disabled || !current ? SETTINGS_STYLE.disabledText : SETTINGS_STYLE.text;
    const background = hovered && !disabled ? colors.buttonHover : colors.button;

    const open = (event: MouseResponderEvent) => {
        if (disabled) return;
        const local = ui.toLocal({
            x: event.nativeEvent.pageX - event.nativeEvent.locationX,
            y: event.nativeEvent.pageY - event.nativeEvent.locationY,
        });
        ui.openPopup({
            kind: "list",
            anchor: { x: local.x, y: local.y, width: boxWidth, height: SETTINGS_CONTROL_HEIGHT },
            options,
            selected: value,
            onSelect: onChange,
        });
    };

    return (
        <View
            testID={testID}
            accessibilityRole="combobox"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            style={{
                width: grow ? undefined : boxWidth,
                flex: grow ? 1 : undefined,
                height: SETTINGS_CONTROL_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 4,
                paddingRight: 2,
                borderWidth: 1,
                borderRadius: 2,
                borderColor: colors.buttonBorder,
                backgroundImage: background,
            }}
            onClick={open}
            onLayout={grow ? (event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width)) : undefined}
            onMouseEnter={(event) => {
                setHovered(true);
                hover.onMouseEnter?.(event);
            }}
            onMouseMove={hover.onMouseMove}
            onMouseLeave={() => {
                setHovered(false);
                hover.onMouseLeave?.();
            }}
        >
            <Text numberOfLines={1} style={{ flex: 1, color: textColor, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE }}>
                {label}
            </Text>
            <Svg name={ICONS.chevronDown} style={{ width: 12, height: 12, color: disabled ? SETTINGS_STYLE.disabledText : "#d0d0d0" }} />
            {greyed ? <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: SETTINGS_STYLE.greyOut }} /> : null}
        </View>
    );
}
