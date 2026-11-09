import { View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { ColorPickerContent } from "./ColorPickerContent";
import { ColorSwatch } from "./ColorSwatch";
import { recentColors } from "./recentColors";
import { useSettingsUi } from "./SettingsContext";

type Props = { testID: string; color: string | undefined; width?: number; height?: number; onChange: (color: string) => void };

export function openColorPicker(ui: ReturnType<typeof useSettingsUi>, initial: string | undefined, recent: string[], onChange: (color: string) => void): void {
    ui.openPopup({
        kind: "modal",
        title: "Chatterino - Color picker",
        width: 430,
        height: 360,
        render: (close) => (
            <ColorPickerContent
                initial={initial}
                recent={recent}
                onAccept={(value) => {
                    onChange(value);
                    close();
                }}
                onCancel={close}
            />
        ),
    });
}

export function ColorButton({ testID, color, width = 20, height = 20, onChange }: Props) {
    const { settings } = useApp();
    const ui = useSettingsUi();
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel="Pick color"
            style={{ borderWidth: 1, borderColor: "#000000", borderRadius: 2, overflow: "hidden" }}
            onClick={() => openColorPicker(ui, color, recentColors(settings), onChange)}
        >
            <ColorSwatch color={color} width={width} height={height} cell={5} />
        </View>
    );
}
