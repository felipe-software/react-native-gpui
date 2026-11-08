import { describe, expect, test } from "bun:test";
import type { SplitContainer, SplitLeaf, SplitNode } from "../../data/api";
import {
    appendSplit,
    insertRelative,
    moveSplit,
    neighborSplit,
    preferredAfterFocus,
    removeNode,
    resetSizes,
    resizePair,
    setChannel,
    splitLeaves,
    topRightSplitId,
} from "./tree";

function leaf(id: string): SplitLeaf {
    return { type: "split", id, channel: id };
}

function container(id: string, direction: SplitContainer["direction"], children: SplitNode[], sizes?: number[]): SplitContainer {
    return { type: "container", id, direction, children, sizes: sizes ?? children.map(() => 1 / children.length) };
}

function idFactory() {
    let next = 0;
    return () => `c${++next}`;
}

function shape(node: SplitNode | null): unknown {
    if (!node) return null;
    if (node.type === "split") return node.id;
    return { [node.direction === "horizontal" ? "h" : "v"]: node.children.map(shape) };
}

const mainTab = () => container("root", "horizontal", [leaf("xqc"), container("right", "vertical", [leaf("forsen"), leaf("soda")])]);

describe("appendSplit (Ctrl+T puts the split on the far right)", () => {
    test("empty root becomes the split", () => {
        expect(shape(appendSplit(null, leaf("a"), idFactory()))).toEqual("a");
    });

    test("a single split becomes a horizontal pair", () => {
        const root = appendSplit(leaf("a"), leaf("b"), idFactory());
        expect(shape(root)).toEqual({ h: ["a", "b"] });
        expect((root as SplitContainer).sizes).toEqual([0.5, 0.5]);
    });

    test("a horizontal root gets a new last child with flex 1", () => {
        const root = appendSplit(container("root", "horizontal", [leaf("a"), leaf("b")], [0.3, 0.7]), leaf("c"), idFactory());
        expect(shape(root)).toEqual({ h: ["a", "b", "c"] });
        const sizes = (root as SplitContainer).sizes;
        expect(sizes[0]).toBeCloseTo(0.2);
        expect(sizes[1]).toBeCloseTo(0.4667, 3);
        expect(sizes[2]).toBeCloseTo(1 / 3);
    });

    test("a vertical root is wrapped so the new split spans the full height", () => {
        const root = appendSplit(container("root", "vertical", [leaf("a"), leaf("b")]), leaf("c"), idFactory());
        expect(shape(root)).toEqual({ h: [{ v: ["a", "b"] }, "c"] });
    });

    test("the main tab gets a third column", () => {
        expect(shape(appendSplit(mainTab(), leaf("new"), idFactory()))).toEqual({ h: ["xqc", { v: ["forsen", "soda"] }, "new"] });
    });
});

describe("insertRelative", () => {
    test("inserts next to the split when the parent runs in that direction", () => {
        const root = insertRelative(mainTab(), leaf("n"), { relativeId: "forsen", direction: "below" }, idFactory());
        expect(shape(root)).toEqual({ h: ["xqc", { v: ["forsen", "n", "soda"] }] });
    });

    test("nests the split into a new container otherwise", () => {
        const root = insertRelative(mainTab(), leaf("n"), { relativeId: "xqc", direction: "above" }, idFactory());
        expect(shape(root)).toEqual({ h: [{ v: ["n", "xqc"] }, { v: ["forsen", "soda"] }] });
    });

    test("left of a split in a horizontal container goes before it", () => {
        const root = insertRelative(mainTab(), leaf("n"), { relativeId: "xqc", direction: "left" }, idFactory());
        expect(shape(root)).toEqual({ h: ["n", "xqc", { v: ["forsen", "soda"] }] });
    });

    test("an edge strip of a container wraps the whole container", () => {
        const root = insertRelative(mainTab(), leaf("n"), { relativeId: "root", direction: "below" }, idFactory());
        expect(shape(root)).toEqual({ v: [{ h: ["xqc", { v: ["forsen", "soda"] }] }, "n"] });
    });

    test("a vertical strip of a nested vertical container inserts next to it in the horizontal parent", () => {
        const root = insertRelative(mainTab(), leaf("n"), { relativeId: "right", direction: "right" }, idFactory());
        expect(shape(root)).toEqual({ h: ["xqc", { v: ["forsen", "soda"] }, "n"] });
    });

    test("an empty tab takes the split as its root", () => {
        expect(shape(insertRelative(null, leaf("n"), { direction: "below" }, idFactory()))).toEqual("n");
    });
});

