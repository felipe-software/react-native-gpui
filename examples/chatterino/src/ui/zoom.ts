export const MIN_UI_SCALE = 0.2;
export const MAX_UI_SCALE = 10;
export const ZOOM_STEP = 0.1;

export type ZoomDirection = "in" | "out" | "reset";

export function clampUiScale(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value));
}

export function uiScaleOf(settings: { uiScale?: number }): number {
    return clampUiScale(settings.uiScale ?? 1);
}

export function zoomedScale(current: number, direction: ZoomDirection): number {
    if (direction === "reset") return 1;
    const step = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
    return Math.round(clampUiScale(clampUiScale(current) + step) * 100) / 100;
}

export function scaledPoints(points: number, scale: number): number {
    return Math.max(1, Math.trunc(points * scale));
}
