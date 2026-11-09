import { useEffect, useState } from "react";
import { Svg, TextInput, View } from "react-native-gpui";
import { ICONS } from "../icons";

const CHEVRON_UP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M4 10L8 6L12 10" fill="none" stroke="black" stroke-width="1.5"/></svg>';
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { chromeColors } from "../theme";
import { SETTINGS_CONTROL_HEIGHT, SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = {
    testID: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    width?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function SpinBox({ testID, value, min, max, step = 1, suffix = "", width = 90, disabled, onChange }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [text, setText] = useState(`${value}${suffix}`);
    const [focused, setFocused] = useState(false);
    useEffect(() => setText(`${value}${suffix}`), [value, suffix]);

    const parse = (raw: string) => Number.parseInt(raw.replace(suffix, "").trim(), 10);
    const commit = () => {
        const parsed = parse(text);
        if (!Number.isFinite(parsed)) {
            setText(`${value}${suffix}`);
            return;
        }
        const next = clamp(parsed, min, max);
        setText(`${next}${suffix}`);
        if (next !== value) onChange(next);
    };
    const nudge = (direction: number) => {
        if (disabled) return;
        const next = clamp(value + direction * step, min, max);
        if (next !== value) onChange(next);
    };
    const arrowColor = disabled ? SETTINGS_STYLE.disabledText : "#d0d0d0";

    return (
        <View
            style={{
                width,
                height: SETTINGS_CONTROL_HEIGHT,
                flexDirection: "row",
                borderWidth: 1,
                borderRadius: 2,
                borderColor: focused ? colors.focusBorder : colors.fieldBorder,
                backgroundColor: colors.field,
            }}
        >
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <TextInput
                    testID={testID}
                    value={text}
                    editable={!disabled}
                    onChangeText={(next) => {
                        setText(next);
                        const parsed = parse(next);
                        if (Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) onChange(parsed);
                    }}
                    onSubmitEditing={commit}
                    onFocus={() => {
                        setFocused(true);
                        inputRegistry.setFocused(`field:${testID}`);
                    }}
                    onBlur={() => {
                        setFocused(false);
                        inputRegistry.blurred(`field:${testID}`);
                        commit();
                    }}
                    style={{
                        marginTop: -5,
                        height: 32,
                        color: disabled ? SETTINGS_STYLE.disabledText : SETTINGS_STYLE.text,
                        fontFamily: fonts.appFamily,
                        fontSize: SETTINGS_FONT_SIZE,
                    }}
                />
            </View>
            <View style={{ width: 16, borderLeftWidth: 1, borderColor: colors.fieldBorder }}>
                <View
                    testID={`${testID}-up`}
                    accessibilityLabel="Increase"
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                    onClick={() => nudge(1)}
                >
                    <Svg name={CHEVRON_UP} style={{ width: 10, height: 10, color: arrowColor }} />
                </View>
                <View
                    testID={`${testID}-down`}
                    accessibilityLabel="Decrease"
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                    onClick={() => nudge(-1)}
                >
                    <Svg name={ICONS.chevronDown} style={{ width: 10, height: 10, color: arrowColor }} />
                </View>
            </View>
        </View>
    );
}
