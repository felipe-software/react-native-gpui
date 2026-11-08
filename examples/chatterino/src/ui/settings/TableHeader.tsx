import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = { first: string; columns: string[]; columnWidth: number; extra?: string };

export function TableHeader({ first, columns, columnWidth, extra }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const style = { color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 2, textAlign: "center" as const };
    return (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, paddingBottom: 4, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ ...style, flex: 1, textAlign: "left" }}>{first}</Text>
            {columns.map((column) => (
                <Text key={column} style={{ ...style, width: columnWidth }}>
                    {column}
                </Text>
            ))}
            {extra ? <Text style={{ ...style, width: 90 }}>{extra}</Text> : null}
            <View style={{ width: 22 }} />
        </View>
    );
}
