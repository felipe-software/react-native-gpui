import { Text, View } from "react-native-gpui";
import type { TimeoutButton, TimeoutUnit } from "../../data/api";
import { useApp } from "../state/AppContext";
import { SComboBox } from "./SComboBox";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { useSettingsUpdate } from "./useSettingsUpdate";

const UNITS: TimeoutUnit[] = ["s", "m", "h", "d", "w"];
const UNIT_LIMIT: Partial<Record<TimeoutUnit, number>> = { d: 14, w: 2 };

export function clampTimeout(unit: TimeoutUnit, value: number): number {
    const limit = UNIT_LIMIT[unit] ?? 99;
    return Math.max(1, Math.min(limit, value));
}

export function TimeoutButtonsTab() {
    const { settings, fonts } = useApp();
    const { update } = useSettingsUpdate();
    const buttons = settings.timeoutButtons;
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    const setButton = (index: number, next: TimeoutButton) => update({ timeoutButtons: buttons.map((button, position) => (position === index ? next : button)) });
    return (
        <View style={{ flex: 1, gap: 7 }}>
            <View style={{ alignItems: "center", gap: 2, marginBottom: 15 }}>
                <Text style={{ ...label, textAlign: "center", lineHeight: SETTINGS_LINE_HEIGHT }}>
                    {"Customize the timeout buttons in the user popup (accessible through clicking a username).\nUse seconds (s), minutes (m), hours (h), days (d) or weeks (w)."}
                </Text>
                <Text style={{ ...label, textAlign: "center", marginTop: 6 }}>(maximum timeout duration = 2 w)</Text>
            </View>
            {buttons.map((button, index) => (
                <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 40 }}>
                    <Text style={{ ...label, width: 70 }}>{`Button ${index + 1}: `}</Text>
                    <SLineEdit
                        testID={`timeout-value-${index}`}
                        value={String(button.value)}
                        width={30}
                        align="right"
                        onChange={(text) => {
                            const parsed = Number.parseInt(text, 10);
                            if (Number.isFinite(parsed)) setButton(index, { unit: button.unit, value: clampTimeout(button.unit, parsed) });
                        }}
                    />
                    <SComboBox
                        testID={`timeout-unit-${index}`}
                        value={button.unit}
                        options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                        width={42}
                        greyable={false}
                        onChange={(unit) => setButton(index, { unit: unit as TimeoutUnit, value: clampTimeout(unit as TimeoutUnit, button.value) })}
                    />
                </View>
            ))}
        </View>
    );
}
