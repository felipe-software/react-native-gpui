import type { EmoteInfo } from "../../data/api";
import type { EmoteSection } from "./emoteSections";

export type GridItem = { emote: EmoteInfo; x: number; width: number; height: number };

export type GridRow =
    | { kind: "title"; key: string; y: number; height: number; text: string }
    | { kind: "empty"; key: string; y: number; height: number; text: string }
    | { kind: "emotes"; key: string; y: number; height: number; paddingTop: number; lineHeight: number; items: GridItem[] };

export type GridLayout = { rows: GridRow[]; height: number };

export type GridMetrics = { width: number; textLine: number; space: number; scale: number; paddingX?: number; paddingY?: number };

const PADDING_X = 8;
const PADDING_Y = 4;

function textRow(kind: "title" | "empty", key: string, text: string, y: number, metrics: GridMetrics): GridRow {
    const height = Math.trunc((metrics.paddingY ?? PADDING_Y) * 2 + metrics.textLine);
    return { kind, key, y, height, text };
}

function emoteLines(emotes: EmoteInfo[], metrics: GridMetrics): GridItem[][] {
    const paddingX = metrics.paddingX ?? PADDING_X;
    const available = Math.max(1, metrics.width - paddingX * 2);
    const lines: GridItem[][] = [];
    let line: GridItem[] = [];
    let x = 0;
    for (const emote of emotes) {
        const width = Math.round(emote.width * metrics.scale);
        const height = Math.round(emote.height * metrics.scale);
        const needed = line.length === 0 ? width : x + metrics.space + width;
        if (line.length > 0 && needed > available) {
            lines.push(line);
            line = [];
            x = 0;
        }
        const left = line.length === 0 ? 0 : x + metrics.space;
        line.push({ emote, x: left, width, height });
        x = left + width;
    }
    if (line.length > 0) lines.push(line);
    return lines.map((items) => {
        const right = items[items.length - 1].x + items[items.length - 1].width;
        const offset = Math.trunc((available - right) / 2) + paddingX;
        return items.map((item) => ({ ...item, x: item.x + offset }));
    });
}

export function layoutEmoteGrid(sections: EmoteSection[], metrics: GridMetrics): GridLayout {
    const rows: GridRow[] = [];
    const paddingY = metrics.paddingY ?? PADDING_Y;
    let y = 0;
    sections.forEach((section, index) => {
        if (section.title) {
            const row = textRow("title", `title-${index}`, section.title, y, metrics);
            rows.push(row);
            y += row.height;
        }
        if (section.emotes.length === 0) {
            const row = textRow("empty", `empty-${index}`, section.empty ?? "no emotes available", y, metrics);
            rows.push(row);
            y += row.height;
            return;
        }
        const lines = emoteLines(section.emotes, metrics);
        lines.forEach((items, lineIndex) => {
            const lineHeight = Math.max(...items.map((item) => item.height));
            const top = lineIndex === 0 ? paddingY : 0;
            const bottom = lineIndex === lines.length - 1 ? paddingY : 0;
            const height = lineHeight + top + bottom;
            rows.push({ kind: "emotes", key: `emotes-${index}-${lineIndex}`, y, height, paddingTop: top, lineHeight, items });
            y += height;
        });
    });
    return { rows, height: y };
}

export function visibleRows(layout: GridLayout, top: number, viewport: number, overscan = 200): GridRow[] {
    const start = top - overscan;
    const end = top + viewport + overscan;
    return layout.rows.filter((row) => row.y + row.height > start && row.y < end);
}
