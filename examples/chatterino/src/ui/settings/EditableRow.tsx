import { Svg, View } from "react-native-gpui";
import { ICONS } from "../icons";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

export type RowFlag = { key: string; value: boolean };

type Props = {
    testID: string;
    text: string;
    placeholder: string;
    flags: RowFlag[];
    extra?: string;
    extraPlaceholder?: string;
    columnWidth: number;
    onText: (value: string) => void;
    onFlag: (key: string, value: boolean) => void;
    onExtra?: (value: string) => void;
    onRemove: () => void;
};

export function EditableRow({ testID, text, placeholder, flags, extra, extraPlaceholder, columnWidth, onText, onFlag, onExtra, onRemove }: Props) {
    const { theme } = useApp();
    const colors = chromeColors(theme);
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 }}>
            <TextField grow testID={`${testID}-text`} value={text} placeholder={placeholder} onChange={onText} />
            {flags.map((flag) => (
                <View
                    key={flag.key}
                    testID={`${testID}-${flag.key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: flag.value }}
                    style={{ width: columnWidth, alignItems: "center" }}
                    onClick={() => onFlag(flag.key, !flag.value)}
                >
                    <View
                        style={{
                            width: 14,
                            height: 14,
                            borderWidth: 1,
                            borderColor: flag.value ? theme.accent : colors.fieldBorder,
                            backgroundColor: flag.value ? theme.accent : colors.field,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {flag.value ? <Svg name={ICONS.check} style={{ width: 12, height: 12, color: "#ffffff" }} /> : null}
                    </View>
                </View>
            ))}
            {onExtra ? (
                <TextField testID={`${testID}-extra`} value={extra ?? ""} placeholder={extraPlaceholder} width={90} onChange={onExtra} />
            ) : null}
            <View
                testID={`${testID}-remove`}
                accessibilityLabel="Remove"
                style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}
                onClick={onRemove}
            >
                <Svg name={ICONS.close} style={{ width: 14, height: 14, color: colors.text }} />
            </View>
        </View>
    );
}
