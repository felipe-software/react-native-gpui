import { View } from "react-native-gpui";
import type { MenuEntry } from "../state/overlays";
import { MenuPanel } from "./MenuPanel";

type Props = { entries: MenuEntry[]; x: number; y: number; alignRight?: boolean; onClose: () => void };

export function PopupMenu({ entries, x, y, alignRight, onClose }: Props) {
    return (
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <View testID="popup-menu-backdrop" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onMouseDown={onClose} />
            <MenuPanel entries={entries} x={x} y={y} alignRight={alignRight} path="" onDone={onClose} />
        </View>
    );
}
