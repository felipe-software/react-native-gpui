import type { SplitContainer, SplitLeaf, SplitNode } from "../../data/api";

export type Direction = "left" | "right" | "above" | "below";
export type Axis = SplitContainer["direction"];
export type SplitPosition = { relativeId?: string; direction: Direction };
export type NewId = () => string;

export function axisOf(direction: Direction): Axis {
    const horizontal = direction === "left" || direction === "right";
    return horizontal ? "horizontal" : "vertical";
}

function insertsBefore(direction: Direction): boolean {
    return direction === "left" || direction === "above";
}

export function normalizeSizes(sizes: number[]): number[] {
    const total = sizes.reduce((sum, size) => sum + Math.max(0, size), 0);
    if (total <= 0) return sizes.map(() => 1 / sizes.length);
    return sizes.map((size) => Math.max(0, size) / total);
}

function sizesWithInsert(sizes: number[], index: number): number[] {
    const flexes = normalizeSizes(sizes).map((size) => size * sizes.length);
    flexes.splice(index, 0, 1);
    return normalizeSizes(flexes);
}

function sizesWithout(sizes: number[], index: number): number[] {
    const rest = sizes.filter((_, position) => position !== index);
    return normalizeSizes(rest);
}

function pair(id: string, direction: Direction, existing: SplitNode, added: SplitNode): SplitContainer {
    const children = insertsBefore(direction) ? [added, existing] : [existing, added];
    return { type: "container", id, direction: axisOf(direction), children, sizes: [0.5, 0.5] };
}

export function findNode(root: SplitNode | null, id: string): SplitNode | undefined {
    if (!root) return undefined;
    if (root.id === id) return root;
    if (root.type === "split") return undefined;
    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return undefined;
}

export type ParentRef = { parent: SplitContainer; index: number };

export function findParent(root: SplitNode | null, id: string): ParentRef | undefined {
    if (!root || root.type === "split") return undefined;
    const index = root.children.findIndex((child) => child.id === id);
    if (index >= 0) return { parent: root, index };
    for (const child of root.children) {
        const found = findParent(child, id);
        if (found) return found;
    }
    return undefined;
}

export function ancestorsOf(root: SplitNode | null, id: string): ParentRef[] {
    const chain: ParentRef[] = [];
    let current = findParent(root, id);
    while (current) {
        chain.push(current);
        current = findParent(root, current.parent.id);
    }
    return chain;
}

export function splitLeaves(root: SplitNode | null): SplitLeaf[] {
    if (!root) return [];
    if (root.type === "split") return [root];
    return root.children.flatMap((child) => splitLeaves(child));
}

