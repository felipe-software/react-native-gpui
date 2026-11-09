import { createContext } from "react";
import type { WindowKind } from "react-native-gpui";
import type { Overlay } from "../state/overlays";

export type OverlayWindow = {
    kind: WindowKind;
    closeOnEscape: boolean;
    anchor?: { x: number; y: number };
};

export const OverlayWindowContext = createContext<OverlayWindow | null>(null);

function anchorOf(x: number | undefined, y: number | undefined) {
    return x === undefined || y === undefined ? undefined : { x, y };
}

export function overlayWindowFor(overlay: Overlay): OverlayWindow | null {
    switch (overlay.kind) {
        case "userCard":
            return { kind: "popup", closeOnEscape: true, anchor: anchorOf(overlay.x, overlay.y) };
        case "thread":
            return { kind: "normal", closeOnEscape: true, anchor: anchorOf(overlay.x, overlay.y) };
        case "emotes":
        case "search":
            return { kind: "normal", closeOnEscape: true };
        case "settings":
            return { kind: "dialog", closeOnEscape: false };
        case "selectChannel":
        case "addAccount":
        case "renameTab":
        case "confirm":
            return { kind: "dialog", closeOnEscape: true };
        default:
            return null;
    }
}
