import { Svg, View } from "react-native-gpui";
import { withAlpha } from "../colors";
import type { Point, Ripple } from "./useButtonEffect";

type Props = { width: number; height: number; color: string; factor: number; pointer: Point; ripples: Ripple[] };

const EDGE_ALPHA = 40 / 255;
const CENTER_ALPHA = 50 / 255;
const SPOT_ALPHA = (CENTER_ALPHA - EDGE_ALPHA) / (1 - EDGE_ALPHA);
const RIPPLE_ALPHA = 95 / 255;

const SPOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="${SPOT_ALPHA.toFixed(4)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/></svg>`;

export function HoverGlow({ width, height, color, factor, pointer, ripples }: Props) {
    if (factor <= 0 && ripples.length === 0) return null;
    const radius = width / 2;
    return (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden" }}>
            {factor > 0 ? (
                <>
                    <View style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: withAlpha(color, EDGE_ALPHA * factor) }} />
                    <View style={{ position: "absolute", left: pointer.x - radius, top: pointer.y - radius, opacity: factor }}>
                        <Svg name={SPOT} style={{ width: radius * 2, height: radius * 2, color }} />
                    </View>
                </>
            ) : null}
            {ripples.map((ripple) => {
                const size = ripple.progress * width * 2;
                return (
                    <View
                        key={ripple.id}
                        style={{
                            position: "absolute",
                            left: ripple.x - size,
                            top: ripple.y - size,
                            width: size * 2,
                            height: size * 2,
                            borderRadius: size,
                            backgroundColor: withAlpha(color, (1 - ripple.progress) * RIPPLE_ALPHA),
                        }}
                    />
                );
            })}
        </View>
    );
}
