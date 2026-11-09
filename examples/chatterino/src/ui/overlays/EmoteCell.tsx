import { Image, View, type MouseResponderEvent } from "react-native-gpui";
import type { EmoteInfo } from "../../data/api";
import { useApp } from "../state/AppContext";
import type { GridItem } from "./emoteGridLayout";

type Props = { item: GridItem; top: number; tooltipOwner: string; tooltipText: (emote: EmoteInfo) => string; onPick: (emote: EmoteInfo) => void };

export function EmoteCell({ item, top, tooltipOwner, tooltipText, onPick }: Props) {
    const { showTooltip, hideTooltip } = useApp();
    const { emote } = item;
    const hover = (event: MouseResponderEvent) => {
        const { pageX, pageY, locationX, locationY } = event.nativeEvent;
        showTooltip({
            owner: tooltipOwner,
            text: tooltipText(emote),
            image: emote.tooltipImage ?? emote.url,
            anchor: { x: pageX - locationX, y: pageY - locationY, width: item.width, height: item.height },
            cursor: { x: pageX, y: pageY },
            placement: "cursor",
        });
    };
    return (
        <View
            testID={`emote-cell-${emote.name}`}
            accessibilityLabel={emote.name}
            nativeListGroup="emote-grid"
            style={{ position: "absolute", left: item.x, top, width: item.width, height: item.height, cursor: "pointer" }}
            onMouseEnter={hover}
            onMouseMove={hover}
            onMouseLeave={() => hideTooltip(tooltipOwner)}
            onClick={() => onPick(emote)}
        >
            <Image source={{ uri: emote.url }} style={{ width: item.width, height: item.height }} resizeMode="contain" />
        </View>
    );
}
