import type { SplitNode, TabLayout } from "../../data/api";
import { addTab, setTabRoot } from "../layout/tabs";
import type { AppServices } from "../state/AppContext";
import { newId } from "../state/ids";
import type { MenuEntry } from "../state/overlays";
import type { TabVisibility } from "../state/prefs";

function cloneNode(node: SplitNode): SplitNode {
    if (node.type === "split") return { ...node, id: newId("split") };
    return { ...node, id: newId("container"), children: node.children.map(cloneNode) };
}

function confirmThen(services: AppServices, title: string, message: string, action: () => void): void {
    services.openOverlay({ kind: "confirm", title, message, onConfirm: action });
}

function closeMany(services: AppServices, ids: string[]): void {
    for (const id of ids) services.actions.closeTab(id);
}

function visibilityEntry(services: AppServices, label: string, value: TabVisibility): MenuEntry {
    return {
        kind: "item",
        label,
        checked: services.prefs.tabVisibility === value,
        radio: true,
        onSelect: () => services.prefsStore.set((prefs) => ({ ...prefs, tabVisibility: value })),
    };
}

export function notebookEntries(services: AppServices, titles: Record<string, string>): MenuEntry[] {
    const sortTabs = () => {
        const layout = services.core.layout.get();
        const tabs = [...layout.tabs].sort((a, b) => (titles[a.id] ?? "").localeCompare(titles[b.id] ?? ""));
        services.core.layout.set({ ...layout, tabs });
    };
    return [
        {
            kind: "item",
            label: "Lock Tab Layout",
            checked: services.prefs.lockTabs,
            onSelect: () => services.prefsStore.set((prefs) => ({ ...prefs, lockTabs: !prefs.lockTabs })),
        },
        { kind: "item", label: "Sort Tabs Alphabetically", disabled: services.prefs.lockTabs, onSelect: sortTabs },
        {
            kind: "submenu",
            label: "Tab visibility",
            entries: [
                visibilityEntry(services, "Show all tabs", "all"),
                visibilityEntry(services, "Only show live tabs", "live"),
                visibilityEntry(services, "Hide all tabs", "none"),
            ],
        },
    ];
}

export function tabEntries(services: AppServices, tab: TabLayout, titles: Record<string, string>): MenuEntry[] {
    const tabs = services.core.layout.get().tabs;
    const index = tabs.findIndex((entry) => entry.id === tab.id);
    const left = tabs.slice(0, index).map((entry) => entry.id);
    const right = tabs.slice(index + 1).map((entry) => entry.id);
    const others = [...left, ...right];
    const muted = services.prefs.mutedTabs.includes(tab.id);
    const duplicate = () => {
        const layout = services.core.layout.get();
        const copy: TabLayout = { id: newId("tab"), root: tab.root ? cloneNode(tab.root) : null };
        if (tab.title) copy.title = tab.title;
        services.core.layout.set(setTabRoot(addTab(layout, copy), copy.id, copy.root));
    };
    const toggleUnread = () =>
        services.prefsStore.set((prefs) => {
            const mutedTabs = muted ? prefs.mutedTabs.filter((id) => id !== tab.id) : [...prefs.mutedTabs, tab.id];
            return { ...prefs, mutedTabs };
        });
    return [
        { kind: "item", label: "Rename Tab", onSelect: () => services.openOverlay({ kind: "renameTab", tabId: tab.id }) },
        { kind: "item", label: "Close Tab", shortcut: "Ctrl+Shift+W", onSelect: () => services.actions.closeTab(tab.id) },
        {
            kind: "submenu",
            label: "Close Multiple Tabs",
            entries: [
                {
                    kind: "item",
                    label: "Close All Visible Tabs",
                    onSelect: () =>
                        confirmThen(services, "Close All Visible Tabs", "Are you sure you want to close all visible tabs?", () =>
                            closeMany(services, tabs.map((entry) => entry.id)),
                        ),
                },
                {
                    kind: "item",
                    label: "Close Tabs to the Left",
                    disabled: left.length === 0,
                    onSelect: () =>
                        confirmThen(services, "Close Tabs to the Left", "Are you sure you want to close all tabs to the left?", () =>
                            closeMany(services, left),
                        ),
                },
                {
                    kind: "item",
                    label: "Close Tabs to the Right",
                    disabled: right.length === 0,
                    onSelect: () =>
                        confirmThen(services, "Close Tabs to the Right", "Are you sure you want to close all tabs to the right?", () =>
                            closeMany(services, right),
                        ),
                },
                {
                    kind: "item",
                    label: "Close Other Visible Tabs",
                    disabled: others.length === 0,
                    onSelect: () =>
                        confirmThen(services, "Close Other Visible Tabs", "Are you sure you want to close other visible tabs?", () =>
                            closeMany(services, others),
                        ),
                },
            ],
        },
        { kind: "item", label: "Duplicate Tab", onSelect: duplicate },
        { kind: "item", label: "Mark Tab as Unread on New Messages", checked: !muted, onSelect: toggleUnread },
        { kind: "separator" },
        ...notebookEntries(services, titles),
    ];
}
