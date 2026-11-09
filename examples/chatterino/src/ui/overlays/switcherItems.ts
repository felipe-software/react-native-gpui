import type { WindowLayout } from "../../data/api";
import { tabTitle } from "../layout/tabs";
import { splitLeaves } from "../layout/tree";

export type SwitcherItem =
    | { kind: "split"; key: string; splitId: string; channel: string; tabTitle: string }
    | { kind: "tab"; key: string; tabId: string; tabTitle: string }
    | { kind: "newTab"; key: string; channel: string; label: string }
    | { kind: "newPopup"; key: string; channel: string; label: string };

export function normalizeChannelName(text: string): string {
    return text.toLowerCase().replace(/^#/, "");
}

export function switcherItems(layout: WindowLayout, text: string, displayName: (channel: string) => string): SwitcherItem[] {
    const needle = text.toLowerCase();
    const items: SwitcherItem[] = [];
    for (const tab of layout.tabs) {
        const title = tabTitle(tab, displayName);
        const split = splitLeaves(tab.root).find((leaf) => leaf.channel.toLowerCase().includes(needle));
        if (split) {
            items.push({ kind: "split", key: `split-${split.id}`, splitId: split.id, channel: split.channel, tabTitle: title });
            continue;
        }
        if (title.toLowerCase().includes(needle)) items.push({ kind: "tab", key: `tab-${tab.id}`, tabId: tab.id, tabTitle: title });
    }
    if (text.length > 0) {
        const channel = normalizeChannelName(text);
        items.push({ kind: "newTab", key: "new-tab", channel, label: `Open channel "${text}" in new tab` });
        items.push({ kind: "newPopup", key: "new-popup", channel, label: `Open channel "${text}" in new popup` });
    }
    return items;
}

export function stepSelection(index: number, count: number, step: 1 | -1): number {
    if (count === 0) return 0;
    return (index + step + count) % count;
}
