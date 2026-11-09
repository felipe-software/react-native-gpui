import { Text, View } from "react-native-gpui";
import { LocalStorage } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { TIMESTAMP_FORMATS } from "./generalHelpers";
import { RichText } from "./RichText";
import { SCheckBox } from "./SCheckBox";
import { SComboBox } from "./SComboBox";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "./settingsStyle";
import { SPushButton } from "./SPushButton";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const NO_LOGGING = "Not available in this app: the runtime has no file-writing API, so chat logs cannot be saved.";

const COLUMNS: TableColumn<string>[] = [{ title: "Twitch channels", kind: "text", text: (row) => row, edit: (_row, value) => value.trim().toLowerCase() }];

function defaultLogDirectory(): string {
    const storage = LocalStorage.getPath();
    if (!storage) return "~/.local/share/chatterino/Logs";
    return `${storage.slice(0, storage.lastIndexOf("/"))}/Logs`;
}

export function ModerationLogsTab() {
    const { settings, fonts } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const path = settings.logPath || defaultLogDirectory();
    const loggingOff = !settings.enableLogging;
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    const formats = [{ value: "Disable", label: "Disable" }, ...TIMESTAMP_FORMATS.map((format) => ({ value: format, label: format }))];
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <View>
                <SCheckBox
                    testID="setting-enableLogging"
                    label="Enable logging"
                    checked={settings.enableLogging}
                    tooltip={NO_LOGGING}
                    onChange={(value) => update({ enableLogging: value })}
                />
                <RichText
                    text={`Logs are saved at ${path}. They are saved as plain text files per channel, containing the messages with timestamps.`}
                    color={SETTINGS_STYLE.note}
                    onOpen={() => undefined}
                />
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
                <SPushButton testID="logs-select" label="Select log directory " onPress={() => actions.pickDirectory((dir) => update({ logPath: dir }))} />
                <SPushButton testID="logs-reset" label="Reset" disabled={!settings.logPath} onPress={() => update({ logPath: "" })} />
            </View>
            <Text style={{ ...label, lineHeight: SETTINGS_LINE_HEIGHT }}>Your logs currently take up 0.00 Bytes of space</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ ...label, flex: 1 }}>Log file timestamp format: </Text>
                <SComboBox
                    testID="setting-logTimestampFormat"
                    value={settings.logTimestampFormat}
                    options={formats}
                    width={346}
                    tooltip="a = am/pm, zzz = milliseconds"
                    onChange={(value) => update({ logTimestampFormat: value })}
                />
            </View>
            <View>
                <SCheckBox
                    testID="setting-tryUseTwitchTimestamps"
                    label="Use Twitch's timestamps"
                    checked={settings.tryUseTwitchTimestamps}
                    disabled={loggingOff}
                    tooltip="Try to use Twitch's timestamp (the time when the message was received by Twitch's chat server), rather than your computer's local timestamp.\nNote that using this setting can result in out-of-order timestamps in the log files, and that if Twitch's timestamp was unavailable for a message, it will fall back to your computer's local timestamp."
                    onChange={(value) => update({ tryUseTwitchTimestamps: value })}
                />
                <SCheckBox
                    testID="setting-onlyLogListedChannels"
                    label="Only log channels listed below"
                    checked={settings.onlyLogListedChannels}
                    disabled={loggingOff}
                    onChange={(value) => update({ onlyLogListedChannels: value })}
                />
                <SCheckBox
                    testID="setting-separatelyStoreStreamLogs"
                    label="Store live stream logs as separate files"
                    checked={settings.separatelyStoreStreamLogs}
                    disabled={loggingOff}
                    onChange={(value) => update({ separatelyStoreStreamLogs: value })}
                />
            </View>
            <EditableModelView
                testID="logged-channels"
                columns={COLUMNS}
                rows={settings.loggedChannels}
                onAdd={() => update({ loggedChannels: [...settings.loggedChannels, "channel"] })}
                onChange={(loggedChannels) => update({ loggedChannels })}
            />
        </View>
    );
}
