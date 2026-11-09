import { useCallback, useMemo, useRef, useState } from "react";
import { View, type MouseResponderEvent } from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { AboutPage } from "../settings/AboutPage";
import { AccountsPage } from "../settings/AccountsPage";
import { CommandsPage } from "../settings/CommandsPage";
import { ExternalToolsPage } from "../settings/ExternalToolsPage";
import { FiltersPage } from "../settings/FiltersPage";
import { GeneralPage } from "../settings/GeneralPage";
import { HighlightsPage } from "../settings/HighlightsPage";
import { HotkeysPage } from "../settings/HotkeysPage";
import { IgnoresPage } from "../settings/IgnoresPage";
import { ModerationPage } from "../settings/ModerationPage";
import { NicknamesPage } from "../settings/NicknamesPage";
import { NotificationsPage } from "../settings/NotificationsPage";
import { pageMatches } from "../settings/pageSearch";
import { PluginsPage } from "../settings/PluginsPage";
import { SettingsUiContext, type Point, type PopupSpec, type SettingsUi } from "../settings/SettingsContext";
import { SettingsNavTab } from "../settings/SettingsNavTab";
import { resolvePage, SETTINGS_PAGES, type SettingsPageName } from "../settings/settingsPages";
import { SettingsPopupLayer } from "../settings/SettingsPopupLayer";
import { SettingsSearchField } from "../settings/SettingsSearchField";
import { SETTINGS_STYLE } from "../settings/settingsStyle";
import { SPushButton } from "../settings/SPushButton";
import { AppContext, useApp } from "../state/AppContext";
import { themeFor } from "../theme";

const WIDTH = 915;
const HEIGHT = 600;
const TITLE_HEIGHT = 28;
const GROUP_SPACING = 16;

function renderPage(page: SettingsPageName, initialTab: string | undefined) {
    switch (page) {
        case "General":
            return <GeneralPage />;
        case "Accounts":
            return <AccountsPage />;
        case "Nicknames":
            return <NicknamesPage />;
        case "Commands":
            return <CommandsPage />;
        case "Highlights":
            return <HighlightsPage />;
        case "Ignores":
            return <IgnoresPage />;
        case "Filters":
            return <FiltersPage />;
        case "Hotkeys":
            return <HotkeysPage />;
        case "Moderation":
            return <ModerationPage initialTab={initialTab} />;
        case "Live Notifications":
            return <NotificationsPage />;
        case "External tools":
            return <ExternalToolsPage />;
        case "Plugins":
            return <PluginsPage />;
        case "About":
            return <AboutPage />;
    }
}

function spacingFor(index: number, visible: SettingsPageName[]): number {
    const page = SETTINGS_PAGES.find((entry) => entry.name === visible[index]);
    const previous = SETTINGS_PAGES.find((entry) => entry.name === visible[index - 1]);
    if (!page || !previous || page.group === previous.group || page.group === 4) return 0;
    return GROUP_SPACING;
}

export function SettingsDialog({ page, onClose }: { page?: string; onClose: () => void }) {
    const services = useApp();
    const { core, prefsStore } = services;
    const [selected, setSelected] = useState<SettingsPageName>(resolvePage(page === "ModerationActions" ? "Moderation" : page));
    const [query, setQuery] = useState(page === "StreamerMode" ? "Streamer Mode" : "");
    const [popup, setPopup] = useState<PopupSpec | null>(null);
    const [tooltip, setTooltip] = useState<{ text: string; at: Point } | null>(null);
    const origin = useRef<Point>({ x: 0, y: 0 });
    const snapshot = useRef({ settings: core.settings.get(), prefs: prefsStore.get() });
    const darkServices = useMemo(() => ({ ...services, theme: themeFor("dark") }), [services]);
    const settings = services.settings;
    const moderationTab = page === "ModerationActions" ? "Moderation buttons" : undefined;

    const visible = SETTINGS_PAGES.map((entry) => entry.name).filter((name) => pageMatches(name, query, settings));
    const shown = visible.includes(selected) ? selected : (visible[0] ?? selected);
    const topPages = visible.filter((name) => name !== "About");
    const showAbout = visible.includes("About");

    const trackOrigin = (event: MouseResponderEvent) => {
        origin.current = { x: event.nativeEvent.pageX - event.nativeEvent.locationX, y: event.nativeEvent.pageY - event.nativeEvent.locationY };
    };
    const ui = useMemo<SettingsUi>(
        () => ({
            query,
            toLocal: (point) => ({ x: point.x - origin.current.x, y: point.y - origin.current.y }),
            showTooltip: (text, at) => setTooltip({ text, at }),
            hideTooltip: () => setTooltip(null),
            openPopup: (spec) => {
                setTooltip(null);
                setPopup(spec);
            },
            closePopup: () => setPopup(null),
        }),
        [query],
    );
    const closePopup = useCallback(() => setPopup(null), []);

    const cancel = () => {
        core.settings.set(snapshot.current.settings);
        prefsStore.set(snapshot.current.prefs);
        onClose();
    };

    return (
        <AppContext.Provider value={darkServices}>
            <SettingsUiContext.Provider value={ui}>
                <FloatingWindow testID="settings-dialog" title="Chatterino Settings" width={WIDTH} height={HEIGHT + TITLE_HEIGHT} onClose={onClose}>
                    <View
                        testID="settings-root"
                        style={{ flex: 1, backgroundColor: SETTINGS_STYLE.window, padding: 11 }}
                        onMouseDown={trackOrigin}
                        onMouseMove={trackOrigin}
                    >
                        <SettingsSearchField value={query} onChange={setQuery} />
                        <View style={{ flex: 1, flexDirection: "row", marginTop: 12 }}>
                            <View style={{ width: 150, paddingTop: 20, paddingBottom: 20 }}>
                                {topPages.map((name, index) => {
                                    const entry = SETTINGS_PAGES.find((candidate) => candidate.name === name);
                                    return (
                                        <SettingsNavTab
                                            key={name}
                                            name={name}
                                            icon={entry?.icon ?? "settings/about.svg"}
                                            selected={name === shown}
                                            marginTop={spacingFor(index, topPages)}
                                            onSelect={() => setSelected(name)}
                                        />
                                    );
                                })}
                                <View style={{ flex: 1 }} />
                                {showAbout ? (
                                    <SettingsNavTab name="About" icon="settings/about.svg" selected={shown === "About"} marginTop={0} onSelect={() => setSelected("About")} />
                                ) : null}
                            </View>
                            <View testID="settings-content" style={{ flex: 1 }}>
                                {renderPage(shown, moderationTab)}
                            </View>
                        </View>
                        <View style={{ height: 35, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", gap: 8 }}>
                            <SPushButton testID="settings-cancel" label="Cancel" onPress={cancel} />
                            <SPushButton testID="settings-ok" label="Ok" onPress={onClose} />
                        </View>
                        <SettingsPopupLayer width={WIDTH - 2} height={HEIGHT} popup={popup} tooltip={tooltip} onClose={closePopup} />
                    </View>
                </FloatingWindow>
            </SettingsUiContext.Provider>
        </AppContext.Provider>
    );
}
