import { View } from "react-native-gpui";
import type { IgnoredPhrase } from "../../data/api";
import { DEFAULT_IGNORE_REPLACEMENT, isBlockPhrase } from "../../data/filters/ignores";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { RegexInfoLink } from "./RegexInfoLink";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsUpdate } from "./useSettingsUpdate";

const COLUMNS: TableColumn<IgnoredPhrase>[] = [
    { title: "Pattern", kind: "text", text: (row) => row.pattern, edit: (row, value) => ({ ...row, pattern: value }) },
    { title: "Regex", kind: "check", width: 52, checked: (row) => row.isRegex, toggle: (row, value) => ({ ...row, isRegex: value }) },
    { title: "Case-sensitive", kind: "check", width: 118, checked: (row) => row.caseSensitive, toggle: (row, value) => ({ ...row, caseSensitive: value }) },
    {
        title: "Block",
        kind: "check",
        width: 50,
        checked: (row) => isBlockPhrase(row),
        toggle: (row, value) => ({ ...row, isBlock: value, replaceWith: row.replaceWith ?? DEFAULT_IGNORE_REPLACEMENT }),
    },
    {
        title: "Replacement",
        kind: "text",
        width: 106,
        text: (row) => row.replaceWith ?? "",
        edit: (row, value) => ({ ...row, replaceWith: value }),
    },
];

export function IgnorePhrasesTab() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    const add = () =>
        update({
            ignoredPhrases: [...settings.ignoredPhrases, { pattern: "my pattern", isRegex: false, caseSensitive: true, isBlock: false, replaceWith: DEFAULT_IGNORE_REPLACEMENT }],
        });
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text="Ignore messages based certain patterns." greyable={false} />
            <EditableModelView
                testID="ignore-phrases"
                columns={COLUMNS}
                rows={settings.ignoredPhrases}
                customButtons={<RegexInfoLink />}
                onAdd={add}
                onChange={(ignoredPhrases) => update({ ignoredPhrases })}
            />
        </View>
    );
}
