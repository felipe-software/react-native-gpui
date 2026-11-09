import type { ReactNode } from "react";
import { Text, View, type TextStyle } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { matchesQuery, useSettingsUi } from "./SettingsContext";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsTooltip } from "./useSettingsTooltip";

type Props = {
    text: string;
    color?: string;
    tooltip?: string;
    greyable?: boolean;
    align?: TextStyle["textAlign"];
    testID?: string;
    children?: ReactNode;
};

export function SLabel({ text, color = SETTINGS_STYLE.text, tooltip, greyable = true, align, testID, children }: Props) {
    const { fonts } = useApp();
    const { query } = useSettingsUi();
    const hover = useSettingsTooltip(tooltip);
    const greyed = greyable && !matchesQuery(query, text);
    return (
        <View testID={testID} style={{ alignSelf: align === "center" ? "stretch" : "flex-start" }} {...hover}>
            <Text style={{ color, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE, lineHeight: SETTINGS_LINE_HEIGHT, textAlign: align }}>
                {text}
                {children}
            </Text>
            {greyed ? <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: SETTINGS_STYLE.greyOut }} /> : null}
        </View>
    );
}
