import { Text, View } from "react-native-gpui";
import type { Fonts } from "../fonts";
import type { Theme } from "../theme";

const HINT = "After adding, drag a split by its header to move it.";

type Props = { theme: Theme; fonts: Fonts; manyTabs: boolean; testID: string; onPress: () => void };

export function EmptyPage({ theme, fonts, manyTabs, testID, onPress }: Props) {
    return (
        <View
            testID={testID}
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.splits.background,
                alignItems: "center",
                justifyContent: "center",
            }}
            onClick={onPress}
        >
            <Text style={{ color: theme.header.text, fontFamily: fonts.chatFamily, fontSize: fonts.chatSize }}>Click to add a split</Text>
            {manyTabs ? (
                <Text style={{ marginTop: 32, color: theme.header.text, fontFamily: fonts.chatFamily, fontSize: fonts.chatSize }}>{HINT}</Text>
            ) : null}
            <View style={{ position: "absolute", left: 0, top: 0, right: 0, height: 1, backgroundColor: theme.tabs.selected.background }} />
        </View>
    );
}
