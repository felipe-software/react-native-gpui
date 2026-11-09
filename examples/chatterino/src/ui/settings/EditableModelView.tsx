import { useState, type ReactNode } from "react";
import { View } from "react-native-gpui";
import { matchesQuery } from "./SettingsContext";
import { SPushButton } from "./SPushButton";
import { TableView } from "./TableView";
import type { TableColumn } from "./tableTypes";

type Props<T> = {
    testID: string;
    columns: TableColumn<T>[];
    rows: T[];
    movable?: boolean;
    showHeader?: boolean;
    headerHeight?: number;
    fixedRows?: number;
    query?: string;
    searchColumns?: number[];
    customButtons?: ReactNode;
    addDisabled?: boolean;
    onAdd: () => void;
    onChange: (rows: T[]) => void;
    onRowChange?: (index: number, row: T) => void;
};

function hiddenRowsFor<T>(rows: T[], columns: TableColumn<T>[], query: string | undefined, searchColumns: number[] | undefined): Set<number> | undefined {
    if (!query || !searchColumns) return undefined;
    const hidden = new Set<number>();
    rows.forEach((row, index) => {
        const texts = searchColumns.map((column) => columns[column]?.text?.(row));
        if (!matchesQuery(query, ...texts)) hidden.add(index);
    });
    return hidden;
}

export function EditableModelView<T>({
    testID,
    columns,
    rows,
    movable = true,
    showHeader = true,
    headerHeight,
    fixedRows = 0,
    query,
    searchColumns,
    customButtons,
    addDisabled,
    onAdd,
    onChange,
    onRowChange,
}: Props<T>) {
    const [selected, setSelected] = useState<number | undefined>(undefined);
    const hiddenRows = hiddenRowsFor(rows, columns, query, searchColumns);
    const isEditable = (index: number | undefined) => index !== undefined && index >= fixedRows && index < rows.length;

    const remove = () => {
        if (!isEditable(selected)) return;
        onChange(rows.filter((_, index) => index !== selected));
        setSelected(undefined);
    };
    const move = (direction: number) => {
        if (!isEditable(selected)) return;
        const from = selected as number;
        const to = from + direction;
        if (to < fixedRows || to >= rows.length) return;
        const next = [...rows];
        [next[from], next[to]] = [next[to], next[from]];
        onChange(next);
        setSelected(to);
    };
    const add = () => {
        onAdd();
        setSelected(rows.length);
    };
    const changeRow = (index: number, row: T) => {
        if (onRowChange) {
            onRowChange(index, row);
            return;
        }
        onChange(rows.map((entry, position) => (position === index ? row : entry)));
    };

    return (
        <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <SPushButton testID={`${testID}-add`} label="Add" disabled={addDisabled} onPress={add} />
                <SPushButton testID={`${testID}-remove`} label="Remove" onPress={remove} />
                {movable ? <SPushButton testID={`${testID}-up`} label="Move up" onPress={() => move(-1)} /> : null}
                {movable ? <SPushButton testID={`${testID}-down`} label="Move down" onPress={() => move(1)} /> : null}
                <View style={{ flex: 1 }} />
                {customButtons}
            </View>
            <TableView
                testID={`${testID}-table`}
                columns={columns}
                rows={rows}
                hiddenRows={hiddenRows}
                selected={selected}
                showHeader={showHeader}
                headerHeight={headerHeight}
                onSelect={setSelected}
                onChangeRow={changeRow}
            />
        </View>
    );
}
