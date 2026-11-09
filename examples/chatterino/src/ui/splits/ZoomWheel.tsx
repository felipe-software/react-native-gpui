import { useRef, useState } from "react";
import { ScrollView, View, type LayoutChangeEvent, type ScrollViewHandle } from "react-native-gpui";
import type { ZoomDirection } from "../zoom";

type Props = { testID: string; onZoom: (direction: ZoomDirection) => void };

type ScrollEvent = { nativeEvent?: { contentOffset?: { y?: number } } };

export function ZoomWheel({ testID, onZoom }: Props) {
    const scroller = useRef<ScrollViewHandle>(null);
    const [middle, setMiddle] = useState(0);

    const recenter = (offset: number) => scroller.current?.scrollTo({ y: offset, animated: false });

    const handleLayout = (event: LayoutChangeEvent) => {
        const height = Math.round(event.nativeEvent.layout.height);
        setMiddle(height);
        setTimeout(() => recenter(height), 0);
    };

    const handleScroll = (event: unknown) => {
        const offset = (event as ScrollEvent).nativeEvent?.contentOffset?.y ?? middle;
        const delta = offset - middle;
        if (middle === 0 || Math.abs(delta) < 1) return;
        onZoom(delta < 0 ? "in" : "out");
        recenter(middle);
    };

    return (
        <View testID={testID} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 15 }} onLayout={handleLayout}>
            <ScrollView ref={scroller} style={{ flex: 1 }} showsVerticalScrollIndicator={false} onScroll={handleScroll}>
                <View style={{ height: Math.max(middle * 3, 300) }} />
            </ScrollView>
        </View>
    );
}
