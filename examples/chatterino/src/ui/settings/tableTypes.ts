import type { ReactNode } from "react";

export type TableCellKind = "text" | "check" | "color" | "action" | "custom";

export type TableColumn<T> = {
    title: string;
    width?: number;
    headerWidth?: number;
    kind: TableCellKind;
    text?: (row: T) => string;
    checked?: (row: T) => boolean | undefined;
    color?: (row: T) => string | undefined;
    edit?: (row: T, value: string) => T;
    toggle?: (row: T, value: boolean) => T;
    enabled?: (row: T) => boolean;
    leadingCheck?: (row: T) => boolean | undefined;
    toggleLeading?: (row: T, value: boolean) => T;
    textColor?: (row: T) => string | undefined;
    onActivate?: (row: T, index: number) => void;
    render?: (row: T, index: number) => ReactNode;
    validate?: (value: string) => boolean;
    align?: "left" | "center";
};

export const TABLE_ROW_HEIGHT = 30;
