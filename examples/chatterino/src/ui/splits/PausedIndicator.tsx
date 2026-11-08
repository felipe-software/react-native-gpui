import { Text, View } from "react-native-gpui";

const BAR = { width: 5, height: 20, backgroundColor: "rgb(180, 180, 180)" } as const;

export function PausedIndicator() {
    return (
        <View
            testID="paused-indicator"
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 8,
                height: 32,
                backgroundColor: "rgba(0, 0, 0, 0.784)",
            }}
        >
            <View style={BAR} />
            <View style={BAR} />
            <Text style={{ marginLeft: 6, color: "rgb(180, 180, 180)", fontSize: 20 }}>Paused</Text>
        </View>
    );
}
