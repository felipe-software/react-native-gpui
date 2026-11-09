import { Pressable, Text } from "../../src/index";
import { COLORS } from "./shared";

export function FixtureButton({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) {
    return (
        <Pressable
            testID={testID}
            onPress={onPress}
            style={{ height: 30, paddingHorizontal: 10, justifyContent: "center", backgroundColor: COLORS.button, marginRight: 8, marginBottom: 8 }}
        >
            <Text style={{ color: COLORS.text, fontSize: 13 }}>{label}</Text>
        </Pressable>
    );
}
