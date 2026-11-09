import { Image, Text, View } from "react-native-gpui";
import { assetPath } from "../../data/assets";
import { useApp } from "../state/AppContext";
import { FontPickerContent } from "./FontPickerContent";
import { useSettingsUi } from "./SettingsContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsUpdate } from "./useSettingsUpdate";

type Props = { testID: string };

export function FontSettingWidget({ testID }: Props) {
    const { settings, fonts } = useApp();
    const ui = useSettingsUi();
    const { update } = useSettingsUpdate();
    const family = settings.fontFamily ?? fonts.chatFamily;
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };

    const open = () =>
        ui.openPopup({
            kind: "modal",
            title: "Pick Font",
            width: 600,
            height: 420,
            render: (close) => (
                <FontPickerContent
                    initial={{ family, size: settings.fontSize, weight: settings.fontWeight }}
                    onApply={(choice) => update({ fontFamily: choice.family, fontSize: choice.size, fontWeight: choice.weight })}
                    onClose={close}
                />
            ),
        });

    return (
        <View style={{ height: 31, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ ...label, flex: 1 }}>Font:</Text>
            <Text testID={`${testID}-current`} style={label}>{`${family}, ${settings.fontSize}pt`}</Text>
            <View
                testID={testID}
                accessibilityRole="button"
                accessibilityLabel="Change font"
                style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 2 }}
                onClick={open}
            >
                <Image source={{ uri: assetPath("buttons/edit.svg") }} style={{ width: 16, height: 16 }} />
            </View>
        </View>
    );
}
