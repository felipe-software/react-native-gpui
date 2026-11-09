import { View } from "react-native-gpui";
import type { BlacklistedUser } from "../../data/api";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { HIGHLIGHT_LABELS } from "./highlightRows";
import { RegexInfoLink } from "./RegexInfoLink";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsUpdate } from "./useSettingsUpdate";

const COLUMNS: TableColumn<BlacklistedUser>[] = [
    { title: "Username", kind: "text", text: (row) => row.pattern, edit: (row, value) => ({ ...row, pattern: value.trim() }) },
    { title: "Enable\nregex", kind: "check", width: 60, checked: (row) => row.isRegex, toggle: (row, value) => ({ ...row, isRegex: value }) },
];

export function HighlightBlacklistTab() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text={HIGHLIGHT_LABELS.blacklist} greyable={false} />
            <EditableModelView
                testID="highlight-blacklist"
                columns={COLUMNS}
                rows={settings.blacklistedUsers}
                customButtons={<RegexInfoLink />}
                onAdd={() => update({ blacklistedUsers: [...settings.blacklistedUsers, { pattern: "blacklisted user", isRegex: false }] })}
                onChange={(blacklistedUsers) => update({ blacklistedUsers })}
            />
        </View>
    );
}
