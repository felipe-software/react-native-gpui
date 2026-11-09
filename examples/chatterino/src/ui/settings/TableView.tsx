import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { ColorSwatch } from "./ColorSwatch";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "./settingsStyle";
import { SLineEdit } from "./SLineEdit";
import { TableCheck } from "./TableCheck";
import { TABLE_ROW_HEIGHT, type TableColumn } from "./tableTypes";

type Props<T> = {
    testID: string;
    columns: TableColumn<T>[];
    rows: T[];
    hiddenRows?: Set<number>;
    selected: number | undefined;
    showHeader?: boolean;
    headerHeight?: number;
    onSelect: (index: number) => void;
    onChangeRow: (index: number, row: T) => void;
};

type Editing = { row: number; column: number; text: string } | undefined;

const DOUBLE_CLICK_MS = 400;

function headerLines(columns: TableColumn<unknown>[]): number {
    return columns.reduce((max, column) => Math.max(max, column.title.split("\n").length), 1);
}

export function TableView<T>({ testID, columns, rows, hiddenRows, selected, showHeader = true, headerHeight, onSelect, onChangeRow }: Props<T>) {
    const { fonts } = useApp();
    const [editing, setEditing] = useState<Editing>(undefined);
    const lastClick = useRef({ key: "", time: 0 });
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    const lines = headerLines(columns as TableColumn<unknown>[]);
    const resolvedHeaderHeight = headerHeight ?? (lines > 1 ? 38 : 22);

    const commitEdit = () => {
        if (!editing) return;
        const column = columns[editing.column];
        const row = rows[editing.row];
        const valid = !column.validate || column.validate(editing.text);
        if (column.edit && row !== undefined && valid) onChangeRow(editing.row, column.edit(row, editing.text));
        setEditing(undefined);
    };

    const cellStyle = (column: TableColumn<T>, isLast: boolean) => ({
        width: column.width,
        flex: column.width === undefined ? 1 : undefined,
        height: TABLE_ROW_HEIGHT,
        justifyContent: "center" as const,
        borderRightWidth: isLast ? 0 : 1,
        borderColor: SETTINGS_STYLE.tableGrid,
        paddingHorizontal: 4,
    });

    const renderCell = (row: T, rowIndex: number, column: TableColumn<T>, columnIndex: number) => {
        const enabled = column.enabled ? column.enabled(row) : true;
        const isEditing = editing?.row === rowIndex && editing.column === columnIndex;
        if (isEditing) {
            return (
                <SLineEdit
                    testID={`${testID}-edit`}
                    value={editing.text}
                    autoFocus
                    onChange={(value) => setEditing({ row: rowIndex, column: columnIndex, text: value })}
                    onSubmit={commitEdit}
                    onBlur={commitEdit}
                />
            );
        }
        switch (column.kind) {
            case "check": {
                const checked = !!column.checked?.(row);
                return (
                    <View
                        testID={`${testID}-${rowIndex}-${columnIndex}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked, disabled: !enabled }}
                        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                        onClick={() => {
                            onSelect(rowIndex);
                            if (enabled && column.toggle) onChangeRow(rowIndex, column.toggle(row, !checked));
                        }}
                    >
                        <TableCheck checked={checked} enabled={enabled} />
                    </View>
                );
            }
            case "color":
                return (
                    <View
                        testID={`${testID}-${rowIndex}-${columnIndex}`}
                        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 1 }}
                        onClick={() => {
                            onSelect(rowIndex);
                            if (enabled) column.onActivate?.(row, rowIndex);
                        }}
                    >
                        {enabled || column.color?.(row) ? <ColorSwatch color={column.color?.(row)} width={(column.width ?? 46) - 2} height={TABLE_ROW_HEIGHT - 2} /> : null}
                    </View>
                );
            case "custom":
                return column.render?.(row, rowIndex) ?? null;
            default: {
                const leading = column.leadingCheck?.(row);
                const hasLeading = leading !== undefined;
                const value = column.text?.(row) ?? "";
                const color = column.textColor?.(row) ?? (enabled ? SETTINGS_STYLE.text : SETTINGS_STYLE.disabledText);
                const editable = column.kind === "text" && !!column.edit && enabled;
                return (
                    <View
                        testID={`${testID}-${rowIndex}-${columnIndex}`}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                        onClick={() => {
                            const key = `${rowIndex}:${columnIndex}`;
                            const now = Date.now();
                            const isDoubleClick = lastClick.current.key === key && now - lastClick.current.time < DOUBLE_CLICK_MS;
                            lastClick.current = { key, time: now };
                            onSelect(rowIndex);
                            if (column.kind === "action" && enabled) column.onActivate?.(row, rowIndex);
                            if (isDoubleClick && editable) setEditing({ row: rowIndex, column: columnIndex, text: value });
                        }}
                    >
                        {hasLeading ? (
                            <View
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: !!leading }}
                                onClick={() => {
                                    if (column.toggleLeading) onChangeRow(rowIndex, column.toggleLeading(row, !leading));
                                }}
                            >
                                <TableCheck checked={!!leading} enabled />
                            </View>
                        ) : null}
                        <Text
                            numberOfLines={1}
                            style={{ ...text, flex: 1, color, textAlign: column.align === "center" ? "center" : "left" }}
                        >
                            {value}
                        </Text>
                    </View>
                );
            }
        }
    };

    return (
        <View testID={testID} style={{ flex: 1, borderWidth: 1, borderColor: SETTINGS_STYLE.tableBorder, backgroundColor: SETTINGS_STYLE.tableBackground }}>
            {showHeader ? (
                <View style={{ height: resolvedHeaderHeight, flexDirection: "row", backgroundImage: SETTINGS_STYLE.tableHeader }}>
                    {columns.map((column, index) => (
                        <View
                            key={`${column.title}-${index}`}
                            style={{
                                width: column.width,
                                flex: column.width === undefined ? 1 : undefined,
                                justifyContent: "center",
                                alignItems: "center",
                                overflow: "hidden",
                                borderRightWidth: index === columns.length - 1 ? 0 : 1,
                                borderBottomWidth: 1,
                                borderColor: SETTINGS_STYLE.tableHeaderBorder,
                            }}
                        >
                            <Text numberOfLines={2} style={{ ...text, textAlign: "center", lineHeight: SETTINGS_LINE_HEIGHT, width: column.headerWidth }}>
                                {column.title}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
            <ScrollView style={{ flex: 1 }}>
                {rows.map((row, rowIndex) => {
                    if (hiddenRows?.has(rowIndex)) return null;
                    const isSelected = rowIndex === selected;
                    return (
                        <View
                            key={rowIndex}
                            testID={`${testID}-row-${rowIndex}`}
                            accessibilityState={{ selected: isSelected }}
                            style={{
                                flexDirection: "row",
                                borderBottomWidth: 1,
                                borderColor: SETTINGS_STYLE.tableGrid,
                                backgroundColor: isSelected ? SETTINGS_STYLE.tableSelection : undefined,
                            }}
                        >
                            {columns.map((column, columnIndex) => (
                                <View key={columnIndex} style={cellStyle(column, columnIndex === columns.length - 1)}>
                                    {renderCell(row, rowIndex, column, columnIndex)}
                                </View>
                            ))}
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}
