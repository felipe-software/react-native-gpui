import { useState } from "react";
import { Text, TextInput, View, useWindowDimensions, useWindowFocused } from "../../src/index";
import { FixtureButton } from "./FixtureButton";
import { COLORS } from "./shared";

export function DialogContent({ count, text, onIncrement, onText, onClose }: {
    count: number;
    text: string;
    onIncrement: () => void;
    onText: (value: string) => void;
    onClose: () => void;
}) {
    const size = useWindowDimensions();
    const focused = useWindowFocused();
    const [note, setNote] = useState("");
    return (
        <View testID="dialog-root" style={{ flex: 1, backgroundColor: COLORS.page, padding: 12 }}>
            <View testID="dialog-box" style={{ width: 120, height: 40, backgroundColor: COLORS.dialog, marginBottom: 8 }} />
            <Text testID="dialog-count" style={{ color: COLORS.text, fontSize: 13 }}>{`dialog count: ${count}`}</Text>
            <Text testID="dialog-size" style={{ color: COLORS.text, fontSize: 13 }}>{`dialog size: ${size.width}x${size.height} focused=${focused}`}</Text>
            <TextInput
                testID="dialog-input"
                value={text}
                onChangeText={onText}
                placeholder="type here"
                style={{ height: 28, marginVertical: 8, paddingHorizontal: 6, color: COLORS.text, backgroundColor: "#22262e" }}
            />
            <TextInput
                testID="dialog-note"
                value={note}
                onChangeText={setNote}
                placeholder="dialog-only note"
                style={{ height: 28, marginBottom: 8, paddingHorizontal: 6, color: COLORS.text, backgroundColor: "#22262e" }}
            />
            <View style={{ flexDirection: "row" }}>
                <FixtureButton testID="dialog-increment" label="Increment" onPress={onIncrement} />
                <FixtureButton testID="dialog-close" label="Close" onPress={onClose} />
            </View>
        </View>
    );
}
