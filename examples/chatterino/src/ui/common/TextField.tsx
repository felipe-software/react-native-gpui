import { forwardRef, useState } from "react";
import { TextInput, View, type TextInputHandle } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { chromeColors } from "../theme";

type Props = {
    value: string;
    testID: string;
    placeholder?: string;
    secure?: boolean;
    autoFocus?: boolean;
    width?: number;
    grow?: boolean;
    onChange: (value: string) => void;
    onSubmit?: () => void;
};

const PLACEHOLDER = "#7f7f7f";

export const TextField = forwardRef<TextInputHandle, Props>(function TextField(
    { value, testID, placeholder, secure, autoFocus, width, grow, onChange, onSubmit },
    ref,
) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [focused, setFocused] = useState(false);
    return (
        <View
            style={{
                height: 24,
                width,
                flexGrow: grow ? 1 : 0,
                flexShrink: 1,
                borderWidth: 1,
                borderColor: focused ? colors.focusBorder : colors.fieldBorder,
                borderRadius: 2,
                backgroundColor: colors.field,
                paddingHorizontal: 5,
            }}
        >
            <TextInput
                ref={ref}
                testID={testID}
                value={value}
                placeholder={placeholder}
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry={secure}
                autoFocus={autoFocus}
                onChangeText={onChange}
                onSubmitEditing={() => onSubmit?.()}
                onFocus={() => {
                    setFocused(true);
                    inputRegistry.setFocused(`field:${testID}`);
                }}
                onBlur={() => {
                    setFocused(false);
                    inputRegistry.blurred(`field:${testID}`);
                }}
                style={{ marginTop: -5, height: 32, color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}
            />
        </View>
    );
});
