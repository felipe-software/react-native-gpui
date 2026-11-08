import { contains, type DropZone, type Rect } from "../layout/geometry";

const tabRects = new Map<string, Rect>();
const zonesByTab = new Map<string, DropZone[]>();
let addTabRect: Rect | undefined;
let pageRect: Rect = { x: 0, y: 30, width: 1280, height: 770 };

export const hitAreas = {
    setTab(tabId: string, rect: Rect): void {
        tabRects.set(tabId, rect);
    },
    removeTab(tabId: string): void {
        tabRects.delete(tabId);
    },
    clearTabs(): void {
        tabRects.clear();
        addTabRect = undefined;
    },
    setAddTab(rect: Rect): void {
        addTabRect = rect;
    },
    setPage(rect: Rect): void {
        pageRect = rect;
    },
    page(): Rect {
        return pageRect;
    },
    setZones(tabId: string, zones: DropZone[]): void {
        zonesByTab.set(tabId, zones);
    },
    zones(tabId: string): DropZone[] {
        return zonesByTab.get(tabId) ?? [];
    },
    snapshot(): { tabs: Array<[string, Rect]>; addTab?: Rect; page: Rect } {
        return { tabs: [...tabRects.entries()], addTab: addTabRect, page: pageRect };
    },
    tabAt(x: number, y: number): string | undefined {
        for (const [tabId, rect] of tabRects) {
            if (contains(rect, x, y)) return tabId;
        }
        return undefined;
    },
    isOnAddTab(x: number, y: number): boolean {
        return !!addTabRect && contains(addTabRect, x, y);
    },
};
