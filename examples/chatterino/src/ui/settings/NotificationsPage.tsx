import { Text, View } from "react-native-gpui";
import { Checkbox } from "../common/Checkbox";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { SettingsTitle } from "./SettingsTitle";
import { useSettingsUpdate } from "./useSettingsUpdate";

export function NotificationsPage() {
    const { settings, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const { update } = useSettingsUpdate();
    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Live Notifications" />
            <Text style={{ color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1, marginBottom: 8 }}>
                You can be informed when channels you have open go live.
            </Text>
            <SettingsTitle text="Options" subtitle />
            <Checkbox
                testID="setting-live-notifications"
                label="Show notification"
                checked={settings.liveNotifications}
                onChange={(value) => update({ liveNotifications: value })}
            />
        </View>
    );
}