describe("removeNode", () => {
    test("a container left with one child collapses into its parent", () => {
        const { root, position } = removeNode(mainTab(), "forsen");
        expect(shape(root)).toEqual({ h: ["xqc", "soda"] });
        expect(position).toEqual({ relativeId: "soda", direction: "above" });
    });

    test("removing from a three-child container keeps the others and their proportions", () => {
        const start = container("root", "horizontal", [leaf("a"), leaf("b"), leaf("c")], [0.2, 0.3, 0.5]);
        const { root, position } = removeNode(start, "b");
        expect(shape(root)).toEqual({ h: ["a", "c"] });
        const sizes = (root as SplitContainer).sizes;
        expect(sizes[0]).toBeCloseTo(0.2 / 0.7);
        expect(sizes[1]).toBeCloseTo(0.5 / 0.7);
        expect(position).toEqual({ relativeId: "c", direction: "left" });
    });

    test("removing the last child remembers the previous sibling", () => {
        const start = container("root", "horizontal", [leaf("a"), leaf("b"), leaf("c")]);
        expect(removeNode(start, "c").position).toEqual({ relativeId: "b", direction: "right" });
    });

    test("removing the only split empties the tab", () => {
        expect(removeNode(leaf("a"), "a").root).toBeNull();
    });

    test("re-inserting at the remembered position restores the layout", () => {
        const { root, position } = removeNode(mainTab(), "soda");
        const restored = insertRelative(root, leaf("soda"), position, idFactory());
        expect(shape(restored)).toEqual(shape(mainTab()));
    });
});

describe("moveSplit", () => {
    test("moves a split below another one", () => {
        const root = moveSplit(mainTab(), "xqc", { relativeId: "soda", direction: "below" }, idFactory());
        expect(shape(root)).toEqual({ v: ["forsen", "soda", "xqc"] });
    });

    test("dropping a split onto itself changes nothing", () => {
        const start = mainTab();
        expect(moveSplit(start, "xqc", { relativeId: "xqc", direction: "left" }, idFactory())).toBe(start);
    });
});

describe("sizes", () => {
    test("resizePair moves space between the two neighbors only", () => {
        const start = container("root", "horizontal", [leaf("a"), leaf("b"), leaf("c")], [0.25, 0.25, 0.5]);
        const root = resizePair(start, "root", 1, 0.25) as SplitContainer;
        expect(root.sizes[0]).toBeCloseTo(0.125);
        expect(root.sizes[1]).toBeCloseTo(0.375);
        expect(root.sizes[2]).toBeCloseTo(0.5);
    });

    test("resetSizes makes every sibling equal", () => {
        const start = container("root", "horizontal", [leaf("a"), leaf("b")], [0.1, 0.9]);
        expect((resetSizes(start, "root") as SplitContainer).sizes).toEqual([0.5, 0.5]);
    });
});

describe("queries", () => {
    test("the top-right split is the last child of horizontal and the first of vertical containers", () => {
        expect(topRightSplitId(mainTab())).toBe("forsen");
        expect(topRightSplitId(container("r", "vertical", [container("h", "horizontal", [leaf("a"), leaf("b")]), leaf("c")]))).toBe("b");
    });

    test("splitLeaves lists splits in tree order", () => {
        expect(splitLeaves(mainTab()).map((split) => split.id)).toEqual(["xqc", "forsen", "soda"]);
    });

    test("setChannel changes only that split", () => {
        const root = setChannel(mainTab(), "soda", "lirik");
        expect(splitLeaves(root).map((split) => split.channel)).toEqual(["xqc", "forsen", "lirik"]);
    });
});

describe("neighborSplit (Alt+arrows)", () => {
    test("moves right into the vertical container's first child by default", () => {
        expect(neighborSplit(mainTab(), "xqc", "right")).toBe("forsen");
    });

    test("descends into the last focused child of a container", () => {
        const preferred = preferredAfterFocus(mainTab(), "soda", {});
        expect(neighborSplit(mainTab(), "xqc", "right", preferred)).toBe("soda");
    });

    test("walks up to the nearest container in that direction", () => {
        expect(neighborSplit(mainTab(), "soda", "left")).toBe("xqc");
        expect(neighborSplit(mainTab(), "soda", "above")).toBe("forsen");
    });

    test("returns nothing at the edge", () => {
        expect(neighborSplit(mainTab(), "xqc", "left")).toBeUndefined();
        expect(neighborSplit(mainTab(), "forsen", "above")).toBeUndefined();
    });
});
