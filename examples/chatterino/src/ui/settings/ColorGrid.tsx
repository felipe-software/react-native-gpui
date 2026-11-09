import { View } from "react-native-gpui";
import { ColorSwatch } from "./ColorSwatch";

type Props = { colors: string[]; onPick: (color: string) => void };

export function ColorGrid({ colors, onPick }: Props) {
    return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", width: 132, gap: 4 }}>
            {colors.map((color, index) => (
                <View key={`${color}-${index}`} style={{ borderWidth: 1, borderColor: "#000000" }} onClick={() => onPick(color)}>
                    <ColorSwatch color={color} width={28} height={22} cell={7} />
                </View>
            ))}
        </View>
    );
}
