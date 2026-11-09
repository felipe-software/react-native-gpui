import { ScrollView, Text, View } from "react-native-gpui";
import type { BlockedUsersVisibility } from "../../data/api";
import { useApp } from "../state/AppContext";
import { useStore } from "../state/useStore";
import { SCheckBox } from "./SCheckBox";
import { SComboBox } from "./SComboBox";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SLabel } from "./SLabel";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const IGNORE_USERS_LABEL = "/block <user> in chat blocks a user.\n/unblock <user> in chat unblocks a user.\nYou can also click on a user to open the usercard.";

const VISIBILITY = [
    { value: "never", label: "Never" },
    { value: "moderator", label: "If you are Moderator" },
    { value: "broadcaster", label: "If you are Broadcaster" },
];

export function IgnoreUsersTab() {
    const { core, settings, fonts } = useApp();
    const { update } = useSettingsUpdate();
    const twitchBlocks = useStore(core.blockedUsers);
    const users = [...new Set([...twitchBlocks, ...settings.ignoredUsers])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text={IGNORE_USERS_LABEL} greyable={false} />
            <SCheckBox
                testID="setting-enableTwitchBlockedUsers"
                label="Enable Twitch blocked users"
                checked={settings.enableTwitchBlockedUsers}
                onChange={(value) => update({ enableTwitchBlockedUsers: value })}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={text}>Show messages from blocked users:</Text>
                <SComboBox
                    testID="setting-showBlockedUsersMessages"
                    value={settings.showBlockedUsersMessages}
                    options={VISIBILITY}
                    width={186}
                    greyable={false}
                    onChange={(value) => update({ showBlockedUsersMessages: value as BlockedUsersVisibility })}
                />
            </View>
            <Text style={text}>List of blocked users:</Text>
            <ScrollView testID="blocked-users" style={{ flex: 1, borderWidth: 1, borderColor: SETTINGS_STYLE.tableBorder, backgroundColor: SETTINGS_STYLE.tableBackground }}>
                {users.map((user) => (
                    <View key={user} style={{ height: 22, justifyContent: "center", paddingHorizontal: 4 }}>
                        <Text style={text}>{user}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
