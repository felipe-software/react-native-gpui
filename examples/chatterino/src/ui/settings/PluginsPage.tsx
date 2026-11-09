import { Text, View } from "react-native-gpui";
import { LocalStorage } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { RichText } from "./RichText";
import { SCheckBox } from "./SCheckBox";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const PLUGINS_WARNING =
    "Plugins can expand functionality of Chatterino. They can be made in Lua. This functionality is still in public alpha stage. Use ONLY the plugins you trust. The permission system is best effort, always assume plugins can bypass permissions and can execute arbitrary code. To see how to create plugins look at the manual.";

const NO_PLUGINS = "Not available in this app: there is no Lua runtime, so plugins cannot be loaded.";

function pluginsDirectory(): string {
    const storage = LocalStorage.getPath();
    if (!storage) return "~/.local/share/chatterino/Plugins";
    return `${storage.slice(0, storage.lastIndexOf("/"))}/Plugins`;
}

export function PluginsPage() {
    const { settings, fonts, openUrl } = useApp();
    const { update } = useSettingsUpdate();
    return (
        <View testID="settings-plugins" style={{ flex: 1, padding: 10, paddingRight: 17 }}>
            <Text style={{ color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE, marginLeft: 1, marginBottom: 2 }}>
                General plugin settings
            </Text>
            <View style={{ borderWidth: 1, borderColor: SETTINGS_STYLE.groupBorder, borderRadius: 2, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 85 }}>
                <RichText
                    text={PLUGINS_WARNING}
                    links={[{ label: "look at the manual", url: "https://github.com/Chatterino/chatterino2/blob/master/docs/wip-plugins.md" }]}
                    color={SETTINGS_STYLE.text}
                    onOpen={openUrl}
                />
                <RichText
                    text={`You can load plugins by putting them into the Plugins directory. Each one is a new directory.`}
                    links={[{ label: "the Plugins directory", url: `file://${pluginsDirectory()}` }]}
                    color={SETTINGS_STYLE.note}
                    onOpen={() => undefined}
                />
                <SCheckBox
                    testID="setting-pluginsEnabled"
                    label="Enable plugins"
                    checked={settings.pluginsEnabled}
                    tooltip={NO_PLUGINS}
                    onChange={(value) => update({ pluginsEnabled: value })}
                />
            </View>
        </View>
    );
}
