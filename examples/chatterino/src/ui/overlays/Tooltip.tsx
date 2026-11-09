import { Image, Text, View, useWindowDimensions } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import type { TooltipBlock, TooltipSpec } from "../state/overlays";

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

function blocksOf(spec: TooltipSpec): TooltipBlock[] {
    if (spec.blocks) return spec.blocks;
    const blocks: TooltipBlock[] = [];
    const image = imageSize(spec);
    if (spec.image) blocks.push({ kind: "image", url: spec.image, width: image.width, height: image.height });
    for (const line of spec.text.split("\n")) blocks.push({ kind: "text", text: line });
    return blocks;
}

const MAX_LINE_CHARS = Math.floor(MAX_TEXT_WIDTH / CHAR_WIDTH);

export function wrapTooltipText(text: string, maxChars = MAX_LINE_CHARS): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > maxChars && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    lines.push(line);
    return lines;
}

function textWidth(block: TooltipBlock): number {
    if (block.kind === "image") return block.width;
    const longest = wrapTooltipText(block.text).reduce((widest, line) => Math.max(widest, line.length), 0);
    return Math.min(MAX_TEXT_WIDTH, Math.ceil(longest * CHAR_WIDTH));
}

function blockHeight(block: TooltipBlock): number {
    if (block.kind === "image") return block.height + IMAGE_GAP;
    return wrapTooltipText(block.text).length * LINE_HEIGHT;
}

export function Tooltip({ spec }: { spec: TooltipSpec }) {
    const { fonts } = useApp();
    const screen = useWindowDimensions();
    const blocks = blocksOf(spec);
    const contentWidth = blocks.reduce((widest, block) => Math.max(widest, textWidth(block)), 0);
    const width = contentWidth + PADDING_X * 2;
    const height = blocks.reduce((sum, block) => sum + blockHeight(block), 0) + PADDING_Y * 2;
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
            {blocks.map((block, index) =>
                block.kind === "image" ? (
                    <Image
                        key={index}
                        testID="tooltip-image"
                        source={{ uri: block.url }}
                        style={{ width: block.width, height: block.height, marginBottom: IMAGE_GAP }}
                        resizeMode="contain"
                    />
                ) : (
                    wrapTooltipText(block.text).map((line, lineIndex) => (
                        <Text key={`${index}-${lineIndex}`} style={{ color: "#ffffff", fontFamily: fonts.appFamily, fontSize: fonts.appSize, textAlign: "center" }}>
                            {line || " "}
                        </Text>
                    ))
                ),
            )}
        </View>
    );
}
