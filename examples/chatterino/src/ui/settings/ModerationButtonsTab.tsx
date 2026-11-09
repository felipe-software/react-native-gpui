import { Image, View } from "react-native-gpui";
import type { ModerationAction } from "../../data/api";
import { assetPath } from "../../data/assets";
import { parseModerationAction } from "../../data/twitch/moderation-actions";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { fileName } from "./highlightRows";
import { RichText } from "./RichText";
import { SETTINGS_STYLE } from "./settingsStyle";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export const MODERATION_BUTTONS_TEXT =
    'Moderation buttons can be bound to chat commands such as "/ban {user.name}", "/timeout {user.name} 1000", "/w someusername !report {user.name} was bad in channel {channel.name}" or any other custom text commands.\nFor deleting messages use /delete {msg.id}.\n\nMore information can be found here.';

export function ModerationButtonsTab() {
    const { settings, openUrl } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const list = settings.moderationActions;
    const setAction = (index: number, patch: Partial<ModerationAction>) =>
        update({ moderationActions: list.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)) });
    const columns: TableColumn<ModerationAction>[] = [
        { title: "Action", kind: "text", text: (row) => row.action, edit: (row, value) => ({ ...row, action: value }) },
        {
            title: "Icon",
            kind: "custom",
            width: 100,
            render: (row, index) => {
                const button = parseModerationAction(row);
                const label = row.iconPath ? fileName(row.iconPath) : "";
                return (
                    <View
                        testID={`moderation-icon-${index}`}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}
                        onClick={() => actions.pickImage((path) => setAction(index, { iconPath: path }))}
                    >
                        {button.kind === "image" ? <Image source={{ uri: button.url }} style={{ width: 16, height: 16 }} /> : null}
                        <RichText text={label} color={SETTINGS_STYLE.text} onOpen={() => undefined} />
                    </View>
                );
            },
        },
    ];
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 }}>
                <RichText text="Moderation mode is enabled by clicking" color={SETTINGS_STYLE.note} onOpen={openUrl} />
                <Image source={{ uri: assetPath("buttons/moderationDisabledDarkMode18x18.png") }} style={{ width: 18, height: 18 }} />
                <RichText text="in a channel that you moderate." color={SETTINGS_STYLE.note} onOpen={openUrl} />
            </View>
            <RichText
                text={MODERATION_BUTTONS_TEXT}
                links={[{ label: "here", url: "https://wiki.chatterino.com/Moderation/#moderation-mode" }]}
                color={SETTINGS_STYLE.note}
                onOpen={openUrl}
            />
            <EditableModelView
                testID="moderation-actions"
                columns={columns}
                rows={list}
                onAdd={() => update({ moderationActions: [...list, { action: "/timeout {user.name} 300" }] })}
                onChange={(moderationActions) => update({ moderationActions })}
            />
        </View>
    );
}
