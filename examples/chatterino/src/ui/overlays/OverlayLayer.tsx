import { View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import type { Overlay } from "../state/overlays";
import { AddAccountDialog } from "./AddAccountDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmotePopup } from "./EmotePopup";
import { PopupMenu } from "./PopupMenu";
import { QuickSwitcher } from "./QuickSwitcher";
import { RenameTabDialog } from "./RenameTabDialog";
import { SearchPopup } from "./SearchPopup";
import { SelectChannelDialog } from "./SelectChannelDialog";
import { SettingsDialog } from "./SettingsDialog";
import { SplitPopupWindow } from "./SplitPopupWindow";
import { ThreadPopup } from "./ThreadPopup";
import { UserCard } from "./UserCard";
import { OverlayWindowContext, overlayWindowFor } from "./overlayWindows";

function renderOverlay(overlay: Overlay, close: () => void) {
    switch (overlay.kind) {
        case "menu":
            return <PopupMenu entries={overlay.entries} x={overlay.x} y={overlay.y} alignRight={overlay.alignRight} onClose={close} />;
        case "confirm":
            return (
                <ConfirmDialog
                    title={overlay.title}
                    message={overlay.message}
                    infoOnly={overlay.infoOnly}
                    onConfirm={overlay.onConfirm}
                    onClose={close}
                />
            );
        case "renameTab":
            return <RenameTabDialog tabId={overlay.tabId} onClose={close} />;
        case "selectChannel":
            return <SelectChannelDialog splitId={overlay.splitId} isNew={overlay.isNew} onClose={close} />;
        case "settings":
            return <SettingsDialog page={overlay.page} onClose={close} />;
        case "userCard":
            return <UserCard login={overlay.login} channel={overlay.channel} x={overlay.x} y={overlay.y} onClose={close} />;
        case "emotes":
            return <EmotePopup splitId={overlay.splitId} channel={overlay.channel} onClose={close} />;
        case "search":
            return <SearchPopup channels={overlay.channels} onClose={close} />;
        case "addAccount":
            return <AddAccountDialog onClose={close} />;
        case "thread":
            return <ThreadPopup channel={overlay.channel} rootId={overlay.rootId} x={overlay.x} y={overlay.y} onClose={close} />;
        case "splitPopup":
            return <SplitPopupWindow popupId={overlay.id} channel={overlay.channel} onClose={close} />;
        case "quickSwitcher":
            return <QuickSwitcher onClose={close} />;
    }
}

export function OverlayLayer() {
    const { overlays, closeOverlay } = useApp();
    if (overlays.length === 0) return null;
    const placed = overlays.map((overlay) => ({ overlay, window: overlayWindowFor(overlay) }));
    const inWindow = placed.filter((entry) => entry.window === null);
    return (
        <>
            {placed.map(({ overlay, window }) =>
                window ? (
                    <OverlayWindowContext.Provider key={overlay.id} value={window}>
                        {renderOverlay(overlay, () => closeOverlay(overlay.id))}
                    </OverlayWindowContext.Provider>
                ) : null,
            )}
            {inWindow.length > 0 ? (
                <View testID="overlay-layer" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
                    {inWindow.map(({ overlay }) => (
                        <View key={overlay.id} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
                            {renderOverlay(overlay, () => closeOverlay(overlay.id))}
                        </View>
                    ))}
                </View>
            ) : null}
        </>
    );
}