export function mapNode(root: SplitNode, id: string, update: (node: SplitNode) => SplitNode): SplitNode {
    if (root.id === id) return update(root);
    if (root.type === "split") return root;
    let changed = false;
    const children = root.children.map((child) => {
        const next = mapNode(child, id, update);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...root, children } : root;
}

export function appendSplit(root: SplitNode | null, leaf: SplitLeaf, newId: NewId): SplitNode {
    if (!root) return leaf;
    if (root.type === "split") return pair(newId(), "right", root, leaf);
    if (root.direction === "horizontal") {
        const index = root.children.length;
        return { ...root, children: [...root.children, leaf], sizes: sizesWithInsert(root.sizes, index) };
    }
    return pair(newId(), "right", root, leaf);
}

export function insertRelative(root: SplitNode | null, added: SplitNode, position: SplitPosition, newId: NewId): SplitNode {
    if (!root) return added;
    const relative = position.relativeId ? findNode(root, position.relativeId) : undefined;
    if (!relative) {
        return insertRelative(root, added, { relativeId: root.id, direction: position.direction }, newId);
    }
    const axis = axisOf(position.direction);
    const parentRef = findParent(root, relative.id);
    if (parentRef && parentRef.parent.direction === axis) {
        const { parent, index } = parentRef;
        const insertAt = insertsBefore(position.direction) ? index : index + 1;
        const children = [...parent.children];
        children.splice(insertAt, 0, added);
        const updated: SplitContainer = { ...parent, children, sizes: sizesWithInsert(parent.sizes, insertAt) };
        return mapNode(root, parent.id, () => updated);
    }
    const isRootContainerOfAxis = !parentRef && relative.type === "container" && relative.direction === axis;
    if (isRootContainerOfAxis && relative.type === "container") {
        const insertAt = insertsBefore(position.direction) ? 0 : relative.children.length;
        const children = [...relative.children];
        children.splice(insertAt, 0, added);
        return { ...relative, children, sizes: sizesWithInsert(relative.sizes, insertAt) };
    }
    return mapNode(root, relative.id, (node) => pair(newId(), position.direction, node, added));
}

export type Removal = { root: SplitNode | null; position: SplitPosition };

export function removeNode(root: SplitNode | null, id: string): Removal {
    const fallback: Removal = { root, position: { direction: "right" } };
    if (!root) return fallback;
    if (root.id === id) return { root: null, position: { direction: "right" } };
    const parentRef = findParent(root, id);
    if (!parentRef) return fallback;
    const { parent, index } = parentRef;
    const isVertical = parent.direction === "vertical";
    if (parent.children.length === 2) {
        const sibling = parent.children[1 - index];
        const removedFirst = index === 0;
        const beforeDirection: Direction = isVertical ? "above" : "left";
        const afterDirection: Direction = isVertical ? "below" : "right";
        const direction = removedFirst ? beforeDirection : afterDirection;
        return { root: mapNode(root, parent.id, () => sibling), position: { relativeId: sibling.id, direction } };
    }
    const isLast = index === parent.children.length - 1;
    const relative = isLast ? parent.children[index - 1] : parent.children[index + 1];
    const lastDirection: Direction = isVertical ? "below" : "right";
    const middleDirection: Direction = isVertical ? "above" : "left";
    const direction = isLast ? lastDirection : middleDirection;
    const children = parent.children.filter((_, position) => position !== index);
    const updated: SplitContainer = { ...parent, children, sizes: sizesWithout(parent.sizes, index) };
    return { root: mapNode(root, parent.id, () => updated), position: { relativeId: relative.id, direction } };
}

export function moveSplit(root: SplitNode | null, id: string, position: SplitPosition, newId: NewId): SplitNode | null {
    const leaf = findNode(root, id);
    if (!leaf || leaf.type !== "split" || position.relativeId === id) return root;
    const removal = removeNode(root, id);
    return insertRelative(removal.root, leaf, position, newId);
}

export function setChannel(root: SplitNode | null, splitId: string, channel: string): SplitNode | null {
    if (!root) return root;
    return mapNode(root, splitId, (node) => (node.type === "split" ? { ...node, channel } : node));
}

export function resizePair(root: SplitNode | null, containerId: string, index: number, fraction: number): SplitNode | null {
    if (!root) return root;
    return mapNode(root, containerId, (node) => {
        if (node.type !== "container" || index <= 0 || index >= node.children.length) return node;
        const sizes = normalizeSizes(node.sizes);
        const combined = sizes[index - 1] + sizes[index];
        const clamped = Math.min(1, Math.max(0, fraction));
        const next = [...sizes];
        next[index - 1] = combined * clamped;
        next[index] = combined - next[index - 1];
        return { ...node, sizes: next };
    });
}

export function resetSizes(root: SplitNode | null, containerId: string): SplitNode | null {
    if (!root) return root;
    return mapNode(root, containerId, (node) => {
        if (node.type !== "container") return node;
        return { ...node, sizes: node.children.map(() => 1 / node.children.length) };
    });
}

export function topRightSplitId(root: SplitNode | null): string | undefined {
    if (!root) return undefined;
    if (root.type === "split") return root.id;
    const isHorizontal = root.direction === "horizontal";
    const child = isHorizontal ? root.children[root.children.length - 1] : root.children[0];
    return topRightSplitId(child);
}

export type PreferredChildren = Record<string, string>;

export function preferredAfterFocus(root: SplitNode | null, splitId: string, preferred: PreferredChildren): PreferredChildren {
    const next = { ...preferred };
    let childId = splitId;
    for (const { parent } of ancestorsOf(root, splitId)) {
        next[parent.id] = childId;
        childId = parent.id;
    }
    return next;
}

function focusTarget(node: SplitNode, preferred: PreferredChildren): string {
    if (node.type === "split") return node.id;
    const preferredId = preferred[node.id];
    const child = node.children.find((candidate) => candidate.id === preferredId) ?? node.children[0];
    return focusTarget(child, preferred);
}

export function neighborSplit(
    root: SplitNode | null,
    fromId: string,
    direction: Direction,
    preferred: PreferredChildren = {},
): string | undefined {
    const axis = axisOf(direction);
    const backwards = insertsBefore(direction);
    for (const { parent, index } of ancestorsOf(root, fromId)) {
        if (parent.direction !== axis) continue;
        const neighborIndex = backwards ? index - 1 : index + 1;
        const neighbor = parent.children[neighborIndex];
        if (neighbor) return focusTarget(neighbor, preferred);
    }
    return undefined;
}
