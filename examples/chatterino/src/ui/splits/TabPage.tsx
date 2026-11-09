import { useEffect, useMemo, useState } from "react";
import { View, type MouseResponderEvent } from "react-native-gpui";
import type { TabLayout } from "../../data/api";
import { layoutGrid, type Rect } from "../layout/geometry";
import { removeNode, splitLeaves, topRightSplitId } from "../layout/tree";
import { useApp } from "../state/AppContext";
import { hitAreas } from "../state/hitAreas";
import { useStore } from "../state/useStore";
import { DropOverlay } from "./DropOverlay";
import { EmptyPage } from "./EmptyPage";
import { InsertStrip } from "./InsertStrip";
import { NO_MODIFIERS, nextModifierState, type ModifierState } from "./modifierState";
import { ResizeHandle } from "./ResizeHandle";
import { SplitView } from "./SplitView";

type Props = { tab: TabLayout; selected: boolean; page: Rect; manyTabs: boolean };


export function TabPage({ tab, selected, page, manyTabs }: Props) {
    const services = useApp();
    const { theme, fonts, actions } = services;
    const drag = useStore(services.drag);
    const [modifiers, setModifiers] = useState<ModifierState>(NO_MODIFIERS);
    const [overlayUsed, setOverlayUsed] = useState(false);
    const [activeHandle, setActiveHandle] = useState<string | null>(null);
    const draggedId = drag?.sourceTabId === tab.id ? drag.splitId : undefined;
    const dragging = !!drag;
    const origin = { x: page.x, y: page.y };
    const ctrlHeld = modifiers.ctrl && !modifiers.alt;
    const ctrlAltHeld = selected && !dragging && modifiers.ctrl && modifiers.alt;
    const addSpacing = (dragging && selected) || ctrlAltHeld;

    const root = useMemo(() => (draggedId ? removeNode(tab.root, draggedId).root : tab.root), [tab.root, draggedId]);
    const area = useMemo(() => ({ x: 0, y: 0, width: page.width, height: page.height }), [page.width, page.height]);
    const grid = useMemo(() => layoutGrid(root, area, { addSpacing }), [root, area, addSpacing]);
    const fullGrid = useMemo(() => (draggedId ? layoutGrid(tab.root, area) : grid), [draggedId, tab.root, area, grid]);

    useEffect(() => {
        if (selected) hitAreas.setZones(tab.id, grid.zones);
    }, [selected, tab.id, grid.zones]);

    const leaves = splitLeaves(tab.root);
    const topRight = topRightSplitId(root);
    const rectOf = (id: string) => grid.splits.find((split) => split.id === id)?.rect ?? fullGrid.splits.find((split) => split.id === id)?.rect;
    const isGhostPage = !selected && !!draggedId;
    const isHidden = !selected && !draggedId;
    const strips = ctrlAltHeld ? grid.zones.filter((zone) => zone.kind === "strip") : [];

    const trackModifiers = (event: MouseResponderEvent) => {
        const { ctrlKey, altKey, pageX, pageY } = event.nativeEvent;
        const next = nextModifierState(modifiers, { ctrlKey, altKey, x: pageX - page.x, y: pageY - page.y }, grid.splits);
        if (!(next.ctrl && next.alt) && overlayUsed) setOverlayUsed(false);
        if (next !== modifiers) setModifiers(next);
    };

    const showHandles = selected && !dragging && !ctrlAltHeld;

    return (
        <View
            testID={`page-${tab.id}`}
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: page.width,
                height: page.height,
                display: isHidden ? "none" : "flex",
                opacity: isGhostPage ? 0 : 1,
                backgroundColor: theme.window.background,
            }}
            onMouseMove={selected ? trackModifiers : undefined}
            onMouseLeave={() => setModifiers(NO_MODIFIERS)}
        >
            {grid.splits.map((split) => (
                <View
                    key={`border-${split.id}`}
                    style={{
                        position: "absolute",
                        left: split.rect.x - 1,
                        top: split.rect.y - 1,
                        width: split.rect.width + 2,
                        height: split.rect.height + 2,
                        borderWidth: 1,
                        borderColor: theme.tabs.dividerLine,
                    }}
                />
            ))}
            {tab.root ? null : (
                <EmptyPage testID={`empty-${tab.id}`} theme={theme} fonts={fonts} manyTabs={manyTabs} onPress={() => actions.newSplit(tab.id)} />
            )}
            {leaves.map((leaf) => {
                const rect = rectOf(leaf.id);
                if (!rect) return null;
                const showOverlay = ctrlAltHeld && !overlayUsed && modifiers.splitId === leaf.id;
                return (
                    <SplitView
                        key={leaf.id}
                        split={leaf}
                        tabId={tab.id}
                        rect={rect}
                        pageOrigin={origin}
                        focused={selected && tab.focusedSplitId === leaf.id}
                        isTopRight={topRight === leaf.id}
                        ghost={leaf.id === draggedId}
                        overlay={showOverlay}
                        zoomWheel={selected && ctrlHeld && !dragging}
                        onOverlayUsed={() => setOverlayUsed(true)}
                    />
                );
            })}
            {strips.map((zone, index) => (
                <InsertStrip
                    key={`insert-${index}`}
                    zone={zone}
                    testID={`insert-strip-${index}`}
                    onInsert={() => actions.insertEmptyAt(tab.id, zone.position)}
                />
            ))}
            {showHandles
                ? grid.handles.map((handle) => {
                      const key = `${handle.containerId}:${handle.index}`;
                      return (
                          <ResizeHandle
                              key={key}
                              handle={handle}
                              expanded={ctrlHeld || activeHandle === key}
                              pageOrigin={origin}
                              theme={theme}
                              onResize={(fraction) => actions.resize(tab.id, handle.containerId, handle.index, fraction)}
                              onReset={() => actions.resetContainer(tab.id, handle.containerId)}
                              onActiveChange={(active) => setActiveHandle(active ? key : null)}
                          />
                      );
                  })
                : null}
            {dragging && selected ? <DropOverlay zones={grid.zones} pageOrigin={origin} /> : null}
        </View>
    );
}
