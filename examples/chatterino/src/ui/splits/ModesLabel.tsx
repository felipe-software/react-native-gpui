import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { effectColor } from "../colors";
import { HoverGlow } from "../common/HoverGlow";
import { useButtonEffect } from "../common/useButtonEffect";
import { useApp } from "../state/AppContext";

type Props = { splitId: string; text: string };

export function ModesLabel({ splitId, text }: Props) {
    const { theme, fonts } = useApp();
    const effect = useButtonEffect();
    const [size, setSize] = useState({ width: 0, height: 0 });
    return (
        <View
            testID={`split-modes-${splitId}`}
            style={{ paddingHorizontal: 6, justifyContent: "center" }}
            onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
            onMouseEnter={effect.enter}
            onMouseMove={effect.move}
            onMouseLeave={effect.leave}
        >
            <Text style={{ marginTop: 4, color: theme.window.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize, textAlign: "center" }}>{text}</Text>
            <HoverGlow
                width={size.width}
                height={size.height}
                color={effectColor(theme.isLight)}
                factor={effect.factor}
                pointer={effect.pointer}
                ripples={effect.ripples}
            />
        </View>
    );
}
