import { Platform } from "react-native-gpui";
import type { Settings } from "../data/api";
import { scaledPoints, uiScaleOf } from "./zoom";

export type Fonts = {
    chatFamily: string;
    chatSize: number;
    uiFamily: string;
    uiSize: number;
    appFamily: string;
    appSize: number;
};

type PlatformFonts = { chat: string; ui: string; app: string; appPoints: number; pointsToPixels: number };

const LINUX: PlatformFonts = { chat: "Arimo", ui: "Liberation Sans", app: "DejaVu Sans", appPoints: 10, pointsToPixels: 96 / 72 };
const MAC: PlatformFonts = { chat: "Helvetica Neue", ui: "Helvetica Neue", app: "Helvetica Neue", appPoints: 13, pointsToPixels: 1 };
const WINDOWS: PlatformFonts = { chat: "Segoe UI", ui: "Segoe UI", app: "Segoe UI", appPoints: 9, pointsToPixels: 96 / 72 };

const UI_POINTS = 9;

function platformFonts(): PlatformFonts {
    if (Platform.OS === "macos") return MAC;
    if (Platform.OS === "windows") return WINDOWS;
    return LINUX;
}

export function fontsFor(settings: Pick<Settings, "fontFamily" | "fontSize"> & { uiScale?: number }): Fonts {
    const platform = platformFonts();
    const points = scaledPoints(settings.fontSize, uiScaleOf(settings));
    const chatSize = Math.round(points * platform.pointsToPixels * 100) / 100;
    return {
        chatFamily: settings.fontFamily || platform.chat,
        chatSize,
        uiFamily: platform.ui,
        uiSize: Math.round(UI_POINTS * platform.pointsToPixels),
        appFamily: platform.app,
        appSize: Math.round(platform.appPoints * platform.pointsToPixels * 100) / 100,
    };
}

export const FONT_FAMILIES = ["Arimo", "Liberation Sans", "DejaVu Sans", "Noto Sans", "Ubuntu", "Helvetica Neue", "Segoe UI"];
