import { Text, View } from "react-native-gpui";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "../settings/settingsStyle";
import { SPushButton } from "../settings/SPushButton";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = { errors: string[]; onClose: () => void };

export function LoginErrorBox({ errors, onClose }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    return (
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.35)" }}>
            <View
                testID="login-error"
                accessibilityRole="alert"
                style={{ width: 260, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.outline, boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.6)" }}
            >
                <View style={{ height: 26, justifyContent: "center", paddingLeft: 8, backgroundColor: colors.titleBar }}>
                    <Text style={{ ...text, fontSize: SETTINGS_FONT_SIZE - 1 }}>Invalid account credentials</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 14, padding: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#e03131", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ ...text, fontSize: 20, fontWeight: "bold" }}>✕</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        {errors.map((error) => (
                            <Text key={error} testID="login-error-line" style={{ ...text, lineHeight: SETTINGS_LINE_HEIGHT }}>
                                {error}
                            </Text>
                        ))}
                    </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 8, paddingTop: 0 }}>
                    <SPushButton testID="login-error-ok" label="OK" primary onPress={onClose} />
                </View>
            </View>
        </View>
    );
}
