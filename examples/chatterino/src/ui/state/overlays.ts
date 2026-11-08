import type { Rect } from "../layout/geometry";

export type MenuEntry =
    | { kind: "item"; label: string; shortcut?: string; checked?: boolean; radio?: boolean; disabled?: boolean; onSelect: () => void }
    | { kind: "separator" }
    | { kind: "submenu"; label: string; entries: MenuEntry[] };

export type OverlaySpec =
    | { kind: "menu"; x: number; y: number; entries: MenuEntry[]; alignRight?: boolean }
    | { kind: "settings"; page?: string }
    | { kind: "selectChannel"; splitId: string; isNew: boolean }
    | { kind: "userCard"; login: string; channel: string; x: number; y: number }
    | { kind: "emotes"; splitId: string; channel: string }
    | { kind: "search"; splitId: string; channels: string[] }
    | { kind: "renameTab"; tabId: string }
    | { kind: "addAccount" }
    | { kind: "confirm"; title: string; message: string; onConfirm: () => void; infoOnly?: boolean };

export type Overlay = OverlaySpec & { id: string };

export type TooltipSpec = {
    owner: string;
    text: string;
    image?: string;
    anchor: Rect;
    cursor?: { x: number; y: number };
    placement: "below" | "cursor";
};

const SINGLETONS = new Set<OverlaySpec["kind"]>(["settings", "menu", "selectChannel", "renameTab", "confirm", "addAccount"]);

export function openOverlay(stack: Overlay[], spec: OverlaySpec, id: string): Overlay[] {
    const overlay = { ...spec, id } as Overlay;
    const isSingleton = SINGLETONS.has(spec.kind);
    const rest = isSingleton ? stack.filter((entry) => entry.kind !== spec.kind) : stack;
    const withoutMenus = spec.kind === "menu" ? rest : rest.filter((entry) => entry.kind !== "menu");
    return [...withoutMenus, overlay];
}

export function closeOverlay(stack: Overlay[], id: string): Overlay[] {
    return stack.filter((entry) => entry.id !== id);
}

export function isModal(overlay: Overlay): boolean {
    return overlay.kind === "selectChannel" || overlay.kind === "renameTab" || overlay.kind === "confirm" || overlay.kind === "addAccount";
}
