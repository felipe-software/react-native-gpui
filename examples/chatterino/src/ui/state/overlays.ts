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
    | { kind: "confirm"; title: string; message: string; onConfirm: () => void; infoOnly?: boolean }
    | { kind: "thread"; splitId: string; channel: string; rootId: string; x?: number; y?: number }
    | { kind: "splitPopup"; channel: string }
    | { kind: "quickSwitcher" };

export type Overlay = OverlaySpec & { id: string };

export type TooltipBlock = { kind: "text"; text: string } | { kind: "image"; url: string; width: number; height: number };

export type TooltipSpec = {
    owner: string;
    text: string;
    image?: string;
    blocks?: TooltipBlock[];
    anchor: Rect;
    cursor?: { x: number; y: number };
    placement: "below" | "cursor";
};

const SINGLETONS = new Set<OverlaySpec["kind"]>(["settings", "menu", "selectChannel", "renameTab", "confirm", "addAccount", "quickSwitcher"]);

function replacesExisting(entry: Overlay, spec: OverlaySpec): boolean {
    if (SINGLETONS.has(spec.kind)) return entry.kind === spec.kind;
    if (spec.kind === "emotes") return entry.kind === "emotes" && entry.splitId === spec.splitId;
    return false;
}

export function openOverlay(stack: Overlay[], spec: OverlaySpec, id: string): Overlay[] {
    const overlay = { ...spec, id } as Overlay;
    const rest = stack.filter((entry) => !replacesExisting(entry, spec));
    const withoutMenus = spec.kind === "menu" ? rest : rest.filter((entry) => entry.kind !== "menu");
    return [...withoutMenus, overlay];
}

export function closeOverlay(stack: Overlay[], id: string): Overlay[] {
    return stack.filter((entry) => entry.id !== id);
}

export function isModal(overlay: Overlay): boolean {
    return overlay.kind === "selectChannel" || overlay.kind === "renameTab" || overlay.kind === "confirm" || overlay.kind === "addAccount";
}
