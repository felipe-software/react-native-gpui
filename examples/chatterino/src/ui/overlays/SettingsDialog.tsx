import { useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { TextField } from "../common/TextField";
import { AccountsPage } from "../settings/AccountsPage";
import { GeneralPage } from "../settings/GeneralPage";
import { HighlightsPage } from "../settings/HighlightsPage";
import { HotkeysPage } from "../settings/HotkeysPage";
import { IgnoresPage } from "../settings/IgnoresPage";
import { NotificationsPage } from "../settings/NotificationsPage";
import { AppContext, useApp } from "../state/AppContext";
import { SETTINGS_COLORS, themeFor } from "../theme";

const PAGES = ["General", "Accounts", "Highlights", "Ignores", "Hotkeys", "Live Notifications"] as const;
type Page = (typeof PAGES)[number];

const GROUP_STARTS = new Set<Page>(["Accounts", "Highlights", "Hotkeys"]);

const KEYWORDS: Record<Page, string> = {
    General:
        "interface theme font tab close live chat pause hover message length messages separate lines alternate background opacity history deleted timestamp format badges emotes animate size streamer mode load history scrollback limit",
    Accounts: "accounts add remove oauth token login",
    Highlights: "highlights phrases users mentions flash taskbar regex sound color your name",
    Ignores: "ignores users phrases block replacement",
    Hotkeys: "hotkeys keybindings shortcuts",
    "Live Notifications": "live notifications notification",
};

function pageContent(page: Page) {
    switch (page) {
        case "General":
            return <GeneralPage />;
        case "Accounts":
            return <AccountsPage />;
        case "Highlights":
            return <HighlightsPage />;
        case "Ignores":
            return <IgnoresPage />;
        case "Hotkeys":
            return <HotkeysPage />;
        case "Live Notifications":
            return <NotificationsPage />;
    }
}

function initialPage(page: string | undefined): Page {
    return PAGES.find((entry) => entry === page) ?? "General";
}

export function SettingsDialog({ page, onClose }: { page?: string; onClose: () => void }) {
    const services = useApp();
    const { core, prefsStore, fonts } = services;
    const [current, setCurrent] = useState<Page>(initialPage(page));
    const [query, setQuery] = useState("");
    const snapshot = useRef({ settings: core.settings.get(), prefs: prefsStore.get() });
    const darkServices = useMemo(() => ({ ...services, theme: themeFor("dark") }), [services]);
    const needle = query.trim().toLowerCase();
    const visiblePages = PAGES.filter((name) => !needle || `${name} ${KEYWORDS[name]}`.toLowerCase().includes(needle));
    const shownPage = visiblePages.includes(current) ? current : (visiblePages[0] ?? current);

    const cancel = () => {
        core.settings.set(snapshot.current.settings);
        prefsStore.set(snapshot.current.prefs);
        onClose();
    };

    return (
        <AppContext.Provider value={darkServices}>
            <FloatingWindow testID="settings-dialog" title="Chatterino Settings" width={915} height={600} onClose={onClose}>
                <View style={{ flex: 1, backgroundColor: SETTINGS_COLORS.background, padding: 11 }}>
                    <TextField testID="settings-search" value={query} placeholder="Find in settings... (Ctrl+F)" onChange={setQuery} />
                    <View style={{ flex: 1, flexDirection: "row", marginTop: 12 }}>
                        <View style={{ width: 150, paddingVertical: 20 }}>
                            {visiblePages.map((name) => {
                                const selected = name === shownPage;
                                const gap = GROUP_STARTS.has(name) && !needle ? 16 : 0;
                                return (
                                    <View
                                        key={name}
                                        testID={`settings-page-${name}`}
                                        accessibilityRole="tab"
                                        accessibilityState={{ selected }}
                                        style={{
                                            height: 30,
                                            marginTop: gap,
                                            justifyContent: "center",
                                            paddingLeft: 35,
                                            backgroundColor: selected ? SETTINGS_COLORS.navSelected : undefined,
                                        }}
                                        onClick={() => setCurrent(name)}
                                    >
                                        <Text
                                            style={{
                                                color: selected ? SETTINGS_COLORS.navSelectedText : SETTINGS_COLORS.navText,
                                                fontFamily: fonts.appFamily,
                                                fontSize: 14,
                                            }}
                                        >
                                            {name}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                        <ScrollView testID="settings-content" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
                            {pageContent(shownPage)}
                        </ScrollView>
                    </View>
                    <View style={{ height: 37, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", gap: 6 }}>
                        <PushButton testID="settings-cancel" label="Cancel" onPress={cancel} />
                        <PushButton testID="settings-ok" label="Ok" primary onPress={onClose} />
                    </View>
                </View>
            </FloatingWindow>
        </AppContext.Provider>
    );
}
