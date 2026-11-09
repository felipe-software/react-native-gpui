import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { unsupportedTooltip } from "./generalHelpers";
import { SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsTooltip } from "./useSettingsTooltip";

type Props = { text: string; category: boolean; working: boolean };

const CATEGORY_SIZE = 21;
const NAME_SIZE = 13;
const NOT_IMPLEMENTED = "this app has no handler for this action yet.";

export function HotkeyNameCell({ text, category, working }: Props) {
    const { fonts } = useApp();
    const tooltip = working ? undefined : unsupportedTooltip(undefined, NOT_IMPLEMENTED);
    const hover = useSettingsTooltip(tooltip);
    const color = working ? SETTINGS_STYLE.text : SETTINGS_STYLE.disabledText;
    return (
        <View style={{ flex: 1, justifyContent: "center" }} {...hover}>
            <Text
                numberOfLines={1}
                style={{
                    color,
                    fontFamily: fonts.appFamily,
                    fontSize: category ? CATEGORY_SIZE : NAME_SIZE,
                    fontWeight: category ? "300" : "400",
                }}
            >
                {text}
            </Text>
        </View>
    );
}
