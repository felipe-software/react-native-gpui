import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { SettingsTitle } from "./SettingsTitle";

const ROWS: Array<[string, string, string]> = [
    ["Window", "Open settings", "Ctrl+P"],
    ["Window", "New split", "Ctrl+T"],
    ["Window", "Select tab 1-8 / last tab", "Ctrl+1..8 / Ctrl+9"],
    ["Window", "Next / previous tab", "Ctrl+Tab / Ctrl+Shift+Tab"],
    ["Window", "New tab / close tab", "Ctrl+Shift+T / Ctrl+Shift+W"],
    ["Window", "Reopen last closed split", "Ctrl+G"],
    ["Window", "Toggle tab visibility", "Ctrl+U"],
    ["Split", "Close split", "Ctrl+W"],
    ["Split", "Change channel", "Ctrl+R"],
    ["Split", "Search this split / all splits", "Ctrl+F / Ctrl+Shift+F"],
    ["Split", "Reconnect", "Ctrl+F5"],
    ["Split", "Move focus", "Alt+Arrows"],
    ["Split", "Scroll to bottom", "Ctrl+End"],
    ["Split Input", "Emote picker", "Ctrl+E"],
    ["Split Input", "Send message / send and keep text", "Enter / Ctrl+Enter"],
    ["Split Input", "Complete / complete backwards", "Tab / Shift+Tab"],
    ["Split Input", "Previous / next sent message", "Up / Down"],
    ["Popup", "Close", "Escape"],
];

export function HotkeysPage() {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const cell = { color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize };
    const header = { ...cell, color: colors.muted, fontSize: fonts.uiSize };
    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Hotkeys" />
            <View style={{ flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderColor: colors.border }}>
                <Text style={{ ...header, width: 110 }}>Category</Text>
                <Text style={{ ...header, flex: 1 }}>Action</Text>
                <Text style={{ ...header, width: 200 }}>Keybinding</Text>
            </View>
            {ROWS.map(([category, action, keys]) => (
                <View key={action} style={{ flexDirection: "row", height: 24, alignItems: "center" }}>
                    <Text style={{ ...cell, width: 110, color: colors.muted }}>{category}</Text>
                    <Text style={{ ...cell, flex: 1 }}>{action}</Text>
                    <Text style={{ ...cell, width: 200 }}>{keys}</Text>
                </View>
            ))}
        </View>
    );
}
