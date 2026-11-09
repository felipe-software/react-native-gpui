import type { ReactNode } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = { title: string; testID?: string; children: ReactNode };

export function GroupBox({ title, testID, children }: Props) {
    const { fonts } = useApp();
    return (
        <View testID={testID} style={{ marginTop: 6 }}>
            <Text style={{ color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE, marginLeft: 1, marginBottom: 2 }}>{title}</Text>
            <View style={{ borderWidth: 1, borderColor: SETTINGS_STYLE.groupBorder, borderRadius: 2, paddingHorizontal: 19, paddingVertical: 17 }}>{children}</View>
        </View>
    );
}
