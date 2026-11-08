import { describe, expect, test } from "bun:test";
import type { SplitContainer, SplitLeaf, SplitNode } from "../../data/api";
import { clampFraction, dropZoneAt, handleFraction, layoutGrid } from "./geometry";

function leaf(id: string): SplitLeaf {
    return { type: "split", id, channel: id };
}

function container(id: string, direction: SplitContainer["direction"], children: SplitNode[], sizes?: number[]): SplitContainer {
    return { type: "container", id, direction, children, sizes: sizes ?? children.map(() => 1 / children.length) };
}

const page = { x: 0, y: 0, width: 1280, height: 770 };
const mainTab = () => container("root", "horizontal", [leaf("xqc"), container("right", "vertical", [leaf("forsen"), leaf("soda")])]);

function rectOf(layout: ReturnType<typeof layoutGrid>, id: string) {
    return layout.splits.find((split) => split.id === id)?.rect;
}

describe("layoutGrid matches the 1280x800 Chatterino capture", () => {
    test("split widgets leave 1 px borders at x = 639 and y = 384", () => {
        const layout = layoutGrid(mainTab(), page);
        expect(rectOf(layout, "xqc")).toEqual({ x: 0, y: 0, width: 639, height: 770 });
        expect(rectOf(layout, "forsen")).toEqual({ x: 640, y: 0, width: 640, height: 384 });
        expect(rectOf(layout, "soda")).toEqual({ x: 640, y: 385, width: 640, height: 385 });
    });

    test("three equal columns of the More tab", () => {
        const more = container("root", "horizontal", [leaf("a"), leaf("b"), leaf("c")]);
        const layout = layoutGrid(more, page);
        expect(layout.splits.map((split) => [split.rect.x, split.rect.width])).toEqual([
            [0, 426],
            [427, 426],
            [854, 426],
        ]);
    });

    test("a single split fills the page", () => {
        expect(layoutGrid(leaf("a"), page).splits[0].rect).toEqual(page);
    });

    test("tiny flex gets the 48 px minimum before scaling, so the node ends up 46 px", () => {
        const layout = layoutGrid(container("root", "horizontal", [leaf("a"), leaf("b")], [0.001, 0.999]), page);
        expect(rectOf(layout, "a")?.width).toBe(45);
    });
});

describe("resize handles", () => {
    test("an 8 px band is centered on each boundary", () => {
        const layout = layoutGrid(mainTab(), page);
        const vertical = layout.handles.find((handle) => handle.containerId === "root");
        const horizontal = layout.handles.find((handle) => handle.containerId === "right");
        expect(vertical?.rect).toEqual({ x: 635, y: -1, width: 8, height: 771 });
        expect(horizontal?.rect).toEqual({ x: 639, y: 380, width: 641, height: 8 });
    });

    test("pointer fractions are clamped to the neighbors and the minimum size", () => {
        const handle = layoutGrid(mainTab(), page).handles[0];
        expect(handleFraction(handle, -100)).toBe(0);
        expect(handleFraction(handle, 5000)).toBe(1);
        expect(clampFraction(handle, 0)).toBeCloseTo(48 / (handle.end - handle.start));
    });
});

describe("drop zones", () => {
    test("side thirds win over the top and bottom halves", () => {
        const layout = layoutGrid(mainTab(), page);
        expect(dropZoneAt(layout.zones, 10, 10)?.position).toEqual({ relativeId: "xqc", direction: "left" });
        expect(dropZoneAt(layout.zones, 630, 700)?.position).toEqual({ relativeId: "xqc", direction: "right" });
        expect(dropZoneAt(layout.zones, 320, 10)?.position).toEqual({ relativeId: "xqc", direction: "above" });
        expect(dropZoneAt(layout.zones, 320, 700)?.position).toEqual({ relativeId: "xqc", direction: "below" });
    });

    test("while dragging, containers get edge strips and the splits shrink", () => {
        const layout = layoutGrid(mainTab(), page, { addSpacing: true });
        const top = dropZoneAt(layout.zones, 320, 5);
        expect(top?.position).toEqual({ relativeId: "root", direction: "above" });
        expect(rectOf(layout, "xqc")?.y).toBe(24);
        const strip = dropZoneAt(layout.zones, 645, 300);
        expect(strip?.position).toEqual({ relativeId: "right", direction: "left" });
    });

    test("an empty tab is one zone", () => {
        const layout = layoutGrid(null, page);
        expect(layout.zones).toHaveLength(1);
        expect(dropZoneAt(layout.zones, 600, 400)?.position).toEqual({ direction: "below" });
    });
});
