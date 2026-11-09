import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_STYLE, SETTINGS_TITLE_SIZE } from "./settingsStyle";

type Props = { text: string; spaced: boolean; testID?: string };

export function TitleLabel({ text, spaced, testID }: Props) {
    const { fonts } = useApp();
    return (
        <View testID={testID} style={{ paddingTop: spaced ? 20 : 0, paddingBottom: 2 }}>
            <Text style={{ color: SETTINGS_STYLE.accent, fontFamily: fonts.appFamily, fontSize: SETTINGS_TITLE_SIZE, fontWeight: "300" }}>{`${text}:`}</Text>
        </View>
    );
}
