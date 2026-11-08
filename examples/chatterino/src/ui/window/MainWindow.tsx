import { useEffect, useState } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native-gpui";
import type { Rect } from "../layout/geometry";
import { OverlayLayer } from "../overlays/OverlayLayer";
import { Tooltip } from "../overlays/Tooltip";
import { TabPage } from "../splits/TabPage";
import { useApp } from "../state/AppContext";
import { hitAreas } from "../state/hitAreas";
import type { TooltipSpec } from "../state/overlays";
import { useStore } from "../state/useStore";
import { TabBar } from "./TabBar";

const TAB_ROW = 30;

export function MainWindow({ tooltip }: { tooltip: TooltipSpec | null }) {
    const services = useApp();
    const { core, theme } = services;
    const layout = useStore(core.layout);
    const window = useWindowDimensions();
    const [page, setPage] = useState<Rect>({ x: 0, y: TAB_ROW, width: window.width, height: window.height - TAB_ROW });

    useEffect(() => {
        const selected = layout.selectedTabId;
        services.tabActivity.set((activity) => {
            if (!activity[selected]) return activity;
            const next = { ...activity };
            delete next[selected];
            return next;
        });
    }, [layout.selectedTabId, services.tabActivity]);

    const handlePageLayout = (event: LayoutChangeEvent) => {
        const rect = event.nativeEvent.layout;
        hitAreas.setPage(rect);
        setPage(rect);
    };

    return (
        <View testID="main-window" style={{ flex: 1, backgroundColor: theme.window.background }}>
            <TabBar layout={layout} />
            <View style={{ flex: 1 }} onLayout={handlePageLayout}>
                {layout.tabs.map((tab) => (
                    <TabPage key={tab.id} tab={tab} selected={tab.id === layout.selectedTabId} page={page} manyTabs={layout.tabs.length > 1} />
                ))}
            </View>
            <OverlayLayer />
            {tooltip ? <Tooltip spec={tooltip} /> : null}
        </View>
    );
}
