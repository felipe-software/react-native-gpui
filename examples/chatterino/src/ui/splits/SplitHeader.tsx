import { useRef } from "react";
import { Text, View, type MouseResponderEvent } from "react-native-gpui";
import type { ChannelInfo, SplitLeaf } from "../../data/api";
import { KebabButton } from "../common/KebabButton";
import { PlusButton } from "../common/PlusButton";
import { headerTitle, liveTooltip, roomModesText } from "../format";
import type { Rect } from "../layout/geometry";
import { useApp } from "../state/AppContext";
import { resolveDropTarget } from "../state/dragDrop";
import { hitAreas } from "../state/hitAreas";
import { MENTIONS_CHANNEL } from "../state/ids";
import { splitMenuEntries } from "./splitMenu";

type Props = {
    split: SplitLeaf;
    tabId: string;
    info: ChannelInfo | undefined;
    focused: boolean;
    isTopRight: boolean;
    rect: Rect;
    onClear: () => void;
};

const HEIGHT = 28;
const ADD_WIDTH = 16;
const KEBAB_WIDTH = 28;
const DRAG_DISTANCE = 15;
const DOUBLE_CLICK_MS = 400;

type Press = { x: number; y: number; dragging: boolean };

export function SplitHeader({ split, tabId, info, focused, isTopRight, rect, onClear }: Props) {
    const services = useApp();
    const { theme, fonts, actions } = services;
    const press = useRef<Press | null>(null);
    const lastDown = useRef(0);
    const tooltipOwner = `header:${split.id}`;
    const background = focused ? theme.header.focusedBackground : theme.header.background;
    const border = focused ? theme.header.focusedBorder : theme.header.border;
    const textColor = focused ? theme.header.focusedText : theme.header.text;
    const isMentions = split.channel === MENTIONS_CHANNEL;
    const title = isMentions ? "/mentions" : headerTitle(split.channel, info);
    const modes = info ? roomModesText(info.modes) : "";
    const borderWidth = isTopRight ? rect.width - ADD_WIDTH : rect.width;

    const openMenu = (x: number, y: number, alignRight = false) =>
        services.openOverlay({ kind: "menu", x, y, alignRight, entries: splitMenuEntries(services, split, onClear) });

    const showTooltip = () => {
        const tooltip = liveTooltip(info?.live, Date.now());
        if (!tooltip) return;
        const lines = [tooltip.title, tooltip.game, tooltip.status].filter((line): line is string => !!line);
        services.showTooltip({ owner: tooltipOwner, text: lines.join("\n"), anchor: rect, placement: "below" });
    };

    const handleDown = (event: MouseResponderEvent) => {
        const buttonsWidth = isTopRight ? KEBAB_WIDTH + ADD_WIDTH : KEBAB_WIDTH;
        const onButton = event.nativeEvent.locationX >= rect.width - buttonsWidth;
        services.hideTooltip(tooltipOwner);
        if (event.nativeEvent.pressDrag || onButton) return;
        const { pageX, pageY } = event.nativeEvent;
        const now = Date.now();
        const isDoubleClick = now - lastDown.current < DOUBLE_CLICK_MS;
        lastDown.current = now;
        if (isDoubleClick) {
            press.current = null;
            services.openOverlay({ kind: "selectChannel", splitId: split.id, isNew: false });
            return;
        }
        press.current = { x: pageX, y: pageY, dragging: false };
    };

    const handleMove = (event: MouseResponderEvent) => {
        const current = press.current;
        if (!current) return;
        const { pageX, pageY } = event.nativeEvent;
        if (!current.dragging) {
            const distance = Math.hypot(pageX - current.x, pageY - current.y);
            if (distance <= DRAG_DISTANCE) return;
            current.dragging = true;
            services.hideTooltip(tooltipOwner);
            services.hideTooltip(`chat:${split.id}`);
        }
        services.drag.set({ splitId: split.id, sourceTabId: tabId, x: pageX, y: pageY });
        const hoveredTab = hitAreas.tabAt(pageX, pageY);
        if (hoveredTab) actions.peekTab(hoveredTab);
    };

    const handleUp = (event: MouseResponderEvent) => {
        if (event.nativeEvent.pressDrag) return;
        const current = press.current;
        press.current = null;
        if (!current) return;
        const { pageX, pageY } = event.nativeEvent;
        const movedFar = Math.hypot(pageX - current.x, pageY - current.y) > DRAG_DISTANCE;
        const wasDrag = current.dragging || movedFar;
        if (!wasDrag) return;
        const hoveredTab = hitAreas.tabAt(pageX, pageY);
        if (hoveredTab) actions.peekTab(hoveredTab);
        const target = resolveDropTarget(services.core.layout.get().selectedTabId, pageX, pageY);
        services.drag.set(null);
        if (target) actions.dropSplit(split.id, target);
        else actions.focusSplit(split.id);
    };

    return (
        <View
            testID={`split-header-${split.id}`}
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
            nativeListGroup={`drag-${split.id}`}
            style={{ height: HEIGHT, backgroundColor: background, flexDirection: "row", alignItems: "center", cursor: "default" }}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseEnter={showTooltip}
            onMouseLeave={() => services.hideTooltip(tooltipOwner)}
            onContextMenu={(event) => openMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        >
            <View
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: borderWidth,
                    height: HEIGHT - 1,
                    borderWidth: 1,
                    borderColor: border,
                }}
            />
            <View style={{ width: 8 }} />
            <View style={{ flex: 1, alignItems: "center" }}>
                <Text numberOfLines={1} style={{ marginTop: 2, color: textColor, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize }}>
                    {title}
                </Text>
            </View>
            <View style={{ width: 8 }} />
            {modes ? (
                <View testID={`split-modes-${split.id}`} style={{ paddingHorizontal: 6, justifyContent: "center" }}>
                    <Text style={{ marginTop: 4, color: theme.window.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize, textAlign: "center" }}>{modes}</Text>
                </View>
            ) : null}
            <KebabButton
                testID={`split-menu-${split.id}`}
                color={theme.buttons.kebab}
                hoverColor={theme.buttons.hover}
                onOpen={(x, y) => openMenu(x, y, true)}
            />
            {isTopRight ? (
                <PlusButton
                    testID={`split-add-${split.id}`}
                    width={ADD_WIDTH}
                    height={HEIGHT}
                    centerX={8}
                    centerY={13}
                    length={9}
                    color={theme.buttons.plus}
                    hoverColor={theme.buttons.hover}
                    onPress={() => actions.newSplit(tabId)}
                />
            ) : null}
        </View>
    );
}
