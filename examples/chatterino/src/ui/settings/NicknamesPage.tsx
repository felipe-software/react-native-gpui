import { View } from "react-native-gpui";
import type { Nickname } from "../../data/api";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { useSettingsUi } from "./SettingsContext";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsUpdate } from "./useSettingsUpdate";

const COLUMNS: TableColumn<Nickname>[] = [
    { title: "Username", kind: "text", width: 200, text: (row) => row.name, edit: (row, value) => ({ ...row, name: value.trim() }) },
    { title: "Nickname", kind: "text", text: (row) => row.replace, edit: (row, value) => ({ ...row, replace: value }) },
    { title: "Enable regex", kind: "check", width: 108, checked: (row) => row.isRegex, toggle: (row, value) => ({ ...row, isRegex: value }) },
    { title: "Case-sensitive", kind: "check", width: 112, checked: (row) => row.caseSensitive, toggle: (row, value) => ({ ...row, caseSensitive: value }) },
];

export const NICKNAMES_NOTE =
    "Nicknames do not work with features such as user highlights and filters.\nWith those features you will still need to use the user's original name.";

export function NicknamesPage() {
    const { settings } = useApp();
    const { query } = useSettingsUi();
    const { update } = useSettingsUpdate();
    return (
        <View testID="settings-nicknames" style={{ flex: 1, padding: 10, paddingRight: 9, gap: 6 }}>
            <SLabel text={NICKNAMES_NOTE} greyable={false} />
            <EditableModelView
                testID="nicknames"
                columns={COLUMNS}
                rows={settings.nicknames}
                query={query}
                searchColumns={[0, 1]}
                onAdd={() => update({ nicknames: [...settings.nicknames, { name: "Username", replace: "Nickname", isRegex: false, caseSensitive: false }] })}
                onChange={(nicknames) => update({ nicknames })}
            />
        </View>
    );
}
