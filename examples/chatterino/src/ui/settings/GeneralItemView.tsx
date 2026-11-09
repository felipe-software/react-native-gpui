import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { ColorButton } from "./ColorButton";
import { FontSettingWidget } from "./FontSettingWidget";
import { unsupportedTooltip } from "./generalHelpers";
import type { GeneralItem, SettingsAccess } from "./generalTypes";
import { RichText } from "./RichText";
import { SCheckBox } from "./SCheckBox";
import { SComboBox } from "./SComboBox";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE, SETTINGS_SUBTITLE_SIZE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { SpinBox } from "./SpinBox";
import { SPushButton } from "./SPushButton";
import { useSettingsTooltip } from "./useSettingsTooltip";

type Props = { item: Exclude<GeneralItem, { kind: "title" }>; access: SettingsAccess };

const FORM_GAP = 6;

export function GeneralItemView({ item, access }: Props) {
    const { fonts } = useApp();
    const tooltipText = "tooltip" in item || "unsupported" in item ? unsupportedTooltip(item.tooltip, item.unsupported) : undefined;
    const labelHover = useSettingsTooltip(tooltipText);
    const label = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    const testID = `setting-${item.id}`;

    switch (item.kind) {
        case "subtitle":
            return (
                <Text style={{ ...label, color: SETTINGS_STYLE.accent, fontSize: SETTINGS_SUBTITLE_SIZE, fontWeight: "300", marginTop: 2 }}>
                    {`${item.text}:`}
                </Text>
            );
        case "description":
            return (
                <View style={{ paddingVertical: 1 }}>
                    <RichText testID={testID} text={item.text} links={item.links} color={item.color} onOpen={access.openUrl} />
                </View>
            );
        case "separator":
            return <View style={{ height: 1, backgroundColor: "#3a3a3a", marginVertical: 8 }} />;
        case "checkbox":
            return (
                <View style={{ paddingVertical: 0 }}>
                    {item.description ? (
                        <View style={{ paddingLeft: 10 }}>
                            <RichText
                                text={item.description}
                                links={[{ label: "pr.alejo.io", url: "https://pr.alejo.io" }]}
                                onOpen={access.openUrl}
                            />
                        </View>
                    ) : null}
                    <SCheckBox
                        testID={testID}
                        label={item.label}
                        checked={item.get(access)}
                        tooltip={tooltipText}
                        greyable={false}
                        disabled={item.enabled ? !item.enabled(access) : false}
                        onChange={(value) => item.set(access, value)}
                    />
                </View>
            );
        case "dropdown": {
            const inForm = item.labelWidth !== undefined;
            return (
                <View style={{ height: 31, flexDirection: "row", alignItems: "center", gap: inForm ? FORM_GAP : 0 }}>
                    <View style={inForm ? { width: item.labelWidth } : { flex: 1 }} {...labelHover}>
                        <Text style={label}>{`${item.label}:`}</Text>
                    </View>
                    <SComboBox
                        testID={testID}
                        value={item.get(access)}
                        options={item.options}
                        placeholder={item.placeholder}
                        width={item.width}
                        grow={inForm}
                        tooltip={tooltipText}
                        greyable={false}
                        disabled={item.enabled ? !item.enabled(access) : false}
                        onChange={(value) => item.set(access, value)}
                    />
                </View>
            );
        }
        case "intInput":
            return (
                <View style={{ height: 27, flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }} {...labelHover}>
                        <Text style={label}>{`${item.label}:`}</Text>
                    </View>
                    <SpinBox
                        testID={testID}
                        value={item.get(access)}
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        suffix={item.suffix}
                        width={84}
                        onChange={(value) => item.set(access, value)}
                    />
                </View>
            );
        case "lineEdit":
            return (
                <View style={{ height: 29, flexDirection: "row", alignItems: "center", gap: FORM_GAP }} {...labelHover}>
                    <Text style={{ ...label, width: item.labelWidth }}>{`${item.label}:`}</Text>
                    <SLineEdit
                        testID={testID}
                        value={item.get(access)}
                        placeholder={item.placeholder}
                        grow
                        disabled={item.enabled ? !item.enabled(access) : false}
                        onChange={(value) => item.set(access, value)}
                    />
                </View>
            );
        case "color":
            return (
                <View style={{ height: 31, flexDirection: "row", alignItems: "center" }} {...labelHover}>
                    <Text style={{ ...label, flex: 1 }}>{`${item.label}:`}</Text>
                    <ColorButton testID={testID} color={item.get(access)} onChange={(value) => item.set(access, value)} />
                </View>
            );
        case "font":
            return <FontSettingWidget testID={testID} />;
        case "buttons":
            return (
                <View style={{ flexDirection: "row", gap: 8, paddingVertical: 3 }}>
                    {item.buttons.map((button) => (
                        <SPushButton
                            key={button.id}
                            testID={`setting-${button.id}`}
                            label={button.label}
                            minWidth={0}
                            tooltip={unsupportedTooltip(undefined, item.unsupported)}
                            onPress={() => button.onPress(access)}
                        />
                    ))}
                </View>
            );
    }
}
