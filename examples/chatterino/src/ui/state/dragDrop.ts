import { dropZoneAt } from "../layout/geometry";
import { hitAreas } from "./hitAreas";
import type { DropTarget } from "./layoutActions";

export function resolveDropTarget(selectedTabId: string, x: number, y: number): DropTarget | undefined {
    if (hitAreas.isOnAddTab(x, y)) return { kind: "newTab" };
    const tabId = hitAreas.tabAt(x, y);
    if (tabId) return { kind: "tab", tabId };
    const page = hitAreas.page();
    const zone = dropZoneAt(hitAreas.zones(selectedTabId), x - page.x, y - page.y);
    if (!zone) return undefined;
    return { kind: "zone", tabId: selectedTabId, position: zone.position };
}
