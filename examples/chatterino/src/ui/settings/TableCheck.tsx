import { Svg, View } from "react-native-gpui";
import { ICONS } from "../icons";

type Props = { checked: boolean; enabled: boolean };

const BOX_BORDER = "#3f3f3f";
const BOX_FILL = "#383838";
const MARK = "#ffffff";

export function TableCheck({ checked, enabled }: Props) {
    if (checked) return <Svg name={ICONS.check} style={{ width: 13, height: 13, color: enabled ? MARK : "#9a9a9a" }} />;
    if (!enabled) return null;
    return <View style={{ width: 13, height: 13, borderWidth: 1, borderColor: BOX_BORDER, backgroundColor: BOX_FILL }} />;
}
