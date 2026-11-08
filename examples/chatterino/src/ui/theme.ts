import type { ThemeName } from "../data/api";

export type TabStateColors = { background: string; line: string; text: string };
export type TabState = "regular" | "newMessage" | "highlighted" | "selected";

export type Theme = {
    name: ThemeName;
    isLight: boolean;
    accent: string;
    window: { background: string; text: string };
    tabs: Record<TabState, TabStateColors> & { dividerLine: string; live: string; rerun: string };
    messages: {
        background: string;
        alternate: string;
        text: string;
        system: string;
        link: string;
        placeholder: string;
        selection: string;
        separator: string;
    };
    header: {
        background: string;
        border: string;
        text: string;
        focusedBackground: string;
        focusedBorder: string;
        focusedText: string;
    };
    input: { background: string; text: string; border: string; selection: string };
    splits: {
        background: string;
        borderFill: string;
        dropPreview: string;
        dropPreviewBorder: string;
        dropTargetBorder: string;
        dropTargetCross: string;
        resizeHandle: string;
        resizeHandleBackground: string;
    };
    scrollbar: { thumb: string; thumbSelected: string };
    buttons: { plus: string; kebab: string; hover: string; icon: string; iconHover: string };
    moreMessages: { background: string; text: string };
};

const BLUE_PREVIEW = "rgba(0, 148, 255, 0.188)";
const BLUE = "#0094ff";

function tabColors(background: string, line: string, text: string): TabStateColors {
    return { background, line, text };
}

const DARK: Theme = {
    name: "dark",
    isLight: false,
    accent: "#00aeef",
    window: { background: "#111111", text: "#eeeeee" },
    tabs: {
        dividerLine: "#555555",
        live: "#ff0000",
        rerun: "#c7c715",
        regular: tabColors("#252525", "#444444", "#aaaaaa"),
        newMessage: tabColors("#252525", "#888888", "#eeeeee"),
        highlighted: tabColors("#252525", "#ee6166", "#eeeeee"),
        selected: tabColors("#555555", "#00aeef", "#ffffff"),
    },
    messages: {
        background: "#191919",
        alternate: "#222222",
        text: "#ffffff",
        system: "#8c7f7f",
        link: "#4286f4",
        placeholder: "#5d5555",
        selection: "rgba(255, 255, 255, 0.251)",
        separator: "#3c3c3c",
    },
    header: {
        background: "#2e2e2e",
        border: "#383838",
        text: "#ffffff",
        focusedBackground: "#444444",
        focusedBorder: "#464646",
        focusedText: "#84c1ff",
    },
    input: { background: "#242424", text: "#ffffff", border: "#333333", selection: "#555555" },
    splits: {
        background: "#191919",
        borderFill: "#555555",
        dropPreview: BLUE_PREVIEW,
        dropPreviewBorder: BLUE,
        dropTargetBorder: BLUE,
        dropTargetCross: "#ffffff",
        resizeHandle: "rgba(0, 148, 255, 0.439)",
        resizeHandleBackground: "rgba(0, 148, 255, 0.125)",
    },
    scrollbar: { thumb: "#575757", thumbSelected: "#616161" },
    buttons: { plus: "#8c7f7f", kebab: "#c0c0c0", hover: "#ffffff", icon: "#aaaaaa", iconHover: "#ffffff" },
    moreMessages: { background: "rgba(0, 0, 0, 0.66)", text: "#ffffff" },
};

const BLACK: Theme = {
    ...DARK,
    name: "black",
    window: { background: "#040404", text: "#eeeeee" },
    tabs: {
        ...DARK.tabs,
        regular: tabColors("#0b0b0b", "#444444", "#aaaaaa"),
        newMessage: tabColors("#0b0b0b", "#888888", "#eeeeee"),
        highlighted: tabColors("#0b0b0b", "#ee6166", "#eeeeee"),
        selected: tabColors("#333333", "#00aeef", "#ffffff"),
    },
    messages: { ...DARK.messages, background: "#000000", alternate: "#0a0a0a" },
    header: {
        background: "#050505",
        border: "#121212",
        text: "#ffffff",
        focusedBackground: "#1a1a1a",
        focusedBorder: "#1c1c1c",
        focusedText: "#84c1ff",
    },
    input: { background: "#080808", text: "#ffffff", border: "#333333", selection: "#333333" },
    splits: { ...DARK.splits, background: "#000000" },
    scrollbar: { thumb: "#4d4d4d", thumbSelected: "#595959" },
};

