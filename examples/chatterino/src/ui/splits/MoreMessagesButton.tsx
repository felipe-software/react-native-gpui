import { Text, View } from "react-native-gpui";
import type { Fonts } from "../fonts";
import type { Theme } from "../theme";

type Props = { theme: Theme; fonts: Fonts; testID: string; onPress: () => void };

export function MoreMessagesButton({ theme, fonts, testID, onPress }: Props) {
    return (
        <View
            testID={testID}
            style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 26,
                backgroundColor: theme.moreMessages.background,
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
            }}
            onClick={onPress}
        >
            <Text style={{ color: theme.moreMessages.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>More messages below</Text>
        </View>
    );
}
