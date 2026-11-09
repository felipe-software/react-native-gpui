import { Image, Text, View } from "react-native-gpui";
import { assetPath } from "../../data/assets";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_ROW_HEIGHT, SETTINGS_STYLE } from "./settingsStyle";

type Props = { name: string; icon: string; selected: boolean; marginTop: number; onSelect: () => void };

const ICON_SIZE = 20;
const ICON_PAD = (SETTINGS_ROW_HEIGHT - ICON_SIZE) / 2;
const LABEL_WIDTH = 200;

export function SettingsNavTab({ name, icon, selected, marginTop, onSelect }: Props) {
    const { fonts } = useApp();
    return (
        <View
            testID={`settings-page-${name}`}
            accessibilityRole="tab"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            style={{
                height: SETTINGS_ROW_HEIGHT,
                marginTop,
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: ICON_PAD,
                backgroundColor: selected ? SETTINGS_STYLE.navSelectedBackground : undefined,
                overflow: "hidden",
                cursor: "pointer",
            }}
            onMouseDown={onSelect}
        >
            <Image source={{ uri: assetPath(icon) }} style={{ width: ICON_SIZE, height: ICON_SIZE }} />
            <Text
                style={{
                    width: LABEL_WIDTH,
                    flexShrink: 0,
                    marginLeft: ICON_PAD * 2,
                    color: selected ? SETTINGS_STYLE.accent : SETTINGS_STYLE.text,
                    fontFamily: fonts.appFamily,
                    fontSize: SETTINGS_FONT_SIZE,
                }}
            >
                {name}
            </Text>
        </View>
    );
}
