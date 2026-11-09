import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = { label?: string; url?: string; testID?: string };

export function RegexInfoLink({ label = "regex info", url = "https://chatterino.com/help/regex", testID = "regex-info" }: Props) {
    const { fonts, openUrl } = useApp();
    return (
        <View
            testID={testID}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={{ borderBottomWidth: 1, borderColor: SETTINGS_STYLE.link, cursor: "pointer" }}
            onClick={() => openUrl(url)}
        >
            <Text style={{ color: SETTINGS_STYLE.link, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE }}>{label}</Text>
        </View>
    );
}
