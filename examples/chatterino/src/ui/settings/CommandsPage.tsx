import { View } from "react-native-gpui";
import type { CustomCommand } from "../../data/api";
import { duplicateTriggers } from "../../data/twitch/custom-commands";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { RichText } from "./RichText";
import { useSettingsUi } from "./SettingsContext";
import { SETTINGS_STYLE } from "./settingsStyle";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const COMMANDS_HELP = "{1} => first word     {1+} => first word and after     {{ => {     more info";
const DUPLICATE_WARNING = "Multiple commands with the same trigger found. Only one of the commands will work.";

export function CommandsPage() {
    const { settings, openUrl } = useApp();
    const { query } = useSettingsUi();
    const { update } = useSettingsUpdate();
    const duplicates = duplicateTriggers(settings.commands);
    const columns: TableColumn<CustomCommand>[] = [
        {
            title: "Trigger",
            kind: "text",
            width: 98,
            text: (row) => row.trigger,
            edit: (row, value) => ({ ...row, trigger: value.trim() }),
            textColor: (row) => (duplicates.has(row.trigger) ? SETTINGS_STYLE.warning : undefined),
        },
        { title: "Command", kind: "text", text: (row) => row.command, edit: (row, value) => ({ ...row, command: value.trim() }) },
        {
            title: "Show In\nMessage Menu",
            kind: "check",
            width: 100,
            headerWidth: 112,
            checked: (row) => row.showInMessageMenu,
            toggle: (row, value) => ({ ...row, showInMessageMenu: value }),
        },
    ];
    return (
        <View testID="settings-commands" style={{ flex: 1, padding: 10, paddingRight: 9, gap: 6 }}>
            <EditableModelView
                testID="commands"
                columns={columns}
                rows={settings.commands}
                query={query}
                searchColumns={[0, 1]}
                onAdd={() => update({ commands: [...settings.commands, { trigger: "/command", command: "I made a new command HeyGuys", showInMessageMenu: false }] })}
                onChange={(commands) => update({ commands })}
            />
            <RichText
                testID="commands-help"
                text={COMMANDS_HELP}
                links={[{ label: "more info", url: "https://chatterino.com/help/commands" }]}
                color={SETTINGS_STYLE.note}
                onOpen={openUrl}
            />
            {duplicates.size > 0 ? <SLabel testID="commands-duplicates" text={DUPLICATE_WARNING} color={SETTINGS_STYLE.warning} greyable={false} /> : null}
        </View>
    );
}
