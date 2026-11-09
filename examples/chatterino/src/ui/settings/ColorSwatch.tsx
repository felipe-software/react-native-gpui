import { View } from "react-native-gpui";
import { parseColor } from "../../data/util/colors";

type Props = { color: string | undefined; width: number; height: number; cell?: number };

const LIGHT = "#ffffff";
const DARK = "#c0c0c0";

function rgba(color: string | undefined): string {
    const parsed = parseColor(color);
    if (!parsed) return "rgba(0, 0, 0, 0)";
    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${(parsed.a / 255).toFixed(3)})`;
}

export function ColorSwatch({ color, width, height, cell = 8 }: Props) {
    const columns = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const cells: Array<{ key: string; left: number; top: number; dark: boolean }> = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            cells.push({ key: `${row}-${column}`, left: column * cell, top: row * cell, dark: (row + column) % 2 === 1 });
        }
    }
    return (
        <View style={{ width, height, overflow: "hidden" }}>
            {cells.map((entry) => (
                <View
                    key={entry.key}
                    style={{ position: "absolute", left: entry.left, top: entry.top, width: cell, height: cell, backgroundColor: entry.dark ? DARK : LIGHT }}
                />
            ))}
            <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: rgba(color) }} />
        </View>
    );
}
