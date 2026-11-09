import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { HotkeyOverride } from "../../data/api";
import { HOTKEYS } from "../hotkeys";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { HotkeyEditContent } from "./HotkeyEditContent";
import { HotkeyNameCell } from "./HotkeyNameCell";
import { HOTKEY_CATEGORIES, resolveHotkeys, type HotkeyCategory, type HotkeyEntry } from "./hotkeyCatalog";
import { useSettingsUi } from "./SettingsContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { SPushButton } from "./SPushButton";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

type Row = { kind: "category"; category: HotkeyCategory } | { kind: "hotkey"; entry: HotkeyEntry };

const IMPLEMENTED = new Set(HOTKEYS.map((binding) => binding.id));

function isWorking(entry: HotkeyEntry): boolean {
    return !!entry.builtIn || (!!entry.action && IMPLEMENTED.has(entry.action));
}

function normalizeKey(text: string): string {
    return text.replace(/\s+/g, "").toLowerCase();
}

export function HotkeysPage() {
    const { settings, fonts } = useApp();
    const ui = useSettingsUi();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const [keyQuery, setKeyQuery] = useState("");
    const overrides = settings.hotkeyOverrides;
    const entries = resolveHotkeys(overrides);
    const needle = ui.query.trim().toLowerCase();
    const keyNeedle = normalizeKey(keyQuery);
    const visible = entries.filter((entry) => {
        const nameMatches = !needle || entry.name.toLowerCase().includes(needle);
        const keyMatches = !keyNeedle || normalizeKey(entry.key) === keyNeedle;
        return nameMatches && keyMatches;
    });
    const rows: Row[] = [];
    for (const category of HOTKEY_CATEGORIES) {
        const inCategory = visible.filter((entry) => entry.category === category);
        if (inCategory.length === 0) continue;
        rows.push({ kind: "category", category });
        for (const entry of inCategory) rows.push({ kind: "hotkey", entry });
    }

    const setOverride = (next: HotkeyOverride) => update({ hotkeyOverrides: [...overrides.filter((override) => override.id !== next.id), next] });

    const columns: TableColumn<Row>[] = [
        {
            title: "Hotkey name",
            kind: "custom",
            width: 222,
            render: (row) =>
                row.kind === "category" ? (
                    <HotkeyNameCell text={row.category} category working />
                ) : (
                    <HotkeyNameCell text={row.entry.name} category={false} working={isWorking(row.entry)} />
                ),
        },
        {
            title: "Keybinding",
            kind: "text",
            text: (row) => (row.kind === "hotkey" ? row.entry.key : ""),
            enabled: (row) => row.kind === "hotkey",
            textColor: (row) => (row.kind === "hotkey" && !isWorking(row.entry) ? SETTINGS_STYLE.disabledText : SETTINGS_STYLE.text),
            edit: (row, value) => {
                if (row.kind === "hotkey") setOverride({ id: row.entry.name, key: value.trim(), action: row.entry.action, category: row.entry.category });
                return row;
            },
        },
    ];

    const change = (next: Row[]) => {
        const kept = new Set(next.filter((row): row is Extract<Row, { kind: "hotkey" }> => row.kind === "hotkey").map((row) => row.entry.name));
        const removed = visible.find((entry) => !kept.has(entry.name));
        if (!removed) return;
        setOverride({ id: removed.name, key: removed.key, removed: true, action: removed.action, category: removed.category });
    };

    const add = () =>
        ui.openPopup({
            kind: "modal",
            title: "Add hotkey",
            width: 420,
            height: 220,
            render: (close) => (
                <HotkeyEditContent
                    onAccept={(override) => {
                        setOverride(override);
                        close();
                    }}
                    onCancel={close}
                />
            ),
        });

    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };

    return (
        <View testID="settings-hotkeys" style={{ flex: 1, padding: 10, paddingRight: 9 }}>
            <EditableModelView
                testID="hotkeys"
                columns={columns}
                rows={rows}
                onAdd={add}
                onChange={change}
                customButtons={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={label}>Search keybind:</Text>
                        <SLineEdit testID="hotkeys-search-keybind" value={keyQuery} placeholder="Press shortcut" width={90} onChange={setKeyQuery} />
                        <SPushButton
                            testID="hotkeys-reset"
                            label="Reset to defaults"
                            onPress={() => actions.confirm("Reset hotkeys", "Are you sure you want to reset hotkeys to defaults?", () => update({ hotkeyOverrides: [] }))}
                        />
                    </View>
                }
            />
        </View>
    );
}
