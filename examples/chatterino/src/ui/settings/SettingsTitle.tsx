import { Text } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_COLORS } from "../theme";

export function SettingsTitle({ text, subtitle }: { text: string; subtitle?: boolean }) {
    const { fonts } = useApp();
    const size = subtitle ? 16 : 24;
    return (
        <Text
            style={{
                color: SETTINGS_COLORS.title,
                fontFamily: fonts.appFamily,
                fontSize: size,
                fontWeight: "300",
                marginTop: subtitle ? 10 : 16,
                marginBottom: 8,
            }}
        >
            {text}
        </Text>
    );
}
