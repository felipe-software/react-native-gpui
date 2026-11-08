import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { TextField } from "../common/TextField";
import { defaultTabTitle, tabById } from "../layout/tabs";
import { useApp } from "../state/AppContext";
import { MENTIONS_CHANNEL } from "../state/ids";
import { useStore } from "../state/useStore";
import { chromeColors } from "../theme";

type Props = { tabId: string; onClose: () => void };

export function RenameTabDialog({ tabId, onClose }: Props) {
    const { core, theme, fonts, actions, channelInfos } = useApp();
    const colors = chromeColors(theme);
    const infos = useStore(channelInfos);
    const tab = tabById(core.layout.get(), tabId);
    const [name, setName] = useState(tab?.title ?? "");
    const displayName = (channel: string) => (channel === MENTIONS_CHANNEL ? "/mentions" : (infos[channel]?.displayName ?? channel));
    const placeholder = defaultTabTitle(tab?.root ?? null, displayName);
    const accept = () => {
        actions.renameTab(tabId, name);
        onClose();
    };
    return (
        <FloatingWindow testID="rename-tab-dialog" title="Rename Tab" width={340} height={130} modal onClose={onClose}>
            <View style={{ flex: 1, padding: 14, justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>Name:</Text>
                    <TextField grow testID="rename-tab-input" value={name} placeholder={placeholder} autoFocus onChange={setName} onSubmit={accept} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    <PushButton testID="rename-tab-cancel" label="Cancel" onPress={onClose} />
                    <PushButton testID="rename-tab-ok" label="OK" primary onPress={accept} />
                </View>
            </View>
        </FloatingWindow>
    );
}
