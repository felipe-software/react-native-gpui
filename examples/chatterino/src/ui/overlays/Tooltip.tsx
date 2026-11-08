import { Image, Text, View, useWindowDimensions } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import type { TooltipSpec } from "../state/overlays";

const CHAR_WIDTH = 7.6;
const LINE_HEIGHT = 16;
const PADDING_X = 10;
const PADDING_Y = 5;
const IMAGE_GAP = 6;
const MAX_TEXT_WIDTH = 380;
const CURSOR_OFFSET = 16;
const IMAGE_SCALE = 4;

function imageSize(spec: TooltipSpec): { width: number; height: number } {
    if (!spec.image) return { width: 0, height: 0 };
    return { width: Math.round(spec.anchor.width * IMAGE_SCALE), height: Math.round(spec.anchor.height * IMAGE_SCALE) };
}

export function Tooltip({ spec }: { spec: TooltipSpec }) {
    const { fonts } = useApp();
    const screen = useWindowDimensions();
    const lines = spec.text.split("\n");
    const longest = lines.reduce((widest, line) => Math.max(widest, line.length), 0);
    const image = imageSize(spec);
    const textWidth = Math.min(MAX_TEXT_WIDTH, Math.ceil(longest * CHAR_WIDTH));
    const width = Math.max(textWidth, image.width) + PADDING_X * 2;
    const imageBlock = image.height > 0 ? image.height + IMAGE_GAP : 0;
    const height = imageBlock + lines.length * LINE_HEIGHT + PADDING_Y * 2;
    const below = spec.placement === "below";
    const cursor = spec.cursor ?? { x: spec.anchor.x + spec.anchor.width / 2, y: spec.anchor.y + spec.anchor.height / 2 };
    const preferredLeft = below ? spec.anchor.x + spec.anchor.width / 2 - width / 2 : cursor.x + CURSOR_OFFSET;
    const preferredTop = below ? spec.anchor.y + spec.anchor.height + 1 : cursor.y + CURSOR_OFFSET;
    const overflowsRight = preferredLeft + width > screen.width;
    const overflowsBottom = preferredTop + height > screen.height;
    const flipUp = !below && overflowsRight && overflowsBottom;
    const left = Math.max(0, Math.min(preferredLeft, screen.width - width));
    const top = flipUp ? cursor.y - height - CURSOR_OFFSET : Math.max(0, Math.min(preferredTop, screen.height - height));
    return (
        <View
            testID="tooltip"
            pointerEvents="none"
            style={{
                position: "absolute",
                left,
                top,
                width,
                paddingHorizontal: PADDING_X,
                paddingVertical: PADDING_Y,
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
            }}
        >
            {spec.image ? (
                <Image source={{ uri: spec.image }} style={{ width: image.width, height: image.height, marginBottom: IMAGE_GAP }} resizeMode="contain" />
            ) : null}
            {lines.map((line, index) => (
                <Text key={index} style={{ color: "#ffffff", fontFamily: fonts.appFamily, fontSize: fonts.appSize, textAlign: "center" }}>
                    {line}
                </Text>
            ))}
        </View>
    );
}
