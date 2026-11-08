import { describe, expect, test } from "bun:test";
import type { TabLayout, WindowLayout } from "../../data/api";
import {
    addTab,
    closeTab,
    defaultTabTitle,
    moveTab,
    renameTab,
    selectTabByNumber,
    setTabRoot,
    stepTab,
    tabOfSplit,
    tabTitle,
} from "./tabs";

function tab(id: string, channels: string[] = []): TabLayout {
    if (channels.length === 0) return { id, root: null };
    if (channels.length === 1) return { id, root: { type: "split", id: `${id}-${channels[0]}`, channel: channels[0] } };
    const children = channels.map((channel) => ({ type: "split" as const, id: `${id}-${channel}`, channel }));
    return { id, root: { type: "container", id: `${id}-root`, direction: "horizontal", children, sizes: children.map(() => 1 / children.length) } };
}

function windowOf(ids: string[], selected: string): WindowLayout {
    return { tabs: ids.map((id) => tab(id)), selectedTabId: selected };
}

const ids = (layout: WindowLayout) => layout.tabs.map((entry) => entry.id);

describe("closeTab picks the tab a browser would", () => {
    test("closing the selected tab selects the next one", () => {
        expect(closeTab(windowOf(["a", "b", "c"], "b"), "b").selectedTabId).toBe("c");
    });

    test("closing the last selected tab selects the previous one", () => {
        expect(closeTab(windowOf(["a", "b", "c"], "c"), "c").selectedTabId).toBe("b");
    });

    test("closing another tab keeps the selection", () => {
        const next = closeTab(windowOf(["a", "b", "c"], "a"), "c");
        expect(next.selectedTabId).toBe("a");
        expect(ids(next)).toEqual(["a", "b"]);
    });

    test("closing the only tab leaves an empty notebook", () => {
        expect(closeTab(windowOf(["a"], "a"), "a")).toEqual({ tabs: [], selectedTabId: "" });
    });
});

describe("tab navigation", () => {
    test("Ctrl+Tab wraps around", () => {
        expect(stepTab(windowOf(["a", "b"], "b"), 1).selectedTabId).toBe("a");
        expect(stepTab(windowOf(["a", "b"], "a"), -1).selectedTabId).toBe("b");
    });

    test("Ctrl+9 selects the last tab, Ctrl+N the Nth", () => {
        const layout = windowOf(["a", "b", "c"], "a");
        expect(selectTabByNumber(layout, 9).selectedTabId).toBe("c");
        expect(selectTabByNumber(layout, 2).selectedTabId).toBe("b");
        expect(selectTabByNumber(layout, 5)).toBe(layout);
    });

    test("adding a tab selects it", () => {
        const next = addTab(windowOf(["a"], "a"), tab("n"));
        expect(next.selectedTabId).toBe("n");
        expect(ids(next)).toEqual(["a", "n"]);
    });

    test("dragging a tab moves it to the hovered position", () => {
        expect(ids(moveTab(windowOf(["a", "b", "c"], "a"), "a", "c"))).toEqual(["b", "c", "a"]);
        expect(ids(moveTab(windowOf(["a", "b", "c"], "a"), "c", "b"))).toEqual(["a", "c", "b"]);
    });
});

describe("titles", () => {
    const display = (channel: string) => channel.toUpperCase();

    test("the default title joins the split display names", () => {
        expect(defaultTabTitle(tab("t", ["xqc", "forsen"]).root, display)).toBe("XQC, FORSEN");
        expect(defaultTabTitle(null, display)).toBe("empty");
    });

    test("an empty rename goes back to the default title", () => {
        const renamed = renameTab({ tabs: [{ ...tab("t", ["xqc"]), title: "Main" }], selectedTabId: "t" }, "t", "  ");
        expect(tabTitle(renamed.tabs[0], display)).toBe("XQC");
    });
});

describe("roots and focus", () => {
    test("replacing the root keeps a valid focused split", () => {
        const start: WindowLayout = { tabs: [{ ...tab("t", ["a", "b"]), focusedSplitId: "t-b" }], selectedTabId: "t" };
        const next = setTabRoot(start, "t", { type: "split", id: "t-a", channel: "a" });
        expect(next.tabs[0].focusedSplitId).toBe("t-a");
        expect(setTabRoot(next, "t", null).tabs[0].focusedSplitId).toBeUndefined();
    });

    test("tabOfSplit finds the owning tab", () => {
        const layout: WindowLayout = { tabs: [tab("a", ["x"]), tab("b", ["y"])], selectedTabId: "a" };
        expect(tabOfSplit(layout, "b-y")?.id).toBe("b");
    });
});
