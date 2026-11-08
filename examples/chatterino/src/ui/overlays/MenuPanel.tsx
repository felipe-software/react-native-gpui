import { useState } from "react";
import { View, useWindowDimensions } from "react-native-gpui";
import type { MenuEntry } from "../state/overlays";
import { MENU_COLORS } from "../theme";
import { MENU_ROW_HEIGHT, MenuRow } from "./MenuRow";

type Props = { entries: MenuEntry[]; x: number; y: number; alignRight?: boolean; path: string; onDone: () => void };

const SEPARATOR_HEIGHT = 2;
const CHAR_WIDTH = 7.5;
const SUBMENU_OVERLAP = 2;

function entryHeight(entry: MenuEntry): number {
    return entry.kind === "separator" ? SEPARATOR_HEIGHT : MENU_ROW_HEIGHT;
}

function shortcutColumn(entries: MenuEntry[]): number {
    const longest = entries.reduce((widest, entry) => {
        const shortcut = entry.kind === "item" ? (entry.shortcut ?? "") : "";
        return Math.max(widest, shortcut.length);
    }, 0);
    return longest > 0 ? Math.ceil(longest * CHAR_WIDTH) + 12 : 0;
}

function panelWidth(entries: MenuEntry[], shortcuts: number): number {
    const longest = entries.reduce((widest, entry) => (entry.kind === "separator" ? widest : Math.max(widest, entry.label.length)), 0);
    return Math.max(120, Math.ceil(longest * CHAR_WIDTH) + 28 + 24 + shortcuts + 18);
}

export function MenuPanel({ entries, x, y, alignRight, path, onDone }: Props) {
    const screen = useWindowDimensions();
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const shortcuts = shortcutColumn(entries);
    const width = panelWidth(entries, shortcuts);
    const height = entries.reduce((sum, entry) => sum + entryHeight(entry), 2);
    const preferredLeft = alignRight ? x - width : x;
    const left = Math.max(0, Math.min(preferredLeft, screen.width - width));
    const fitsBelow = y + height <= screen.height;
    const top = fitsBelow ? y : Math.max(0, screen.height - height);
    const openEntry = openIndex === null ? undefined : entries[openIndex];
    const openTop = openIndex === null ? 0 : entries.slice(0, openIndex).reduce((sum, entry) => sum + entryHeight(entry), 0);

    return (
        <>
            <View
                testID={path ? undefined : "popup-menu"}
                style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    backgroundColor: MENU_COLORS.background,
                    borderWidth: 1,
                    borderColor: MENU_COLORS.border,
                }}
            >
                {entries.map((entry, index) => {
                    if (entry.kind === "separator") {
                        return (
                            <View key={`separator-${index}`} style={{ height: SEPARATOR_HEIGHT, paddingHorizontal: 5 }}>
                                <View style={{ height: 1, backgroundColor: MENU_COLORS.separator }} />
                            </View>
                        );
                    }
                    const select = () => {
                        if (entry.kind === "submenu") {
                            setOpenIndex(index);
                            return;
                        }
                        onDone();
                        entry.onSelect();
                    };
                    return (
                        <MenuRow
                            key={`${entry.label}-${index}`}
                            entry={entry}
                            testID={`menu-${path}${entry.label}`}
                            highlighted={openIndex === index}
                            shortcutWidth={shortcuts}
                            onHover={() => setOpenIndex(entry.kind === "submenu" ? index : null)}
                            onPress={select}
                        />
                    );
                })}
            </View>
            {openEntry?.kind === "submenu" ? (
                <MenuPanel
                    entries={openEntry.entries}
                    x={left + width - SUBMENU_OVERLAP}
                    y={top + openTop}
                    path={`${path}${openEntry.label}/`}
                    onDone={onDone}
                />
            ) : null}
        </>
    );
}
