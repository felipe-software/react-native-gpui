import { useState } from "react";
import { NativeClipboard, Svg, View } from "react-native-gpui";
import { ICONS } from "../icons";

type Props = { text: string; label: string; testID: string; color: string };

export function CopyButton({ text, label, testID, color }: Props) {
    const [hovered, setHovered] = useState(false);
    return (
        <View
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center", opacity: hovered ? 1 : 0.15 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => NativeClipboard.setString(text)}
        >
            <Svg name={ICONS.copy} style={{ width: 12, height: 12, color }} />
        </View>
    );
}
