import type { SplitNode } from "../../data/api";
import { normalizeSizes, type Axis, type SplitPosition } from "./tree";

export type Rect = { x: number; y: number; width: number; height: number };

export type SplitBox = { id: string; rect: Rect };
export type HandleBox = { containerId: string; index: number; axis: Axis; rect: Rect; start: number; end: number };
export type DropZone = { rect: Rect; position: SplitPosition; kind: "strip" | "split" | "empty" };
export type GridLayout = { splits: SplitBox[]; nodes: Record<string, Rect>; handles: HandleBox[]; zones: DropZone[] };

export const MIN_SPLIT_SIZE = 48;
const HANDLE_THICKNESS = 8;
const MAX_STRIP = 24;

type RectF = { x: number; y: number; width: number; height: number };

function round(value: number): number {
    return Math.round(value);
}

function toRect(rect: RectF): Rect {
    return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) };
}

function setLeft(rect: Rect, left: number): Rect {
    const right = rect.x + rect.width;
    return { ...rect, x: left, width: right - left };
}

function setTop(rect: Rect, top: number): Rect {
    const bottom = rect.y + rect.height;
    return { ...rect, y: top, height: bottom - top };
}

function rightEdge(rect: RectF): number {
    return rect.x + rect.width;
}

function bottomEdge(rect: RectF): number {
    return rect.y + rect.height;
}

