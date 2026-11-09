import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SPushButton } from "./SPushButton";

type Props = {
    icon: "information" | "warning" | "critical" | "question";
    text: string;
    informative?: string;
    buttons: Array<{ label: string; primary?: boolean; onPress: () => void }>;
};

const ICON_TEXT = { information: "i", warning: "!", critical: "✕", question: "?" } as const;
const ICON_COLOR = { information: "#2a82da", warning: "#e0a800", critical: "#e03131", question: "#2a82da" } as const;

export function MessageBoxContent({ icon, text, informative, buttons }: Props) {
    const { fonts } = useApp();
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    return (
        <View testID="message-box" style={{ flex: 1, padding: 14, gap: 12 }}>
            <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: ICON_COLOR[icon], alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ ...label, fontSize: 20, fontWeight: "bold" }}>{ICON_TEXT[icon]}</Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                    <Text testID="message-box-text" style={label}>
                        {text}
                    </Text>
                    {informative ? (
                        <Text testID="message-box-informative" style={label}>
                            {informative}
                        </Text>
                    ) : null}
                </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                {buttons.map((button) => (
                    <SPushButton key={button.label} testID={`message-box-${button.label.toLowerCase()}`} label={button.label} primary={button.primary} onPress={button.onPress} />
                ))}
            </View>
        </View>
    );
}
