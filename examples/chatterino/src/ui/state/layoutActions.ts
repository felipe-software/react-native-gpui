import type { SplitLeaf, Store, TabLayout, WindowLayout } from "../../data/api";
import {
    addTab,
    closeTab,
    moveTab,
    renameTab,
    selectTab,
    selectTabByNumber,
    selectedTab,
    setFocusedSplit,
    setTabRoot,
    stepTab,
    tabById,
    tabOfSplit,
} from "../layout/tabs";
import {
    appendSplit,
    findNode,
    insertRelative,
    neighborSplit,
    preferredAfterFocus,
    removeNode,
    resetSizes,
    resizePair,
    setChannel,
    splitLeaves,
    type Direction,
    type PreferredChildren,
    type SplitPosition,
} from "../layout/tree";
import { newId } from "./ids";

export type DropTarget =
    | { kind: "zone"; tabId: string; position: SplitPosition }
    | { kind: "tab"; tabId: string }
    | { kind: "newTab" };

type ClosedSplit = { tabId: string; channel: string; position: SplitPosition };

export type LayoutDeps = {
    layout: Store<WindowLayout>;
    focusInput: (splitId: string) => void;
    openSelectChannel: (splitId: string, isNew: boolean) => void;
};

const containerId = () => newId("container");

function leaf(channel: string): SplitLeaf {
    return { type: "split", id: newId("split"), channel };
}

export function createLayoutActions(deps: LayoutDeps) {
    const closed: ClosedSplit[] = [];
    let preferred: PreferredChildren = {};

    const read = () => deps.layout.get();
    const write = (next: WindowLayout) => deps.layout.set(next);

    function focusSplit(splitId: string, focusInput = true): void {
        const layout = read();
        const tab = tabOfSplit(layout, splitId);
        if (!tab) return;
        preferred = preferredAfterFocus(tab.root, splitId, preferred);
        write(selectTab(setFocusedSplit(layout, tab.id, splitId), tab.id));
        if (focusInput) deps.focusInput(splitId);
    }

    function focusTab(tab: TabLayout | undefined): void {
        if (tab?.focusedSplitId) deps.focusInput(tab.focusedSplitId);
    }

    function newSplit(tabId?: string): void {
        const layout = read();
        const tab = tabId ? tabById(layout, tabId) : selectedTab(layout);
        if (!tab) return;
        const added = leaf("");
        write(setTabRoot(layout, tab.id, appendSplit(tab.root, added, containerId)));
        focusSplit(added.id, false);
        deps.openSelectChannel(added.id, true);
    }

    function discardSplit(splitId: string): void {
        const layout = read();
        const tab = tabOfSplit(layout, splitId);
        if (!tab) return;
        write(setTabRoot(layout, tab.id, removeNode(tab.root, splitId).root));
        focusTab(tabById(read(), tab.id));
    }

    function closeSplit(splitId: string): void {
        const layout = read();
        const tab = tabOfSplit(layout, splitId);
        const node = tab ? findNode(tab.root, splitId) : undefined;
        if (!tab || !node || node.type !== "split") return;
        const removal = removeNode(tab.root, splitId);
        if (node.channel) closed.push({ tabId: tab.id, channel: node.channel, position: removal.position });
        write(setTabRoot(layout, tab.id, removal.root));
        const relative = removal.position.relativeId ? findNode(removal.root, removal.position.relativeId) : undefined;
        const nextFocus = relative ? splitLeaves(relative)[0]?.id : undefined;
        if (nextFocus) focusSplit(nextFocus);
    }

    function reopenSplit(): void {
        const entry = closed.pop();
        if (!entry) return;
        const layout = read();
        const tab = tabById(layout, entry.tabId) ?? selectedTab(layout);
        if (!tab) return;
        const added = leaf(entry.channel);
        const relativeExists = !!entry.position.relativeId && !!findNode(tab.root, entry.position.relativeId);
        const root = relativeExists
            ? insertRelative(tab.root, added, entry.position, containerId)
            : appendSplit(tab.root, added, containerId);
        write(setTabRoot(layout, tab.id, root));
        focusSplit(added.id);
    }

    function changeChannel(splitId: string, channel: string): void {
        const layout = read();
        const tab = tabOfSplit(layout, splitId);
        if (!tab) return;
        write(setTabRoot(layout, tab.id, setChannel(tab.root, splitId, channel)));
        focusSplit(splitId);
    }

    function moveFocus(direction: Direction): void {
        const tab = selectedTab(read());
        if (!tab?.focusedSplitId) return;
        const target = neighborSplit(tab.root, tab.focusedSplitId, direction, preferred);
        if (target) focusSplit(target);
    }

    function dropSplit(splitId: string, target: DropTarget): void {
        const layout = read();
        const source = tabOfSplit(layout, splitId);
        const node = source ? findNode(source.root, splitId) : undefined;
        if (!source || !node || node.type !== "split") return;
        const isSelfDrop = target.kind === "zone" && target.position.relativeId === splitId;
        if (isSelfDrop) return;
        const removed = removeNode(source.root, splitId).root;
        let next = setTabRoot(layout, source.id, removed);
        if (target.kind === "newTab") {
            const tab: TabLayout = { id: newId("tab"), root: node, focusedSplitId: node.id };
            next = addTab(next, tab);
        } else {
            const destination = tabById(next, target.tabId);
            if (!destination) return;
            const root =
                target.kind === "zone"
                    ? insertRelative(destination.root, node, target.position, containerId)
                    : appendSplit(destination.root, node, containerId);
            next = selectTab(setTabRoot(next, destination.id, root), destination.id);
        }
        write(next);
        focusSplit(splitId);
    }

    function resize(tabId: string, container: string, index: number, fraction: number): void {
        const layout = read();
        const tab = tabById(layout, tabId);
        if (!tab) return;
        write(setTabRoot(layout, tabId, resizePair(tab.root, container, index, fraction)));
    }

    function resetContainer(tabId: string, container: string): void {
        const layout = read();
        const tab = tabById(layout, tabId);
        if (!tab) return;
        write(setTabRoot(layout, tabId, resetSizes(tab.root, container)));
    }

    function selectTabById(tabId: string): void {
        const next = selectTab(read(), tabId);
        write(next);
        focusTab(selectedTab(next));
    }

    function peekTab(tabId: string): void {
        write(selectTab(read(), tabId));
    }

    function step(stepBy: 1 | -1): void {
        const next = stepTab(read(), stepBy);
        write(next);
        focusTab(selectedTab(next));
    }

    function selectNumber(number: number): void {
        const next = selectTabByNumber(read(), number);
        write(next);
        focusTab(selectedTab(next));
    }

    function newTab(): void {
        write(addTab(read(), { id: newId("tab"), root: null }));
    }

    function removeTab(tabId: string): void {
        const next = closeTab(read(), tabId);
        write(next);
        focusTab(selectedTab(next));
    }

    return {
        focusSplit,
        newSplit,
        discardSplit,
        closeSplit,
        reopenSplit,
        changeChannel,
        moveFocus,
        dropSplit,
        resize,
        resetContainer,
        selectTab: selectTabById,
        peekTab,
        stepTab: step,
        selectTabByNumber: selectNumber,
        newTab,
        closeTab: removeTab,
        renameTab: (tabId: string, title: string) => write(renameTab(read(), tabId, title)),
        moveTab: (tabId: string, targetId: string) => write(moveTab(read(), tabId, targetId)),
    };
}

export type LayoutActions = ReturnType<typeof createLayoutActions>;
