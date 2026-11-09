import { useRef } from "react";
import { Text, View, type MouseResponderEvent } from "react-native-gpui";
import type { Channel, ChannelInfo, SplitLeaf } from "../../data/api";
import { themedAsset } from "../assetPaths";
import { IconButton } from "../common/IconButton";
import { KebabButton } from "../common/KebabButton";
import { PlusButton } from "../common/PlusButton";
import { headerTitle, roomModesText } from "../format";
import type { Rect } from "../layout/geometry";
import { useApp } from "../state/AppContext";
import { isSpecialChannel } from "../state/specialChannels";
import { useModRights } from "../state/useChannelRights";
import { useStore } from "../state/useStore";
import { headerTooltipBlocks } from "./headerTooltip";
import { ModesLabel } from "./ModesLabel";
import { splitMenuEntries } from "./splitMenu";
import { useSplitDrag } from "./useSplitDrag";

type Props = {
    split: SplitLeaf;
    tabId: string;
    channel: Channel | undefined;
    info: ChannelInfo | undefined;
    focused: boolean;
    isTopRight: boolean;
    rect: Rect;
    detached?: boolean;
    onClear: () => void;
    onClosePopup?: () => void;
};

const HEIGHT = 28;
const ADD_WIDTH = 16;
const BUTTON_WIDTH = 28;
const DRAG_DISTANCE = 15;
const DOUBLE_CLICK_MS = 400;

export function SplitHeader({ split, tabId, channel, info, focused, isTopRight, rect, detached, onClear, onClosePopup }: Props) {
    const services = useApp();
    const { theme, fonts, actions, settings, core } = services;
    const accounts = useStore(core.accounts);
    const lastDown = useRef(0);
    const tooltipOwner = `header:${split.id}`;
    const drag = useSplitDrag(split.id, tabId, DRAG_DISTANCE);
    const isSpecial = isSpecialChannel(split.channel);
    const hasModRights = useModRights(isSpecial ? undefined : channel, accounts.current);
    const moderationMode = !!split.moderationMode;
    const showModeration = hasModRights || moderationMode;
    const background = focused ? theme.header.focusedBackground : theme.header.background;
    const border = focused ? theme.header.focusedBorder : theme.header.border;
    const textColor = focused ? theme.header.focusedText : theme.header.text;
    const titleOptions = {
        uptime: !!settings.headerUptime,
        viewers: !!settings.headerViewerCount,
        game: !!settings.headerGame,
        title: !!settings.headerStreamTitle,
        filtered: (split.filters?.length ?? 0) > 0,
    };
    const title = isSpecial ? split.channel : headerTitle(split.channel, info, titleOptions);
    const modes = info ? roomModesText(info.modes, hasModRights) : "";
    const buttonsWidth = (showModeration ? BUTTON_WIDTH : 0) + BUTTON_WIDTH + (isTopRight ? ADD_WIDTH : 0);
    const borderWidth = isTopRight ? rect.width - ADD_WIDTH : rect.width;

    const openMenu = (x: number, y: number, alignRight = false) =>
        services.openOverlay({ kind: "menu", x, y, alignRight, entries: splitMenuEntries(services, split, onClear, { detached, hasModRights, onClosePopup }) });

    const showTooltip = () => {
        if (isSpecial || !split.channel) return;
        const thumbnailSize = settings.thumbnailSizeStream ?? 2;
        const blocks = headerTooltipBlocks(info?.live, split.channel, thumbnailSize, Date.now());
        if (!blocks) return;
        services.showTooltip({ owner: tooltipOwner, text: "", blocks, anchor: rect, placement: "below" });
    };

    const toggleModeration = () => {
        services.hideTooltip(tooltipOwner);
        const noActions = (settings.moderationActions ?? []).length === 0;
        if (noActions) {
            services.openOverlay({ kind: "settings", page: "Moderation" });
            actions.setModerationMode(split.id, true);
            return;
        }
        actions.setModerationMode(split.id, !moderationMode);
    };

    const handleDown = (event: MouseResponderEvent) => {
        const onButton = event.nativeEvent.locationX >= rect.width - buttonsWidth;
        services.hideTooltip(tooltipOwner);
        if (event.nativeEvent.pressDrag || onButton || detached) return;
        const now = Date.now();
        const isDoubleClick = now - lastDown.current < DOUBLE_CLICK_MS;
        lastDown.current = now;
        if (isDoubleClick) {
            drag.cancel();
            services.openOverlay({ kind: "selectChannel", splitId: split.id, isNew: false });
            return;
        }
        drag.begin(event);
    };

    return (
        <View
            testID={`split-header-${split.id}`}
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
            nativeListGroup={`drag-${split.id}`}
            style={{ height: HEIGHT, backgroundColor: background, flexDirection: "row", alignItems: "center", cursor: "default" }}
            onMouseDown={handleDown}
            onMouseMove={drag.move}
            onMouseUp={drag.end}
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
            {modes ? <ModesLabel splitId={split.id} text={modes} /> : null}
            {showModeration ? (
                <IconButton
                    testID={`split-moderation-${split.id}`}
                    label={moderationMode ? "Disable moderation mode" : "Enable moderation mode"}
                    icon={
                        moderationMode
                            ? themedAsset(theme.isLight, "moderationEnabled-darkMode.svg", "moderationEnabled-lightMode.svg")
                            : themedAsset(theme.isLight, "moderationDisabled-darkMode.svg", "moderationDisabled-lightMode.svg")
                    }
                    width={BUTTON_WIDTH}
                    height={HEIGHT}
                    iconWidth={18}
                    iconHeight={18}
                    onPress={toggleModeration}
                    onContextMenu={() => services.openOverlay({ kind: "settings", page: "Moderation" })}
                />
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
