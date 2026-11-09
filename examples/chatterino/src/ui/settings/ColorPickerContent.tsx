import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { HIGHLIGHT_COLOR_PRESETS } from "../../data/filters/highlights";
import { formatColor, parseColor, type Rgba } from "../../data/util/colors";
import { PushButton } from "../common/PushButton";
import { useApp } from "../state/AppContext";
import { ColorGrid } from "./ColorGrid";
import { ColorSwatch } from "./ColorSwatch";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { SpinBox } from "./SpinBox";

type Props = { initial: string | undefined; recent: string[]; onAccept: (color: string) => void; onCancel: () => void };

type Hsv = { h: number; s: number; v: number };

const SB_CELLS = 12;
const SB_SIZE = 156;
const HUE_CELLS = 24;
const ALPHA_CELLS = 16;

function toHsv({ r, g, b }: Rgba): Hsv {
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const delta = max - min;
    let h = 0;
    if (delta > 0) {
        if (max === r / 255) h = ((g - b) / 255 / delta) % 6;
        else if (max === g / 255) h = (b - r) / 255 / delta + 2;
        else h = (r - g) / 255 / delta + 4;
    }
    return { h: ((h * 60) + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function fromHsv({ h, s, v }: Hsv, a: number): Rgba {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const sector = Math.floor(h / 60) % 6;
    const table: Array<[number, number, number]> = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ];
    const [r, g, b] = table[sector];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a };
}

function argbHex(color: Rgba): string {
    const byte = (value: number) => value.toString(16).padStart(2, "0");
    return `#${byte(color.a)}${byte(color.r)}${byte(color.g)}${byte(color.b)}`;
}

function parseArgbHex(text: string): Rgba | undefined {
    const match = /^#?([0-9a-f]{8}|[0-9a-f]{6})$/i.exec(text.trim());
    if (!match) return undefined;
    const raw = match[1];
    if (raw.length === 6) return parseColor(`#${raw}`);
    return parseColor(`#${raw.slice(2)}${raw.slice(0, 2)}`);
}

export function ColorPickerContent({ initial, recent, onAccept, onCancel }: Props) {
    const { fonts } = useApp();
    const [color, setColor] = useState<Rgba>(() => parseColor(initial) ?? { r: 127, g: 63, b: 73, a: 127 });
    const [hex, setHex] = useState(() => argbHex(color));
    const hsv = toHsv(color);
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };

    const apply = (next: Rgba) => {
        setColor(next);
        setHex(argbHex(next));
    };
    const pick = (value: string) => {
        const parsed = parseColor(value);
        if (parsed) apply(parsed);
    };
    const component = (key: keyof Rgba, value: number) => apply({ ...color, [key]: value });
    const sbStep = SB_SIZE / SB_CELLS;
    const sbCells: Array<{ key: string; s: number; v: number }> = [];
    for (let row = 0; row < SB_CELLS; row++) {
        for (let column = 0; column < SB_CELLS; column++) {
            sbCells.push({ key: `${row}-${column}`, s: column / (SB_CELLS - 1), v: 1 - row / (SB_CELLS - 1) });
        }
    }

    return (
        <View style={{ flex: 1, padding: 10 }}>
            <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
                <View style={{ gap: 6 }}>
                    <Text style={label}>Recently used</Text>
                    <ColorGrid colors={recent.slice(0, 10)} onPick={pick} />
                    <View style={{ height: 6 }} />
                    <Text style={label}>Default colors</Text>
                    <ColorGrid colors={HIGHLIGHT_COLOR_PRESETS} onPick={pick} />
                    <View style={{ flex: 1 }} />
                    <Text style={label}>Selected</Text>
                    <View style={{ borderWidth: 1, borderColor: "#000000", alignSelf: "flex-start" }}>
                        <ColorSwatch color={formatColor(color)} width={60} height={24} />
                    </View>
                </View>
                <View style={{ gap: 8 }}>
                    <View style={{ width: SB_SIZE, height: SB_SIZE, flexDirection: "row", flexWrap: "wrap" }}>
                        {sbCells.map((cell) => (
                            <View
                                key={cell.key}
                                style={{ width: sbStep, height: sbStep, backgroundColor: formatColor(fromHsv({ h: hsv.h, s: cell.s, v: cell.v }, 255)) }}
                                onClick={() => apply(fromHsv({ h: hsv.h, s: cell.s, v: cell.v }, color.a))}
                            />
                        ))}
                    </View>
                    <View style={{ width: SB_SIZE, height: 14, flexDirection: "row" }}>
                        {Array.from({ length: HUE_CELLS }, (_, index) => {
                            const hue = (index * 360) / HUE_CELLS;
                            return (
                                <View
                                    key={hue}
                                    style={{ flex: 1, backgroundColor: formatColor(fromHsv({ h: hue, s: 1, v: 1 }, 255)) }}
                                    onClick={() => apply(fromHsv({ h: hue, s: Math.max(hsv.s, 0.05), v: Math.max(hsv.v, 0.05) }, color.a))}
                                />
                            );
                        })}
                    </View>
                    <View style={{ width: SB_SIZE, height: 14, flexDirection: "row" }}>
                        {Array.from({ length: ALPHA_CELLS }, (_, index) => {
                            const alpha = Math.round((index * 255) / (ALPHA_CELLS - 1));
                            return (
                                <View
                                    key={alpha}
                                    style={{ flex: 1, backgroundColor: formatColor({ ...color, a: alpha }) }}
                                    onClick={() => component("a", alpha)}
                                />
                            );
                        })}
                    </View>
                    {(["r", "g", "b", "a"] as const).map((key) => (
                        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ ...label, width: 60 }}>{{ r: "Red:", g: "Green:", b: "Blue:", a: "Alpha:" }[key]}</Text>
                            <SpinBox testID={`color-${key}`} value={color[key]} min={0} max={255} width={90} onChange={(value) => component(key, value)} />
                        </View>
                    ))}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ ...label, width: 60 }}>Hex:</Text>
                        <SLineEdit
                            testID="color-hex"
                            value={hex}
                            width={90}
                            onChange={(text) => {
                                setHex(text);
                                const parsed = parseArgbHex(text);
                                if (parsed) setColor(parsed);
                            }}
                        />
                    </View>
                </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                <PushButton testID="color-ok" label="OK" primary onPress={() => onAccept(formatColor(color))} />
                <PushButton testID="color-cancel" label="Cancel" onPress={onCancel} />
            </View>
        </View>
    );
}
