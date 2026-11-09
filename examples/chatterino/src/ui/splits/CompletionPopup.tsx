import { Image, Text, View } from "react-native-gpui";
import type { Fonts } from "../fonts";
import type { Theme } from "../theme";

export type CompletionRow = { key: string; label: string; image?: string; insert: string };

type Props = {
    rows: CompletionRow[];
    selected: number;
    bottom: number;
    theme: Theme;
    fonts: Fonts;
    onPick: (row: CompletionRow) => void;
};

const ROW_HEIGHT = 32;
const VISIBLE_ROWS = 4;
const WIDTH = 300;
const HEIGHT = 150;
const INSET = 11;
const SELECTED = "rgba(0, 174, 239, 0.392)";
const OUTLINE = "#999999";

export function CompletionPopup({ rows, selected, bottom, theme, fonts, onPick }: Props) {
    const start = Math.max(0, Math.min(selected - VISIBLE_ROWS + 1, rows.length - VISIBLE_ROWS));
    const visible = rows.slice(start, start + VISIBLE_ROWS);
    return (
        <View
            testID="completion-popup"
            style={{
                position: "absolute",
                bottom,
                left: "50%",
                marginLeft: -WIDTH / 2,
                width: WIDTH,
                height: HEIGHT,
                padding: INSET,
                backgroundColor: theme.window.background,
                borderWidth: 1,
                borderColor: OUTLINE,
                zIndex: 20,
            }}
        >
            {visible.map((row, index) => {
                const isSelected = start + index === selected;
                return (
                    <View
                        key={row.key}
                        testID={`completion-${row.key}`}
                        accessibilityRole="menuitem"
                        accessibilityLabel={row.label}
                        accessibilityState={{ selected: isSelected }}
                        style={{
                            height: ROW_HEIGHT,
                            flexDirection: "row",
                            alignItems: "center",
                            paddingLeft: 4,
                            backgroundColor: isSelected ? SELECTED : undefined,
                        }}
                        onClick={() => onPick(row)}
                    >
                        {row.image ? <Image source={{ uri: row.image }} style={{ width: 24, height: 24, marginRight: 4 }} resizeMode="contain" /> : null}
                        <Text numberOfLines={1} style={{ color: theme.window.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>
                            {row.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}
