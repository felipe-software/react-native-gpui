import { useState } from "react";
import { Svg, Text, View } from "react-native-gpui";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import type { MenuEntry } from "../state/overlays";
import { MENU_COLORS } from "../theme";
import { MenuMark } from "./MenuMark";

type Props = {
    entry: Exclude<MenuEntry, { kind: "separator" }>;
    testID: string;
    highlighted: boolean;
    shortcutWidth: number;
    onHover: () => void;
    onPress: () => void;
};

export const MENU_ROW_HEIGHT = 24;

export function MenuRow({ entry, testID, highlighted, shortcutWidth, onHover, onPress }: Props) {
    const { fonts } = useApp();
    const [hovered, setHovered] = useState(false);
    const disabled = entry.kind === "item" && !!entry.disabled;
    const active = (hovered || highlighted) && !disabled;
    const textColor = disabled ? MENU_COLORS.disabledText : MENU_COLORS.text;
    const shortcut = entry.kind === "item" ? entry.shortcut : undefined;
    const text = { color: textColor, fontFamily: fonts.appFamily, fontSize: fonts.appSize };
    return (
        <View
            testID={testID}
            accessibilityRole="menuitem"
            accessibilityLabel={entry.label}
            accessibilityState={{ disabled }}
            style={{
                height: MENU_ROW_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                paddingRight: 8,
                backgroundColor: active ? MENU_COLORS.highlight : undefined,
                borderWidth: active ? 1 : 0,
                borderColor: MENU_COLORS.highlightOutline,
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHover();
            }}
            onMouseLeave={() => setHovered(false)}
            onClick={disabled ? undefined : onPress}
        >
            <View style={{ width: 28, paddingLeft: 8, justifyContent: "center" }}>
                <MenuMark entry={entry} />
            </View>
            <Text numberOfLines={1} style={{ ...text, flex: 1 }}>
                {entry.label}
            </Text>
            {shortcutWidth > 0 ? (
                <Text numberOfLines={1} style={{ ...text, width: shortcutWidth }}>
                    {shortcut ?? ""}
                </Text>
            ) : null}
            {entry.kind === "submenu" ? <Svg name={ICONS.chevronRight} style={{ width: 10, height: 10, color: textColor }} /> : null}
        </View>
    );
}
