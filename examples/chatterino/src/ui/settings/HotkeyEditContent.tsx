import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { HotkeyOverride } from "../../data/api";
import { useApp } from "../state/AppContext";
import { DEFAULT_HOTKEYS, HOTKEY_CATEGORIES, type HotkeyCategory } from "./hotkeyCatalog";
import { SComboBox } from "./SComboBox";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { SPushButton } from "./SPushButton";

type Props = { onAccept: (override: HotkeyOverride) => void; onCancel: () => void };

function actionsFor(category: HotkeyCategory) {
    return DEFAULT_HOTKEYS.filter((entry) => entry.category === category && entry.action).map((entry) => ({ value: entry.action as string, label: entry.name }));
}

export function HotkeyEditContent({ onAccept, onCancel }: Props) {
    const { fonts } = useApp();
    const [name, setName] = useState("");
    const [category, setCategory] = useState<HotkeyCategory>("Window");
    const [action, setAction] = useState(actionsFor("Window")[0]?.value ?? "");
    const [key, setKey] = useState("");
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE, width: 100 };
    const valid = name.trim().length > 0 && key.trim().length > 0 && !!action;
    return (
        <View style={{ flex: 1, padding: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={label}>Name</Text>
                <SLineEdit testID="hotkey-name" value={name} grow onChange={setName} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={label}>Category</Text>
                <SComboBox
                    testID="hotkey-category"
                    value={category}
                    options={HOTKEY_CATEGORIES.map((entry) => ({ value: entry, label: entry }))}
                    width={220}
                    greyable={false}
                    onChange={(value) => {
                        const next = value as HotkeyCategory;
                        setCategory(next);
                        setAction(actionsFor(next)[0]?.value ?? "");
                    }}
                />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={label}>Action</Text>
                <SComboBox testID="hotkey-action" value={action} options={actionsFor(category)} width={260} greyable={false} onChange={setAction} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={label}>Keybinding</Text>
                <SLineEdit testID="hotkey-key" value={key} placeholder="Ctrl+Shift+X" grow onChange={setKey} />
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                <SPushButton
                    testID="hotkey-ok"
                    label="OK"
                    primary
                    disabled={!valid}
                    onPress={() => onAccept({ id: name.trim(), key: key.trim(), action, category })}
                />
                <SPushButton testID="hotkey-cancel" label="Cancel" onPress={onCancel} />
            </View>
        </View>
    );
}
