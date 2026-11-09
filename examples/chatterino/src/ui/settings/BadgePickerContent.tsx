import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { AVAILABLE_BADGES } from "./highlightRows";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SPushButton } from "./SPushButton";

type Badge = (typeof AVAILABLE_BADGES)[number];

type Props = { onPick: (badge: Badge) => void; onCancel: () => void };

export function BadgePickerContent({ onPick, onCancel }: Props) {
    const { fonts } = useApp();
    const [selected, setSelected] = useState<Badge>(AVAILABLE_BADGES[0]);
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    return (
        <View style={{ flex: 1, padding: 10, gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: SETTINGS_STYLE.tableBorder, backgroundColor: SETTINGS_STYLE.tableBackground }}>
                {AVAILABLE_BADGES.map((badge) => (
                    <View
                        key={badge.name}
                        testID={`badge-option-${badge.displayName}`}
                        style={{ height: 24, justifyContent: "center", paddingHorizontal: 6, backgroundColor: badge === selected ? SETTINGS_STYLE.tableSelection : undefined }}
                        onClick={() => setSelected(badge)}
                    >
                        <Text style={label}>{badge.displayName}</Text>
                    </View>
                ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                <SPushButton testID="badge-ok" label="OK" primary onPress={() => onPick(selected)} />
                <SPushButton testID="badge-cancel" label="Cancel" onPress={onCancel} />
            </View>
        </View>
    );
}
