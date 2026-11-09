import { View } from "react-native-gpui";
import type { FilterRecord } from "../../data/api";
import { checkFilterText } from "../../data/filters/lang/filter";
import { isValidFilter, newFilterId, QUICK_ADD_FILTER } from "../../data/filters/records";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { FilterEditorContent } from "./FilterEditorContent";
import { RegexInfoLink } from "./RegexInfoLink";
import { SCheckBox } from "./SCheckBox";
import { useSettingsUi } from "./SettingsContext";
import { SLabel } from "./SLabel";
import { SPushButton } from "./SPushButton";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const FILTERS_LABEL = "Selectively display messages in Splits using channel filters. Set filters under a Split menu.";

export function FiltersPage() {
    const { settings } = useApp();
    const ui = useSettingsUi();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const records = settings.filters;

    const showValidity = (record: FilterRecord) => {
        const result = checkFilterText(record.filter);
        const title = result.valid ? "Valid filter" : "Invalid filter";
        actions.message(title, result.valid ? "information" : "warning", result.message, result.detail);
    };

    const columns: TableColumn<FilterRecord>[] = [
        { title: "Name", kind: "text", width: 150, text: (row) => row.name, edit: (row, value) => ({ ...row, name: value }) },
        { title: "Filter", kind: "text", text: (row) => row.filter, edit: (row, value) => ({ ...row, filter: value }) },
        {
            title: "Valid",
            kind: "action",
            width: 125,
            text: (row) => (isValidFilter(row.filter) ? "✓ Valid" : "Show errors"),
            onActivate: (row) => showValidity(row),
        },
    ];

    const add = () =>
        ui.openPopup({
            kind: "modal",
            title: "Channel Filter Creator",
            width: 560,
            height: 230,
            render: (close) => (
                <FilterEditorContent
                    onAccept={(name, filter) => {
                        update({ filters: [...records, { id: newFilterId(), name, filter }] });
                        close();
                    }}
                    onCancel={close}
                />
            ),
        });

    return (
        <View testID="settings-filters" style={{ flex: 1, padding: 10, paddingRight: 9, gap: 6 }}>
            <SLabel text={FILTERS_LABEL} greyable={false} />
            <EditableModelView
                testID="filters"
                columns={columns}
                rows={records}
                query={ui.query}
                searchColumns={[0, 1]}
                customButtons={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <SPushButton
                            testID="filters-quick-add"
                            label="Quick Add"
                            onPress={() => update({ filters: [...records, { id: newFilterId(), ...QUICK_ADD_FILTER }] })}
                        />
                        <RegexInfoLink testID="filters-info" label="filter info" url="https://wiki.chatterino.com/Filters" />
                    </View>
                }
                onAdd={add}
                onChange={(filters) => update({ filters })}
            />
            <SCheckBox
                testID="setting-excludeUserMessagesFromFilter"
                label="Do not filter my own messages"
                checked={settings.excludeUserMessagesFromFilter}
                greyable={false}
                onChange={(value) => update({ excludeUserMessagesFromFilter: value })}
            />
        </View>
    );
}
