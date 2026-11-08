import type { ReactNode } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = { label: string; description?: string; children: ReactNode };

export function SettingRow({ label, description, children }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    return (
        <View style={{ paddingVertical: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 28 }}>
                <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{label}</Text>
                {children}
            </View>
            {description ? (
                <Text style={{ color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1 }}>{description}</Text>
            ) : null}
        </View>
    );
}
