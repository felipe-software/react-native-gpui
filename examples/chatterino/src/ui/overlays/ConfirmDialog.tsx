import { Text, View } from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Props = { title: string; message: string; infoOnly?: boolean; onConfirm: () => void; onClose: () => void };

export function ConfirmDialog({ title, message, infoOnly, onConfirm, onClose }: Props) {
    const { theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const confirm = () => {
        onClose();
        onConfirm();
    };
    return (
        <FloatingWindow testID="confirm-dialog" title={title} width={380} height={150} modal onClose={onClose}>
            <View style={{ flex: 1, padding: 16, justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{message}</Text>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    {infoOnly ? null : <PushButton testID="confirm-cancel" label="Cancel" onPress={onClose} />}
                    <PushButton testID="confirm-ok" label={infoOnly ? "OK" : "Yes"} primary onPress={confirm} />
                </View>
            </View>
        </FloatingWindow>
    );
}
