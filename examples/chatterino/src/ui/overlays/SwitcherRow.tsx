import { Image, Text, View } from "react-native-gpui";
import { assetPath } from "../assetPaths";
import { useApp } from "../state/AppContext";
import type { SwitcherItem } from "./switcherItems";

type Props = { item: SwitcherItem; selected: boolean; onHover: () => void; onPress: () => void };

const ROW_HEIGHT = 32;
const SELECTED = "rgba(0, 174, 239, 0.392)";

function iconOf(item: SwitcherItem): string {
    if (item.kind === "newTab") return assetPath("plus.svg");
    if (item.kind === "newPopup") return assetPath("popup.svg");
    return assetPath("switch.svg");
}

export function SwitcherRow({ item, selected, onHover, onPress }: Props) {
    const { theme, fonts } = useApp();
    const text = { color: theme.header.text, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize };
    const bold = { ...text, fontWeight: "700" as const };
    return (
        <View
            testID={`switcher-${item.key}`}
            accessibilityRole="menuitem"
            accessibilityState={{ selected }}
            style={{ height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", backgroundColor: selected ? SELECTED : undefined }}
            onMouseEnter={onHover}
            onClick={onPress}
        >
            <Image source={{ uri: iconOf(item) }} style={{ width: ROW_HEIGHT, height: ROW_HEIGHT }} resizeMode="contain" />
            {item.kind === "split" ? (
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingRight: 4 }}>
                    <Text numberOfLines={1} style={{ ...bold, flex: 3 }}>
                        {item.channel}
                    </Text>
                    <View style={{ flex: 7, alignItems: "flex-end" }}>
                        <Text numberOfLines={1} style={text}>
                            {item.tabTitle}
                        </Text>
                    </View>
                </View>
            ) : null}
            {item.kind === "tab" ? (
                <Text numberOfLines={1} style={{ ...bold, flex: 1, paddingLeft: 4 }}>
                    {item.tabTitle}
                </Text>
            ) : null}
            {item.kind === "newTab" || item.kind === "newPopup" ? (
                <Text numberOfLines={1} style={{ ...text, flex: 1, paddingLeft: 4 }}>
                    {item.label}
                </Text>
            ) : null}
        </View>
    );
}