const WHITE: Theme = {
    name: "white",
    isLight: true,
    accent: "#00aeef",
    window: { background: "#ffffff", text: "#000000" },
    tabs: {
        dividerLine: "#b4d7ff",
        live: "#ff0000",
        rerun: "#c7c715",
        regular: tabColors("#ffffff", "#ffffff", "#444444"),
        newMessage: tabColors("#ffffff", "#bbbbbb", "#222222"),
        highlighted: tabColors("#ffffff", "#ff0000", "#000000"),
        selected: tabColors("#b4d7ff", "#00aeef", "#000000"),
    },
    messages: {
        background: "#ffffff",
        alternate: "#f5f5f5",
        text: "#000000",
        system: "#867979",
        link: "#0e65f1",
        placeholder: "#af9f9f",
        selection: "rgba(0, 0, 0, 0.251)",
        separator: "#7f7f7f",
    },
    header: {
        background: "#ffffff",
        border: "#ffffff",
        text: "#000000",
        focusedBackground: "#f2f2f2",
        focusedBorder: "#e6e6e6",
        focusedText: "#0051a3",
    },
    input: { background: "#f2f2f2", text: "#000000", border: "#cccccc", selection: "#68b1ff" },
    splits: {
        background: "#ffffff",
        borderFill: "#b4d7ff",
        dropPreview: BLUE_PREVIEW,
        dropPreviewBorder: BLUE,
        dropTargetBorder: BLUE,
        dropTargetCross: "#000000",
        resizeHandle: BLUE,
        resizeHandleBackground: "rgba(0, 148, 255, 0.314)",
    },
    scrollbar: { thumb: "#b3b3b3", thumbSelected: "#a6a6a6" },
    buttons: { plus: "#867979", kebab: "#424242", hover: "#000000", icon: "#444444", iconHover: "#000000" },
    moreMessages: { background: "rgba(0, 0, 0, 0.66)", text: "#ffffff" },
};

const LIGHT: Theme = {
    ...WHITE,
    name: "light",
    messages: { ...WHITE.messages, background: "#e6e6e6", alternate: "#dddddd" },
    header: {
        background: "#e6e6e6",
        border: "#e6e6e6",
        text: "#000000",
        focusedBackground: "#dbdbdb",
        focusedBorder: "#d1d1d1",
        focusedText: "#0051a3",
    },
    input: { ...WHITE.input, background: "#dbdbdb" },
    splits: { ...WHITE.splits, background: "#e6e6e6" },
    scrollbar: { thumb: "#a8a8a8", thumbSelected: "#9e9e9e" },
};

const THEMES: Record<ThemeName, Theme> = { white: WHITE, light: LIGHT, dark: DARK, black: BLACK };

export function themeFor(name: ThemeName): Theme {
    return THEMES[name] ?? DARK;
}

export type ChromeColors = {
    background: string;
    panel: string;
    text: string;
    muted: string;
    disabledText: string;
    border: string;
    outline: string;
    field: string;
    fieldBorder: string;
    focusBorder: string;
    button: string;
    buttonHover: string;
    buttonBorder: string;
    highlight: string;
    highlightOutline: string;
    highlightText: string;
    titleBar: string;
    separator: string;
};

const FUSION_DARK: ChromeColors = {
    background: "#161616",
    panel: "#111111",
    text: "#ffffff",
    muted: "#999999",
    disabledText: "#7f7f7f",
    border: "#0e0e0e",
    outline: "#999999",
    field: "#333333",
    fieldBorder: "#101010",
    focusBorder: "#53a0ed",
    button: "linear-gradient(180deg, #616161, #525252)",
    buttonHover: "linear-gradient(180deg, #6b6b6b, #5c5c5c)",
    buttonBorder: "#101010",
    highlight: "#2a82da",
    highlightOutline: "#53a0ed",
    highlightText: "#ffffff",
    titleBar: "#1e1e1e",
    separator: "rgba(153, 153, 153, 0.6)",
};

export const MENU_COLORS = {
    background: "#373737",
    border: "#0e0e0e",
    text: "#ffffff",
    disabledText: "#7f7f7f",
    separator: "#2a2a2a",
    highlight: "#2a82da",
    highlightOutline: "#53a0ed",
    checkBorder: "#262626",
    checkFill: "#333333",
    checkMark: "#d4d4d4",
};

export const SETTINGS_COLORS = {
    background: "#111111",
    navSelected: "#222222",
    navSelectedText: "#4fc3f7",
    navText: "#ffffff",
    title: "#4fc3f7",
    description: "#999999",
};

export function chromeColors(theme: Theme): ChromeColors {
    if (!theme.isLight) return FUSION_DARK;
    return {
        ...FUSION_DARK,
        background: theme.window.background,
        panel: "#f3f3f3",
        text: theme.window.text,
        muted: "#666666",
        outline: "#999999",
        field: "#e9e9e9",
        fieldBorder: "#b4b4b4",
        button: "linear-gradient(180deg, #e2e2e2, #d0d0d0)",
        buttonHover: "linear-gradient(180deg, #ececec, #dadada)",
        buttonBorder: "#a8a8a8",
        titleBar: "#e6e6e6",
    };
}
