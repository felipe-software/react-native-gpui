import { useState } from "react";
import { Platform, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { HighlightBadgesTab } from "./HighlightBadgesTab";
import { HighlightBlacklistTab } from "./HighlightBlacklistTab";
import { HighlightMessagesTab } from "./HighlightMessagesTab";
import { defaultSoundLabel, HIGHLIGHT_LABELS } from "./highlightRows";
import { HighlightUsersTab } from "./HighlightUsersTab";
import { SCheckBox } from "./SCheckBox";
import { SLabel } from "./SLabel";
import { SPushButton } from "./SPushButton";
import { TabWidget } from "./TabWidget";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const HIGHLIGHT_TABS = ["Messages", "Users", "Badges", "Blacklisted Users"];

const DEFAULT_SOUND_TOOLTIP = "This sound will play for all highlight phrases that have sound enabled and don't have a custom sound set.";
const FLASH_NOTE = "Not available in this app: the taskbar can only be flashed on macOS.";

export function HighlightsPage() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const [tab, setTab] = useState(HIGHLIGHT_TABS[0]);
    const soundPath = settings.pathHighlightSound;
    return (
        <View testID="settings-highlights" style={{ flex: 1, padding: 10, paddingRight: 9, gap: 6 }}>
            <TabWidget testID="highlights" tabs={HIGHLIGHT_TABS} selected={tab} onSelect={setTab}>
                {tab === "Messages" ? <HighlightMessagesTab /> : null}
                {tab === "Users" ? <HighlightUsersTab /> : null}
                {tab === "Badges" ? <HighlightBadgesTab /> : null}
                {tab === "Blacklisted Users" ? <HighlightBlacklistTab /> : null}
            </TabWidget>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                    <SLabel testID="highlight-default-sound" text={defaultSoundLabel(soundPath)} tooltip={DEFAULT_SOUND_TOOLTIP} />
                </View>
                {soundPath ? <SPushButton testID="highlight-sound-clear" label="Clear" onPress={() => update({ pathHighlightSound: "" })} /> : null}
                <SPushButton testID="highlight-sound-change" label="Change..." onPress={() => actions.pickSound((path) => update({ pathHighlightSound: path }))} />
            </View>
            <SCheckBox
                testID="setting-highlightAlwaysPlaySound"
                label={HIGHLIGHT_LABELS.alwaysPlay}
                checked={settings.highlightAlwaysPlaySound}
                onChange={(value) => update({ highlightAlwaysPlaySound: value })}
            />
            <SCheckBox
                testID="setting-longAlerts"
                label={HIGHLIGHT_LABELS.longAlerts}
                checked={settings.longAlerts}
                tooltip={Platform.OS === "macos" ? undefined : FLASH_NOTE}
                onChange={(value) => update({ longAlerts: value })}
            />
        </View>
    );
}
