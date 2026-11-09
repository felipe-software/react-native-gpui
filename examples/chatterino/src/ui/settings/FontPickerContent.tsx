import { useState } from "react";
import { ScrollView, Text, View } from "react-native-gpui";
import { FONT_FAMILIES } from "../fonts";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { SPushButton } from "./SPushButton";

export type FontChoice = { family: string; size: number; weight: number };

type Props = { initial: FontChoice; onApply: (choice: FontChoice) => void; onClose: () => void };

const SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const WEIGHTS: Array<[number, string]> = [
    [100, "Thin"],
    [200, "ExtraLight"],
    [300, "Light"],
    [400, "Normal"],
    [500, "Medium"],
    [600, "DemiBold"],
    [700, "Bold"],
    [800, "ExtraBold"],
    [900, "Black"],
];
const PREVIEW = "The quick brown fox jumps over the lazy dog";
const ROW = 22;

export function FontPickerContent({ initial, onApply, onClose }: Props) {
    const { fonts } = useApp();
    const [choice, setChoice] = useState(initial);
    const [search, setSearch] = useState("");
    const [sizeText, setSizeText] = useState(String(initial.size));
    const families = FONT_FAMILIES.includes(initial.family) ? FONT_FAMILIES : [initial.family, ...FONT_FAMILIES];
    const shownFamilies = families.filter((family) => family.toLowerCase().includes(search.trim().toLowerCase()));
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    const listBox = { flex: 1, borderWidth: 1, borderColor: SETTINGS_STYLE.tableBorder, backgroundColor: SETTINGS_STYLE.tableBackground };
    const row = (selected: boolean) => ({ height: ROW, justifyContent: "center" as const, paddingHorizontal: 4, backgroundColor: selected ? SETTINGS_STYLE.tableSelection : undefined });

    return (
        <View style={{ flex: 1, padding: 10, gap: 8 }}>
            <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 2, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={text}>Font</Text>
                        <SLineEdit testID="font-search" value={search} placeholder="Search..." grow onChange={setSearch} />
                    </View>
                    <ScrollView style={listBox}>
                        {shownFamilies.map((family) => (
                            <View key={family} testID={`font-family-${family}`} style={row(family === choice.family)} onClick={() => setChoice({ ...choice, family })}>
                                <Text style={text}>{family}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={text}>Size</Text>
                        <SLineEdit
                            testID="font-size"
                            value={sizeText}
                            grow
                            onChange={(value) => {
                                setSizeText(value);
                                const parsed = Number.parseInt(value, 10);
                                if (Number.isFinite(parsed) && parsed > 0 && parsed < 200) setChoice({ ...choice, size: parsed });
                            }}
                        />
                    </View>
                    <ScrollView style={listBox}>
                        {SIZES.map((size) => (
                            <View
                                key={size}
                                style={row(size === choice.size)}
                                onClick={() => {
                                    setSizeText(String(size));
                                    setChoice({ ...choice, size });
                                }}
                            >
                                <Text style={text}>{size}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ height: 24, justifyContent: "center" }}>
                        <Text style={text}>Weight</Text>
                    </View>
                    <ScrollView style={listBox}>
                        {WEIGHTS.map(([weight, name]) => (
                            <View key={weight} style={row(weight === choice.weight)} onClick={() => setChoice({ ...choice, weight })}>
                                <Text style={text}>{name}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
            <Text style={text}>Preview</Text>
            <View style={{ height: 48, justifyContent: "center", paddingHorizontal: 6, backgroundColor: "#191919", borderWidth: 1, borderColor: SETTINGS_STYLE.tableBorder }}>
                <Text style={{ color: "#ffffff", fontFamily: choice.family, fontSize: Math.round((choice.size * 96) / 72), fontWeight: String(choice.weight) as "400" }}>{PREVIEW}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                <SPushButton testID="font-apply" label="Apply" onPress={() => onApply(choice)} />
                <SPushButton
                    testID="font-ok"
                    label="Ok"
                    primary
                    onPress={() => {
                        onApply(choice);
                        onClose();
                    }}
                />
                <SPushButton testID="font-cancel" label="Cancel" onPress={onClose} />
            </View>
        </View>
    );
}
