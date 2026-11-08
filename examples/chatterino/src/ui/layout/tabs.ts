import type { SplitNode, TabLayout, WindowLayout } from "../../data/api";
import { findNode, splitLeaves } from "./tree";

export function selectedTab(layout: WindowLayout): TabLayout | undefined {
    return layout.tabs.find((tab) => tab.id === layout.selectedTabId);
}

export function tabById(layout: WindowLayout, tabId: string): TabLayout | undefined {
    return layout.tabs.find((tab) => tab.id === tabId);
}

export function tabOfSplit(layout: WindowLayout, splitId: string): TabLayout | undefined {
    return layout.tabs.find((tab) => !!findNode(tab.root, splitId));
}

export function updateTab(layout: WindowLayout, tabId: string, update: (tab: TabLayout) => TabLayout): WindowLayout {
    let changed = false;
    const tabs = layout.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const next = update(tab);
        if (next !== tab) changed = true;
        return next;
    });
    return changed ? { ...layout, tabs } : layout;
}

export function setTabRoot(layout: WindowLayout, tabId: string, root: SplitNode | null): WindowLayout {
    return updateTab(layout, tabId, (tab) => {
        const focusedStillThere = !!tab.focusedSplitId && !!findNode(root, tab.focusedSplitId);
        const focusedSplitId = focusedStillThere ? tab.focusedSplitId : splitLeaves(root)[0]?.id;
        const next: TabLayout = { ...tab, root };
        if (focusedSplitId) next.focusedSplitId = focusedSplitId;
        else delete next.focusedSplitId;
        return next;
    });
}

export function setFocusedSplit(layout: WindowLayout, tabId: string, splitId: string): WindowLayout {
    return updateTab(layout, tabId, (tab) => (tab.focusedSplitId === splitId ? tab : { ...tab, focusedSplitId: splitId }));
}

export function selectTab(layout: WindowLayout, tabId: string): WindowLayout {
    if (layout.selectedTabId === tabId || !tabById(layout, tabId)) return layout;
    return { ...layout, selectedTabId: tabId };
}

export function addTab(layout: WindowLayout, tab: TabLayout): WindowLayout {
    return { tabs: [...layout.tabs, tab], selectedTabId: tab.id };
}

export function closeTab(layout: WindowLayout, tabId: string): WindowLayout {
    const index = layout.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return layout;
    const tabs = layout.tabs.filter((tab) => tab.id !== tabId);
    if (layout.selectedTabId !== tabId) return { ...layout, tabs };
    const isLast = index === layout.tabs.length - 1;
    const replacement = isLast ? tabs[index - 1] : tabs[index];
    return { tabs, selectedTabId: replacement?.id ?? "" };
}

export function renameTab(layout: WindowLayout, tabId: string, title: string): WindowLayout {
    const trimmed = title.trim();
    return updateTab(layout, tabId, (tab) => {
        const next: TabLayout = { ...tab };
        if (trimmed) next.title = trimmed;
        else delete next.title;
        return next;
    });
}

export function moveTab(layout: WindowLayout, tabId: string, targetId: string): WindowLayout {
    const from = layout.tabs.findIndex((tab) => tab.id === tabId);
    const to = layout.tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0 || from === to) return layout;
    const tabs = [...layout.tabs];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved);
    return { ...layout, tabs };
}

export function stepTab(layout: WindowLayout, step: 1 | -1): WindowLayout {
    const count = layout.tabs.length;
    if (count === 0) return layout;
    const index = layout.tabs.findIndex((tab) => tab.id === layout.selectedTabId);
    const next = (index + step + count) % count;
    return selectTab(layout, layout.tabs[next].id);
}

export function selectTabByNumber(layout: WindowLayout, number: number): WindowLayout {
    const isLastShortcut = number === 9;
    const index = isLastShortcut ? layout.tabs.length - 1 : number - 1;
    const tab = layout.tabs[index];
    return tab ? selectTab(layout, tab.id) : layout;
}

export function defaultTabTitle(root: SplitNode | null, displayName: (channel: string) => string): string {
    const names = splitLeaves(root)
        .map((split) => displayName(split.channel))
        .filter((name) => name.length > 0);
    return names.length > 0 ? names.join(", ") : "empty";
}

export function tabTitle(tab: TabLayout, displayName: (channel: string) => string): string {
    return tab.title ?? defaultTabTitle(tab.root, displayName);
}
