import { contains, type SplitBox } from "../layout/geometry";

export type ModifierState = { ctrl: boolean; alt: boolean; splitId?: string };

export const NO_MODIFIERS: ModifierState = { ctrl: false, alt: false };

export type PointerSample = { ctrlKey?: boolean; altKey?: boolean; x: number; y: number };

export function nextModifierState(previous: ModifierState, sample: PointerSample, splits: SplitBox[]): ModifierState {
    const ctrl = !!sample.ctrlKey;
    const alt = !!sample.altKey;
    const overlayHeld = ctrl && alt;
    const splitId = overlayHeld ? splits.find((split) => contains(split.rect, sample.x, sample.y))?.id : undefined;
    const unchanged = ctrl === previous.ctrl && alt === previous.alt && splitId === previous.splitId;
    if (unchanged) return previous;
    return splitId ? { ctrl, alt, splitId } : { ctrl, alt };
}
