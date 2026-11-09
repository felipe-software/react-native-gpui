import { useEffect, useRef } from "react";
import { View, type LayoutChangeEvent, type MouseResponderEvent } from "react-native-gpui";
import type { WindowLayout } from "../../data/api";
import { PlusButton } from "../common/PlusButton";
import { ICONS } from "../icons";
import { tabTitle } from "../layout/tabs";
import { splitLeaves } from "../layout/tree";
import { useApp } from "../state/AppContext";
import { hitAreas } from "../state/hitAreas";
import { isSpecialChannel } from "../state/specialChannels";
import type { MenuEntry } from "../state/overlays";
import { useStore } from "../state/useStore";
import type { TabState } from "../theme";
import { CornerButton } from "./CornerButton";
import { NotebookTab } from "./NotebookTab";
import { notebookEntries, tabEntries } from "./tabMenu";

const ANONYMOUS_LABEL = " - anonymous - ";

export function TabBar({ layout }: { layout: WindowLayout }) {
    const services = useApp();
    const { theme, fonts, prefs, actions, core } = services;
    const infos = useStore(services.channelInfos);
    const activity = useStore(services.tabActivity);
    const accounts = useStore(core.accounts);

    const displayName = (channel: string) => {
        if (isSpecialChannel(channel)) return channel;
        return infos[channel]?.displayName ?? channel;
    };
    const titles: Record<string, string> = {};
    for (const tab of layout.tabs) titles[tab.id] = tabTitle(tab, displayName);

    const knownTabs = useRef<string[]>([]);
    useEffect(() => {
        const ids = layout.tabs.map((tab) => tab.id);
        for (const id of knownTabs.current) if (!ids.includes(id)) hitAreas.removeTab(id);
        knownTabs.current = ids;
    }, [layout.tabs]);

    const isLive = (root: WindowLayout["tabs"][number]["root"]) => splitLeaves(root).some((leaf) => !!infos[leaf.channel]?.live?.live);
    const visibleTabs = layout.tabs.filter((tab) => {
        if (prefs.tabVisibility !== "live") return true;
        return tab.id === layout.selectedTabId || isLive(tab.root);
    });

    const openAccounts = (event: MouseResponderEvent) => {
        const current = accounts.current;
        const entries: MenuEntry[] = [
            { kind: "item", label: ANONYMOUS_LABEL, checked: !current, onSelect: () => core.selectAccount(undefined) },
            ...accounts.accounts.map(
                (account): MenuEntry => ({
                    kind: "item",
                    label: account.login,
                    checked: current === account.login,
                    onSelect: () => core.selectAccount(account.login),
                }),
            ),
            { kind: "separator" },
            { kind: "item", label: "Manage Accounts", onSelect: () => services.openOverlay({ kind: "settings", page: "Accounts" }) },
        ];
        services.openOverlay({ kind: "menu", x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, entries });
    };

    const tabState = (tabId: string): TabState => {
        if (tabId === layout.selectedTabId) return "selected";
        return activity[tabId] ?? "regular";
    };

    const askClose = (tabId: string) =>
        services.openOverlay({
            kind: "confirm",
            title: "Remove this tab",
            message: "Are you sure that you want to remove this tab?",
            onConfirm: () => actions.closeTab(tabId),
        });

    const reorder = (tabId: string, x: number, y: number) => {
        if (prefs.lockTabs) return;
        const target = hitAreas.tabAt(x, y);
        if (target && target !== tabId) actions.moveTab(tabId, target);
    };

    const tabsShown = prefs.tabVisibility !== "none";
    useEffect(() => {
        if (!tabsShown) hitAreas.clearTabs();
    }, [tabsShown]);

    return (
        <View
            testID="tab-bar"
            style={{ backgroundColor: theme.window.background }}
            onContextMenu={(event) => {
                const { pageX, pageY } = event.nativeEvent;
                if (hitAreas.tabAt(pageX, pageY)) return;
                services.openOverlay({ kind: "menu", x: pageX, y: pageY + 8, entries: notebookEntries(services, titles) });
            }}
        >
            <View style={{ flexDirection: "row", flexWrap: "wrap", paddingLeft: 2 }}>
                <CornerButton
                    testID="settings-button"
                    label="Settings"
                    icon={ICONS.gear}
                    color={theme.buttons.icon}
                    hoverColor={theme.buttons.iconHover}
                    onPress={() => services.openOverlay({ kind: "settings" })}
                />
                <CornerButton
                    testID="account-button"
                    label="Accounts"
                    icon={ICONS.account}
                    color={theme.buttons.icon}
                    hoverColor={theme.buttons.iconHover}
                    onPress={openAccounts}
                />
                {tabsShown
                    ? visibleTabs.map((tab) => (
                          <NotebookTab
                              key={tab.id}
                              id={tab.id}
                              title={titles[tab.id]}
                              state={tabState(tab.id)}
                              live={isLive(tab.root)}
                              showLive={prefs.showTabLive}
                              closable={prefs.showTabCloseButton}
                              theme={theme}
                              fonts={fonts}
                              onSelect={() => actions.selectTab(tab.id)}
                              onClose={() => askClose(tab.id)}
                              onRename={() => services.openOverlay({ kind: "renameTab", tabId: tab.id })}
                              onMenu={(x, y) => services.openOverlay({ kind: "menu", x, y: y + 8, entries: tabEntries(services, tab, titles) })}
                              onReorder={(x, y) => reorder(tab.id, x, y)}
                              onLayout={(rect) => hitAreas.setTab(tab.id, rect)}
                          />
                      ))
                    : null}
                {tabsShown ? (
                    <View onLayout={(event: LayoutChangeEvent) => hitAreas.setAddTab(event.nativeEvent.layout)}>
                        <PlusButton
                            testID="add-tab"
                            width={27}
                            height={27}
                            centerX={13}
                            centerY={13}
                            length={13}
                            color={theme.buttons.plus}
                            hoverColor={theme.buttons.hover}
                            onPress={() => actions.newTab()}
                        />
                    </View>
                ) : null}
            </View>
            <View style={{ height: 2, backgroundColor: theme.tabs.dividerLine }} />
        </View>
    );
}
