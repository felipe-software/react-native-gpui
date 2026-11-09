import { useEffect, useRef, useState } from "react";
import { Image, TextInput, View, type TextInputHandle } from "react-native-gpui";
import { assetPath } from "../../data/assets";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { chromeColors } from "../theme";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = { value: string; onChange: (value: string) => void };

export const SETTINGS_SEARCH_KEY = "settings-search";

const PLACEHOLDER = "#7f7f7f";

export function SettingsSearchField({ value, onChange }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const input = useRef<TextInputHandle>(null);
    const [focused, setFocused] = useState(false);

    useEffect(
        () =>
            inputRegistry.register(SETTINGS_SEARCH_KEY, {
                focus: () => input.current?.focus(),
                insert: () => undefined,
                mention: () => undefined,
                reply: () => undefined,
                command: () => false,
                scrollToBottom: () => undefined,
            }),
        [],
    );

    return (
        <View
            style={{
                height: 24,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderRadius: 2,
                borderColor: focused ? colors.focusBorder : SETTINGS_STYLE.searchBorder,
                backgroundColor: SETTINGS_STYLE.searchBackground,
                paddingLeft: 3,
            }}
        >
            <View style={{ flex: 1 }}>
                <TextInput
                    ref={input}
                    testID="settings-search"
                    value={value}
                    placeholder="Find in settings... (Ctrl+F)"
                    placeholderTextColor={PLACEHOLDER}
                    onChangeText={onChange}
                    onFocus={() => {
                        setFocused(true);
                        inputRegistry.setFocused(`field:settings-search`);
                    }}
                    onBlur={() => {
                        setFocused(false);
                        inputRegistry.blurred(`field:settings-search`);
                    }}
                    style={{ marginTop: -5, height: 32, color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE }}
                />
            </View>
            {value ? (
                <View
                    testID="settings-search-clear"
                    accessibilityRole="button"
                    accessibilityLabel="Clear"
                    style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}
                    onClick={() => onChange("")}
                >
                    <Image source={{ uri: assetPath("buttons/clearSearch.png") }} style={{ width: 14, height: 14 }} />
                </View>
            ) : null}
        </View>
    );
}
