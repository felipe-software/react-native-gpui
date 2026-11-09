import { Text, View } from "react-native-gpui";
import { themedAsset } from "../assetPaths";
import { IconButton } from "../common/IconButton";
import { useApp } from "../state/AppContext";
import type { ReplyTarget } from "./replyTarget";

type Props = { splitId: string; target: ReplyTarget; onCancel: () => void };

const LABEL_HEIGHT = 18;

export function ReplyBar({ splitId, target, onCancel }: Props) {
    const { theme, fonts } = useApp();
    const labelColor = theme.isLight ? "#333333" : "#cccccc";
    const previewSize = Math.round(fonts.chatSize * 0.8 * 100) / 100;
    return (
        <View testID={`reply-bar-${splitId}`} style={{ borderWidth: 1, borderColor: theme.input.border, backgroundColor: theme.input.background }}>
            <View style={{ flexDirection: "row", alignItems: "center", height: LABEL_HEIGHT }}>
                <Text
                    testID={`reply-label-${splitId}`}
                    numberOfLines={1}
                    style={{ flex: 1, color: labelColor, fontFamily: fonts.chatFamily, fontSize: fonts.chatSize, fontWeight: "600" }}
                >
                    {`Replying to @${target.displayName}`}
                </Text>
                <IconButton
                    testID={`reply-cancel-${splitId}`}
                    label="Cancel reply"
                    icon={themedAsset(theme.isLight, "cancel.svg", "cancelDark.svg")}
                    width={20}
                    height={12}
                    iconWidth={12}
                    iconHeight={12}
                    onPress={onCancel}
                />
            </View>
            <View style={{ height: 1, backgroundColor: theme.input.border }} />
            <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text
                    testID={`reply-preview-${splitId}`}
                    numberOfLines={1}
                    style={{ color: theme.messages.system, fontFamily: fonts.chatFamily, fontSize: previewSize }}
                >
                    {target.text}
                </Text>
            </View>
        </View>
    );
}
