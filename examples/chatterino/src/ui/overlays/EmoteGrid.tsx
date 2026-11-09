import { useMemo, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native-gpui";
import type { EmoteInfo } from "../../data/api";
import { useApp } from "../state/AppContext";
import { uiScaleOf } from "../zoom";
import { EmoteCell } from "./EmoteCell";
import { layoutEmoteGrid, visibleRows } from "./emoteGridLayout";
import type { EmoteSection } from "./emoteSections";

type Props = {
    testID: string;
    sections: EmoteSection[];
    tooltipOwner: string;
    tooltipText: (emote: EmoteInfo) => string;
    onPick: (emote: EmoteInfo) => void;
};

type ScrollEvent = { nativeEvent?: { contentOffset?: { y?: number } } };

const LINE_HEIGHT_EM = 1.117;
const SPACE_EM = 0.278;
const SCROLLBAR_ALLOWANCE = 8;

export function EmoteGrid({ testID, sections, tooltipOwner, tooltipText, onPick }: Props) {
    const { theme, fonts, settings } = useApp();
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [scrollTop, setScrollTop] = useState(0);
    const scale = settings.emoteScale * uiScaleOf(settings);
    const textLine = fonts.chatSize * LINE_HEIGHT_EM;
    const space = Math.round(fonts.chatSize * SPACE_EM);

    const layout = useMemo(() => {
        const full = layoutEmoteGrid(sections, { width: size.width, textLine, space, scale });
        if (full.height <= size.height) return full;
        return layoutEmoteGrid(sections, { width: size.width - SCROLLBAR_ALLOWANCE, textLine, space, scale });
    }, [sections, size.width, size.height, textLine, space, scale]);
    const rows = size.width > 0 ? visibleRows(layout, scrollTop, size.height) : [];

    const handleLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
    };

    const handleScroll = (event: unknown) => {
        const offset = (event as ScrollEvent).nativeEvent?.contentOffset?.y ?? 0;
        setScrollTop(offset);
    };

    const textStyle = { fontFamily: fonts.chatFamily, fontSize: fonts.chatSize, textAlign: "center" as const };

    return (
        <View testID={testID} style={{ flex: 1, backgroundColor: theme.messages.background }} onLayout={handleLayout}>
            <ScrollView style={{ flex: 1 }} onScroll={handleScroll} contentContainerStyle={{ height: layout.height }}>
                {rows.map((row) => {
                    if (row.kind === "emotes") {
                        return (
                            <View key={row.key} style={{ position: "absolute", left: 0, top: row.y, width: size.width, height: row.height }}>
                                {row.items.map((item) => (
                                    <EmoteCell
                                        key={`${item.emote.provider}:${item.emote.name}`}
                                        item={item}
                                        top={row.paddingTop + row.lineHeight - item.height}
                                        tooltipOwner={tooltipOwner}
                                        tooltipText={tooltipText}
                                        onPick={onPick}
                                    />
                                ))}
                            </View>
                        );
                    }
                    const color = row.kind === "title" ? theme.messages.text : theme.messages.system;
                    return (
                        <View
                            key={row.key}
                            style={{ position: "absolute", left: 0, top: row.y, width: size.width, height: row.height, justifyContent: "center", alignItems: "center" }}
                        >
                            <Text style={{ ...textStyle, color }}>{row.text}</Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}
