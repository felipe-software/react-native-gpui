import type { ComponentType, ReactNode } from "react";
import * as gpui from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { PopupSplit } from "../splits/PopupSplit";
import { useApp } from "../state/AppContext";
import { useStore } from "../state/useStore";

type NativeWindowProps = {
    title?: string;
    width?: number;
    height?: number;
    kind?: "normal" | "dialog" | "popup";
    testID?: string;
    onClose?: () => void;
    children?: ReactNode;
};

type Props = { popupId: string; channel: string; onClose: () => void };

const WIDTH = 300;
const HEIGHT = 500;
const TITLE_BAR = 28;

const NativeWindow = (gpui as unknown as { Window?: ComponentType<NativeWindowProps> }).Window;

export function SplitPopupWindow({ popupId, channel, onClose }: Props) {
    const { core } = useApp();
    const accounts = useStore(core.accounts);
    const title = `Chatterino - ${accounts.current ?? "not logged in"}`;
    const content = <PopupSplit popupId={popupId} channel={channel} onClose={onClose} />;
    if (NativeWindow) {
        return (
            <NativeWindow title={title} width={WIDTH} height={HEIGHT} kind="normal" testID="split-popup-window" onClose={onClose}>
                {content}
            </NativeWindow>
        );
    }
    return (
        <FloatingWindow testID="split-popup-window" title={title} width={WIDTH} height={HEIGHT + TITLE_BAR} onClose={onClose}>
            {content}
        </FloatingWindow>
    );
}
