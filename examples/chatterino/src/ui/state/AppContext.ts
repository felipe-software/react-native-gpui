import { createContext, useContext } from "react";
import type { ChatCore, ChatCoreExtras } from "../../data";
import type { ChannelInfo, Settings, Store } from "../../data/api";
import type { Fonts } from "../fonts";
import type { Theme } from "../theme";
import type { LayoutActions } from "./layoutActions";
import type { Overlay, OverlaySpec, TooltipSpec } from "./overlays";
import type { UiPrefs } from "./prefs";

export type Core = ChatCore & ChatCoreExtras;

export type TabActivity = "newMessage" | "highlighted";

export type DragState = {
    splitId: string;
    sourceTabId: string;
    x: number;
    y: number;
};

export type AppServices = {
    core: Core;
    theme: Theme;
    fonts: Fonts;
    settings: Settings;
    prefs: UiPrefs;
    prefsStore: Store<UiPrefs>;
    channelInfos: Store<Record<string, ChannelInfo>>;
    tabActivity: Store<Record<string, TabActivity>>;
    drag: Store<DragState | null>;
    actions: LayoutActions;
    overlays: Overlay[];
    openOverlay: (spec: OverlaySpec) => string;
    closeOverlay: (id: string) => void;
    showTooltip: (spec: TooltipSpec) => void;
    hideTooltip: (owner: string) => void;
    openUrl: (url: string) => void;
};

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
    const value = useContext(AppContext);
    if (!value) throw new Error("useApp outside AppContext");
    return value;
}
