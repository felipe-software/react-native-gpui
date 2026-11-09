import { useState } from "react";
import { TextInput, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { chromeColors } from "../theme";
import { SETTINGS_CONTROL_HEIGHT, SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = {
    testID: string;
    value: string;
    placeholder?: string;
    width?: number;
    grow?: boolean;
    secure?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    align?: "left" | "right";
    onChange: (value: string) => void;
    onSubmit?: () => void;
    onBlur?: () => void;
};

const PLACEHOLDER = "#7f7f7f";

export function SLineEdit({ testID, value, placeholder, width, grow, secure, disabled, autoFocus, align, onChange, onSubmit, onBlur }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [focused, setFocused] = useState(false);
    const border = focused ? colors.focusBorder : colors.fieldBorder;
    return (
        <View
            style={{
                height: SETTINGS_CONTROL_HEIGHT,
                width,
                flexGrow: grow ? 1 : 0,
                flexShrink: 1,
                borderWidth: 1,
                borderRadius: 2,
                borderColor: border,
                backgroundColor: colors.field,
                paddingHorizontal: 4,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <TextInput
                testID={testID}
                value={value}
                placeholder={placeholder}
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry={secure}
                autoFocus={autoFocus}
                editable={!disabled}
                onChangeText={onChange}
                onSubmitEditing={() => onSubmit?.()}
                onFocus={() => {
                    setFocused(true);
                    inputRegistry.setFocused(`field:${testID}`);
                }}
                onBlur={() => {
                    setFocused(false);
                    inputRegistry.blurred(`field:${testID}`);
                    onBlur?.();
                }}
                style={{
                    marginTop: -5,
                    height: 32,
                    color: disabled ? SETTINGS_STYLE.disabledText : SETTINGS_STYLE.text,
                    fontFamily: fonts.appFamily,
                    fontSize: SETTINGS_FONT_SIZE,
                    textAlign: align,
                }}
            />
        </View>
    );
}
