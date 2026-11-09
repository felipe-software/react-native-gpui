import { createContext, useContext, type ReactNode } from "react";

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type ListOption = { value: string; label: string };

export type PopupSpec =
    | { kind: "list"; anchor: Rect; options: ListOption[]; selected?: string; onSelect: (value: string) => void }
    | { kind: "modal"; title: string; width: number; height: number; render: (close: () => void) => ReactNode };

export type SettingsUi = {
    query: string;
    toLocal(page: Point): Point;
    showTooltip(text: string, at: Point): void;
    hideTooltip(): void;
    openPopup(spec: PopupSpec): void;
    closePopup(): void;
};

const FALLBACK: SettingsUi = {
    query: "",
    toLocal: (page) => page,
    showTooltip: () => undefined,
    hideTooltip: () => undefined,
    openPopup: () => undefined,
    closePopup: () => undefined,
};

export const SettingsUiContext = createContext<SettingsUi>(FALLBACK);

export function useSettingsUi(): SettingsUi {
    return useContext(SettingsUiContext);
}

export function matchesQuery(query: string, ...texts: Array<string | undefined>): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return texts.some((text) => !!text && text.toLowerCase().includes(needle));
}

const MAX_TOOLTIP_LINE = 50;

export function wrapTooltip(text: string): string {
    if (text.length <= MAX_TOOLTIP_LINE) return text;
    return text
        .split("\n")
        .map((line) => {
            const out: string[] = [];
            let current = "";
            for (const word of line.split(" ")) {
                current = current ? `${current} ${word}` : word;
                if (current.length >= MAX_TOOLTIP_LINE) {
                    out.push(current);
                    current = "";
                }
            }
            if (current) out.push(current);
            return out.join("\n");
        })
        .join("\n");
}
