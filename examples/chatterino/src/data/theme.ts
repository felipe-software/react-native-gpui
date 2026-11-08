import type { ThemeName } from "./api";

export type ThemePalette = {
    isLight: boolean;
    text: string;
    system: string;
    link: string;
    background: string;
    alternateBackground: string;
    disabled: string;
    selection: string;
    separator: string;
    scrollbarThumb: string;
    scrollbarThumbSelected: string;
    accent: string;
};

const DARK: ThemePalette = {
    isLight: false,
    text: "#ffffff",
    system: "#8c7f7f",
    link: "#4286f4",
    background: "#191919",
    alternateBackground: "#222222",
    disabled: "#19191999",
    selection: "#ffffff40",
    separator: "#3c3c3c",
    scrollbarThumb: "#575757",
    scrollbarThumbSelected: "#616161",
    accent: "#00aeef",
};

const BLACK: ThemePalette = {
    ...DARK,
    background: "#000000",
    alternateBackground: "#0a0a0a",
    disabled: "#00000099",
    scrollbarThumb: "#4d4d4d",
    scrollbarThumbSelected: "#595959",
};

const LIGHT: ThemePalette = {
    isLight: true,
    text: "#000000",
    system: "#8c7f7f",
    link: "#4286f4",
    background: "#e6e6e6",
    alternateBackground: "#dddddd",
    disabled: "#e6e6e699",
    selection: "#00000040",
    separator: "#7f7f7f",
    scrollbarThumb: "#a8a8a8",
    scrollbarThumbSelected: "#9e9e9e",
    accent: "#00aeef",
};

const WHITE: ThemePalette = {
    ...LIGHT,
    background: "#ffffff",
    alternateBackground: "#f5f5f5",
    disabled: "#ffffff99",
    scrollbarThumb: "#b3b3b3",
    scrollbarThumbSelected: "#a6a6a6",
};

const PALETTES: Record<ThemeName, ThemePalette> = { dark: DARK, black: BLACK, light: LIGHT, white: WHITE };

export function themePalette(theme: ThemeName): ThemePalette {
    return PALETTES[theme] ?? DARK;
}
