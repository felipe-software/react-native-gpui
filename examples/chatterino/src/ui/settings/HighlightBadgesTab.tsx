import { View } from "react-native-gpui";
import type { HighlightBadge } from "../../data/api";
import { useApp } from "../state/AppContext";
import { BadgePickerContent } from "./BadgePickerContent";
import { EditableModelView } from "./EditableModelView";
import { fileName, HIGHLIGHT_LABELS, newHighlightBadge } from "./highlightRows";
import { useSettingsUi } from "./SettingsContext";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export function HighlightBadgesTab() {
    const { settings } = useApp();
    const ui = useSettingsUi();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const badges = settings.highlightBadges;
    const selfColor = settings.selfHighlightColor || "#7f3f497f";
    const setBadge = (index: number, patch: Partial<HighlightBadge>) =>
        update({ highlightBadges: badges.map((badge, position) => (position === index ? { ...badge, ...patch } : badge)) });
    const flag = (title: string, key: "showInMentions" | "alert" | "playSound", width: number): TableColumn<HighlightBadge> => ({
        title,
        kind: "check",
        width,
        checked: (row) => row[key],
        toggle: (row, value) => ({ ...row, [key]: value }),
    });
    const columns: TableColumn<HighlightBadge>[] = [
        { title: "Name", kind: "action", text: (row) => row.displayName },
        flag("Show In\nMentions", "showInMentions", 76),
        flag("Flash\ntaskbar", "alert", 64),
        flag("Play\nsound", "playSound", 52),
        {
            title: "Custom\nsound",
            kind: "action",
            width: 64,
            text: (row) => fileName(row.soundUrl),
            onActivate: (_row, index) => actions.pickSound((path) => setBadge(index, { soundUrl: path })),
        },
        {
            title: "Color",
            kind: "color",
            width: 46,
            color: (row) => row.color ?? selfColor,
            onActivate: (row, index) => actions.pickColor(row.color, (color) => setBadge(index, { color })),
        },
    ];

    const add = () =>
        ui.openPopup({
            kind: "modal",
            title: "Choose badge",
            width: 300,
            height: 360,
            render: (close) => (
                <BadgePickerContent
                    onPick={(badge) => {
                        update({ highlightBadges: [...badges, newHighlightBadge(badge, selfColor)] });
                        close();
                    }}
                    onCancel={close}
                />
            ),
        });

    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text={HIGHLIGHT_LABELS.badges} greyable={false} />
            <EditableModelView testID="highlight-badges" columns={columns} rows={badges} onAdd={add} onChange={(next) => update({ highlightBadges: next })} />
        </View>
    );
}
