import type { RefObject } from "react";
import { ScrollView, Text, View, type ScrollViewHandle } from "../../src/index";
import { COLORS, log } from "./shared";

export function ListWindowContent({ listRef, count, rows }: { listRef: RefObject<ScrollViewHandle | null>; count: number; rows: number }) {
    return (
        <View testID="list-window-root" style={{ flex: 1, backgroundColor: COLORS.page }}>
            <Text testID="list-window-count" style={{ color: COLORS.text, fontSize: 13, padding: 6 }}>{`list window count: ${count}`}</Text>
            <ScrollView ref={listRef} testID="window-list" style={{ flex: 1, backgroundColor: COLORS.list }}>
                {Array.from({ length: rows }, (_, index) => (
                    <View
                        key={index}
                        testID={`row-${index}`}
                        style={{ height: 28, justifyContent: "center", paddingLeft: 8 }}
                        onMouseMove={(event) => log("rowMove", { index, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
                        onMouseDown={(event) => log("rowDown", { index, ctrlKey: event.nativeEvent.ctrlKey, shiftKey: event.nativeEvent.shiftKey })}
                    >
                        <Text style={{ color: COLORS.row, fontSize: 13 }}>{`row number ${index}`}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