export function contains(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

type Collector = { splits: SplitBox[]; nodes: Record<string, Rect>; handles: HandleBox[]; strips: DropZone[] };

function layoutNode(node: SplitNode, geometry: RectF, addSpacing: boolean, scale: number, out: Collector): void {
    out.nodes[node.id] = toRect(geometry);
    if (node.type === "split") {
        const rect = toRect(geometry);
        out.splits.push({ id: node.id, rect: { x: rect.x + 1, y: rect.y + 1, width: rect.width - 1, height: rect.height - 1 } });
        return;
    }
    const isVertical = node.direction === "vertical";
    const count = node.children.length;
    const flexes = normalizeSizes(node.sizes.slice(0, count)).map((size) => size * count);
    const minSize = MIN_SPLIT_SIZE * scale;
    const size = isVertical ? geometry.height : geometry.width;
    const totalFlex = Math.max(0.0001, flexes.reduce((sum, flex) => sum + flex, 0));
    const want = (index: number) => Math.max((size / totalFlex) * flexes[index], minSize);
    const totalSize = Math.max(
        0.0001,
        flexes.reduce((sum, _, index) => Math.trunc(sum) + want(index), 0),
    );
    const multiplier = size / totalSize;
    let childRect: RectF = { ...geometry };

    if (addSpacing) {
        const crossSize = isVertical ? geometry.width : geometry.height;
        const offset = Math.min(crossSize * 0.1, MAX_STRIP * scale);
        if (isVertical) {
            out.strips.push({
                rect: toRect({ x: geometry.x, y: geometry.y, width: offset, height: geometry.height }),
                position: { relativeId: node.id, direction: "left" },
                kind: "strip",
            });
            out.strips.push({
                rect: toRect({ x: rightEdge(geometry) - offset, y: geometry.y, width: offset, height: geometry.height }),
                position: { relativeId: node.id, direction: "right" },
                kind: "strip",
            });
            childRect = { ...childRect, x: childRect.x + offset, width: childRect.width - 2 * offset };
        } else {
            out.strips.push({
                rect: toRect({ x: geometry.x, y: geometry.y, width: geometry.width, height: offset }),
                position: { relativeId: node.id, direction: "above" },
                kind: "strip",
            });
            out.strips.push({
                rect: toRect({ x: geometry.x, y: bottomEdge(geometry) - offset, width: geometry.width, height: offset }),
                position: { relativeId: node.id, direction: "below" },
                kind: "strip",
            });
            childRect = { ...childRect, y: childRect.y + offset, height: childRect.height - 2 * offset };
        }
    }

    let pos = Math.trunc(isVertical ? childRect.y : childRect.x);
    node.children.forEach((child, index) => {
        const base = toRect(childRect);
        const length = Math.trunc(want(index) * multiplier);
        let rect = isVertical ? { ...setTop(base, pos), height: length } : { ...setLeft(base, pos), width: length };
        const isLast = index === count - 1;
        if (isLast) {
            const right = Math.trunc(rightEdge(childRect) - 1);
            const bottom = Math.trunc(bottomEdge(childRect) - 1);
            rect = { ...rect, width: right - rect.x + 1, height: bottom - rect.y + 1 };
        }
        layoutNode(child, rect, addSpacing, scale, out);
        pos += isVertical ? rect.height : rect.width;
        if (index > 0) {
            const previous = out.nodes[node.children[index - 1].id];
            const handleRect = isVertical
                ? toRect({ x: geometry.x, y: rect.y - HANDLE_THICKNESS / 2, width: geometry.width, height: HANDLE_THICKNESS })
                : toRect({ x: rect.x - HANDLE_THICKNESS / 2, y: geometry.y, width: HANDLE_THICKNESS, height: geometry.height });
            const start = isVertical ? previous.y : previous.x;
            const end = isVertical ? rect.y + rect.height - 1 : rect.x + rect.width - 1;
            out.handles.push({ containerId: node.id, index, axis: node.direction, rect: handleRect, start, end });
        }
    });
}

function splitZones(split: SplitBox): DropZone[] {
    const g = split.rect;
    const third = Math.trunc(g.width / 3);
    const half = Math.trunc(g.height / 2);
    const right = g.x + g.width - 1;
    const bottom = g.y + g.height - 1;
    const relativeId = split.id;
    return [
        { rect: { x: g.x, y: g.y, width: third, height: g.height }, position: { relativeId, direction: "left" }, kind: "split" },
        { rect: { x: right - third, y: g.y, width: third, height: g.height }, position: { relativeId, direction: "right" }, kind: "split" },
        { rect: { x: g.x, y: g.y, width: g.width, height: half }, position: { relativeId, direction: "above" }, kind: "split" },
        { rect: { x: g.x, y: bottom - half, width: g.width, height: half }, position: { relativeId, direction: "below" }, kind: "split" },
    ];
}

export type GridOptions = { addSpacing?: boolean; scale?: number };

export function layoutGrid(root: SplitNode | null, page: Rect, options: GridOptions = {}): GridLayout {
    const scale = options.scale ?? 1;
    const out: Collector = { splits: [], nodes: {}, handles: [], strips: [] };
    if (!root) {
        const everything: DropZone = {
            rect: { x: page.x, y: page.y, width: page.width - 1, height: page.height - 1 },
            position: { direction: "below" },
            kind: "empty",
        };
        return { splits: [], nodes: {}, handles: [], zones: [everything] };
    }
    const geometry: RectF = { x: page.x - 1, y: page.y - 1, width: page.width + 1, height: page.height + 1 };
    layoutNode(root, geometry, !!options.addSpacing, scale, out);
    const zones = [...out.strips, ...out.splits.flatMap(splitZones)];
    return { splits: out.splits, nodes: out.nodes, handles: out.handles, zones };
}

export function dropZoneAt(zones: DropZone[], x: number, y: number): DropZone | undefined {
    return zones.find((zone) => contains(zone.rect, x, y));
}

export function handleFraction(handle: HandleBox, pointer: number): number {
    const span = handle.end - handle.start;
    if (span <= 0) return 0.5;
    const clamped = Math.min(handle.end, Math.max(handle.start, pointer));
    return (clamped - handle.start) / span;
}

export function clampFraction(handle: HandleBox, fraction: number, minSize = MIN_SPLIT_SIZE): number {
    const span = handle.end - handle.start;
    if (span <= minSize * 2) return 0.5;
    const low = minSize / span;
    const high = 1 - low;
    return Math.min(high, Math.max(low, fraction));
}
