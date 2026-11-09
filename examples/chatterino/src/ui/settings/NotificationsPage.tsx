import { useState } from "react";
import { Platform, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { SCheckBox } from "./SCheckBox";
import { SLabel } from "./SLabel";
import { SPushButton } from "./SPushButton";
import { TabWidget } from "./TabWidget";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const NOTIFICATION_TABS = ["Options", "Selected Channels"];

export const NOTIFICATION_CHECKS = [
    "Flash taskbar",
    "Play sound for selected channels",
    "Play sound for any channel going live",
    "Suppress live notifications on startup",
    "Show notification",
    "Custom sound",
];

const TWITCH_NAME = /^[a-z0-9_]{1,25}$/i;

const COLUMNS: TableColumn<string>[] = [
    {
        title: "Twitch channels",
        kind: "text",
        text: (row) => row,
        edit: (_row, value) => value.trim().toLowerCase(),
        validate: (value) => TWITCH_NAME.test(value.trim()),
    },
];

const FLASH_NOTE = "Not available in this app: the taskbar can only be flashed on macOS.";

export function NotificationsPage() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const [tab, setTab] = useState(NOTIFICATION_TABS[0]);
    return (
        <View testID="settings-notifications" style={{ flex: 1, padding: 10, paddingRight: 9, gap: 8 }}>
            <TabWidget testID="notifications" tabs={NOTIFICATION_TABS} selected={tab} onSelect={setTab}>
                {tab === "Options" ? (
                    <View style={{ gap: 0 }}>
                        <View style={{ paddingVertical: 3 }}>
                            <SLabel text="You can be informed when certain channels go live. You can be informed in multiple ways:" greyable={false} />
                        </View>
                        <SCheckBox
                            testID="setting-notificationFlashTaskbar"
                            label="Flash taskbar"
                            checked={settings.notificationFlashTaskbar}
                            tooltip={Platform.OS === "macos" ? undefined : FLASH_NOTE}
                            onChange={(value) => update({ notificationFlashTaskbar: value })}
                        />
                        <SCheckBox
                            testID="setting-notificationPlaySound"
                            label="Play sound for selected channels"
                            checked={settings.notificationPlaySound}
                            onChange={(value) => update({ notificationPlaySound: value })}
                        />
                        <SCheckBox
                            testID="setting-notificationOnAnyChannel"
                            label="Play sound for any channel going live"
                            checked={settings.notificationOnAnyChannel}
                            onChange={(value) => update({ notificationOnAnyChannel: value })}
                        />
                        <SCheckBox
                            testID="setting-suppressInitialLiveNotification"
                            label="Suppress live notifications on startup"
                            checked={settings.suppressInitialLiveNotification}
                            onChange={(value) => update({ suppressInitialLiveNotification: value })}
                        />
                        <SCheckBox
                            testID="setting-liveNotifications"
                            label="Show notification"
                            checked={settings.liveNotifications}
                            onChange={(value) => update({ liveNotifications: value })}
                        />
                    </View>
                ) : (
                    <View style={{ flex: 1, gap: 6 }}>
                        <SLabel text="These are the channels for which you will be informed when they go live:" greyable={false} />
                        <EditableModelView
                            testID="notification-channels"
                            columns={COLUMNS}
                            rows={settings.notificationChannels}
                            onAdd={() => update({ notificationChannels: [...settings.notificationChannels, "channel"] })}
                            onChange={(notificationChannels) => update({ notificationChannels })}
                        />
                    </View>
                )}
            </TabWidget>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SCheckBox
                        testID="setting-notificationCustomSound"
                        label="Custom sound"
                        checked={settings.notificationCustomSound}
                        tooltip={settings.notificationPathSound || undefined}
                        onChange={(value) => update({ notificationCustomSound: value })}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <SPushButton
                        testID="notifications-select-sound"
                        label="Select custom sound file"
                        grow
                        onPress={() => actions.pickSound((path) => update({ notificationPathSound: path }))}
                    />
                </View>
            </View>
        </View>
    );
}
