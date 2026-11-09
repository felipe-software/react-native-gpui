import type { Rect } from "../layout/geometry";
import type { Direction } from "../layout/tree";

export type OverlayButtonKind = "move" | Direction;

export const OVERLAY_ICON = 16;
export const OVERLAY_BUTTON_WIDTH = 34;
export const OVERLAY_BUTTON_HEIGHT = 24;
export const OVERLAY_MIN_SIZE = 150;

export type OverlayButtonBox = { kind: OverlayButtonKind; rect: Rect };

export function overlayButtons(width: number, height: number, buttonWidth = OVERLAY_BUTTON_WIDTH, buttonHeight = OVERLAY_BUTTON_HEIGHT): OverlayButtonBox[] {
    const centerX = Math.round((width - buttonWidth) / 2);
    const centerY = Math.round((height - buttonHeight) / 2);
    const box = (x: number, y: number): Rect => ({ x, y, width: buttonWidth, height: buttonHeight });
    const boxes: OverlayButtonBox[] = [{ kind: "move", rect: box(centerX, centerY) }];
    if (width > OVERLAY_MIN_SIZE) {
        boxes.push({ kind: "left", rect: box(1, centerY) });
        boxes.push({ kind: "right", rect: box(width - 1 - buttonWidth, centerY) });
    }
    if (height > OVERLAY_MIN_SIZE) {
        boxes.push({ kind: "above", rect: box(centerX, 1) });
        boxes.push({ kind: "below", rect: box(centerX, height - 1 - buttonHeight) });
    }
    return boxes;
}

export function overlayPreview(kind: OverlayButtonKind, width: number, height: number): Rect | undefined {
    const halfWidth = Math.trunc(width / 2);
    const halfHeight = Math.trunc(height / 2);
    switch (kind) {
        case "left":
            return { x: 0, y: 0, width: halfWidth, height };
        case "right":
            return { x: halfWidth, y: 0, width: halfWidth, height };
        case "above":
            return { x: 0, y: 0, width, height: halfHeight };
        case "below":
            return { x: 0, y: halfHeight, width, height: halfHeight };
        default:
            return undefined;
    }
}
