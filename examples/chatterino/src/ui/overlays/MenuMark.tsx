import { Svg, View } from "react-native-gpui";
import { ICONS } from "../icons";
import type { MenuEntry } from "../state/overlays";
import { MENU_COLORS } from "../theme";

export function MenuMark({ entry }: { entry: Exclude<MenuEntry, { kind: "separator" }> }) {
    if (entry.kind !== "item" || entry.checked === undefined) return null;
    if (entry.radio) {
        return entry.checked ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: MENU_COLORS.checkMark }} /> : null;
    }
    return (
        <View
            style={{
                width: 14,
                height: 14,
                borderWidth: 1,
                borderColor: MENU_COLORS.checkBorder,
                backgroundColor: MENU_COLORS.checkFill,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {entry.checked ? <Svg name={ICONS.check} style={{ width: 12, height: 12, color: MENU_COLORS.checkMark }} /> : null}
        </View>
    );
}
