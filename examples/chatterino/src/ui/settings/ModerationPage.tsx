import { useState } from "react";
import { View } from "react-native-gpui";
import { ModerationButtonsTab } from "./ModerationButtonsTab";
import { ModerationLogsTab } from "./ModerationLogsTab";
import { TabWidget } from "./TabWidget";
import { TimeoutButtonsTab } from "./TimeoutButtonsTab";

export const MODERATION_TABS = ["Logs", "Moderation buttons", "User Timeout Buttons"];

export function ModerationPage({ initialTab }: { initialTab?: string }) {
    const [tab, setTab] = useState(initialTab && MODERATION_TABS.includes(initialTab) ? initialTab : MODERATION_TABS[0]);
    return (
        <View testID="settings-moderation" style={{ flex: 1, padding: 10, paddingRight: 9 }}>
            <TabWidget testID="moderation" tabs={MODERATION_TABS} selected={tab} onSelect={setTab}>
                {tab === "Logs" ? <ModerationLogsTab /> : null}
                {tab === "Moderation buttons" ? <ModerationButtonsTab /> : null}
                {tab === "User Timeout Buttons" ? <TimeoutButtonsTab /> : null}
            </TabWidget>
        </View>
    );
}
