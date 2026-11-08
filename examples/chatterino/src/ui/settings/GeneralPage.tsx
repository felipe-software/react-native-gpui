import { Text, View } from "react-native-gpui";
import type { Settings, ThemeName } from "../../data/api";
import { Checkbox } from "../common/Checkbox";
import { SelectBox, type SelectOption } from "../common/SelectBox";
import { FONT_FAMILIES } from "../fonts";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { NumberField } from "./NumberField";
import { SettingRow } from "./SettingRow";
import { SettingsTitle } from "./SettingsTitle";
import { useSettingsUpdate } from "./useSettingsUpdate";

const THEMES: SelectOption<ThemeName>[] = [
    { value: "white", label: "White" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "black", label: "Black" },
];

const TIMESTAMP_FORMATS = [
    "h:mm",
    "hh:mm",
    "h:mm a",
    "hh:mm a",
    "h:mm:ss",
    "hh:mm:ss",
    "h:mm:ss a",
    "hh:mm:ss a",
    "h:mm:ss.zzz",
    "h:mm:ss.zzz a",
    "hh:mm:ss.zzz",
    "hh:mm:ss.zzz a",
];
const DISABLED = "Disable";

const EMOTE_SCALES: SelectOption<number>[] = [0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => ({
    value,
    label: value === 1 ? "Default" : `${value}x`,
}));

const FONT_SIZES: SelectOption<number>[] = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((value) => ({ value, label: `${value} pt` }));

const STREAMER_MODES: SelectOption<Settings["streamerMode"]>[] = [
    { value: "off", label: "Disabled" },
    { value: "on", label: "Enabled" },
    { value: "auto", label: "Automatic (Detect streaming software)" },
];

const PAUSE_OPTIONS: SelectOption<"off" | "on">[] = [
    { value: "off", label: "Disabled" },
    { value: "on", label: "Indefinite" },
];

export function GeneralPage() {
    const { settings, prefs, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const { update, updatePrefs } = useSettingsUpdate();
    const fontFamily = settings.fontFamily ?? fonts.chatFamily;
    const families = FONT_FAMILIES.includes(fontFamily) ? FONT_FAMILIES : [fontFamily, ...FONT_FAMILIES];
    const timestampValue = settings.showTimestamps ? settings.timestampFormat : DISABLED;
    const timestampOptions = [DISABLED, ...TIMESTAMP_FORMATS].map((value) => ({ value, label: value }));
    const description = { color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1 };

    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Interface" />
            <SettingRow label="Theme:">
                <SelectBox testID="setting-theme" value={settings.theme} options={THEMES} onChange={(value) => update({ theme: value })} />
            </SettingRow>
            <SettingRow label="Font:">
                <View style={{ flexDirection: "row", gap: 6 }}>
                    <SelectBox
                        testID="setting-font-family"
                        value={fontFamily}
                        options={families.map((value) => ({ value, label: value }))}
                        width={150}
                        onChange={(value) => update({ fontFamily: value })}
                    />
                    <SelectBox testID="setting-font-size" value={settings.fontSize} options={FONT_SIZES} width={80} onChange={(value) => update({ fontSize: value })} />
                </View>
            </SettingRow>
            <Checkbox
                testID="setting-tab-close"
                label="Show tab close button"
                checked={prefs.showTabCloseButton}
                onChange={(value) => updatePrefs({ showTabCloseButton: value })}
            />
            <Checkbox
                testID="setting-tab-live"
                label="Mark tabs with live channels"
                checked={prefs.showTabLive}
                onChange={(value) => updatePrefs({ showTabLive: value })}
            />

            <SettingsTitle text="Chat" />
            <SettingRow label="Pause on mouse hover:">
                <SelectBox
                    testID="setting-pause"
                    value={settings.pauseChatOnHover ? "on" : "off"}
                    options={PAUSE_OPTIONS}
                    onChange={(value) => update({ pauseChatOnHover: value === "on" })}
                />
            </SettingRow>
            <Checkbox
                testID="setting-message-length"
                label="Show message length while typing"
                checked={prefs.showMessageLength}
                onChange={(value) => updatePrefs({ showMessageLength: value })}
            />

            <SettingsTitle text="Messages" />
            <Checkbox
                testID="setting-separators"
                label="Separate with lines"
                checked={settings.showMessageSeparators}
                onChange={(value) => update({ showMessageSeparators: value })}
            />
            <Checkbox
                testID="setting-alternate"
                label="Alternate background color"
                checked={settings.alternateMessageBackground}
                onChange={(value) => update({ alternateMessageBackground: value })}
            />
            <Checkbox
                testID="setting-fade-history"
                label="Reduce opacity of message history"
                checked={prefs.fadeMessageHistory}
                onChange={(value) => updatePrefs({ fadeMessageHistory: value })}
            />
            <Checkbox
                testID="setting-hide-deleted"
                label="Hide deleted messages"
                checked={!settings.showDeletedMessages}
                onChange={(value) => update({ showDeletedMessages: !value })}
            />
            <SettingRow label="Message timestamp format:" description="a = am/pm, zzz = milliseconds">
                <SelectBox
                    testID="setting-timestamps"
                    value={timestampValue}
                    options={timestampOptions}
                    onChange={(value) =>
                        value === DISABLED ? update({ showTimestamps: false }) : update({ showTimestamps: true, timestampFormat: value })
                    }
                />
            </SettingRow>

            <SettingsTitle text="Emotes" />
            <Checkbox testID="setting-animate" label="Animate" checked={settings.animateEmotes} onChange={(value) => update({ animateEmotes: value })} />
            <SettingRow label="Size:">
                <SelectBox testID="setting-emote-scale" value={settings.emoteScale} options={EMOTE_SCALES} onChange={(value) => update({ emoteScale: value })} />
            </SettingRow>

            <SettingsTitle text="Streamer Mode" />
            <Text style={description}>
                {"Chatterino can automatically change behavior if it detects that any streaming software is running.\nSelect which things you want to change while streaming"}
            </Text>
            <SettingRow label="Enable Streamer Mode:">
                <SelectBox
                    testID="setting-streamer-mode"
                    value={settings.streamerMode}
                    options={STREAMER_MODES}
                    width={260}
                    onChange={(value) => update({ streamerMode: value })}
                />
            </SettingRow>

            <SettingsTitle text="Advanced" />
            <SettingsTitle text="Visible badges" subtitle />
            <Checkbox testID="setting-badges" label="Show badges" checked={settings.showBadges} onChange={(value) => update({ showBadges: value })} />
            <SettingsTitle text="Message history" subtitle />
            <Checkbox
                testID="setting-load-history"
                label="Load message history on connect"
                checked={settings.loadHistoryOnJoin}
                onChange={(value) => update({ loadHistoryOnJoin: value })}
            />
            <SettingRow label="Max number of history messages to load on connect:">
                <NumberField testID="setting-history-limit" value={settings.historyLimit} min={10} max={800} onChange={(value) => update({ historyLimit: value })} />
            </SettingRow>
            <SettingRow label="Split message scrollback limit:">
                <NumberField testID="setting-message-limit" value={settings.messageLimit} min={100} max={10000} onChange={(value) => update({ messageLimit: value })} />
            </SettingRow>
        </View>
    );
}
