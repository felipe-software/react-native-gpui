import { useState } from "react";
import { View } from "react-native-gpui";
import { buildFilterText, FILTER_OPERATORS, type FilterOperand } from "../../data/filters/records";
import { FilterOperandRow } from "./FilterOperandRow";
import { RegexInfoLink } from "./RegexInfoLink";
import { SComboBox } from "./SComboBox";
import { SLineEdit } from "./SLineEdit";
import { SPushButton } from "./SPushButton";

type Props = { onAccept: (name: string, filter: string) => void; onCancel: () => void };

const OPERATOR_OPTIONS = FILTER_OPERATORS.map((entry) => ({ value: entry.op || "nothing", label: entry.label }));

export function FilterEditorContent({ onAccept, onCancel }: Props) {
    const [name, setName] = useState("My filter");
    const [left, setLeft] = useState<FilterOperand>({ type: "variable", value: "message.content" });
    const [op, setOp] = useState("contains");
    const [right, setRight] = useState<FilterOperand>({ type: "text", value: "hello" });
    const noRight = op === "nothing";
    return (
        <View style={{ flex: 1, padding: 10, gap: 8 }}>
            <SLineEdit testID="filter-name" value={name} placeholder="Filter name" onChange={setName} />
            <FilterOperandRow testID="filter-left" operand={left} onChange={setLeft} />
            <View style={{ paddingHorizontal: 5 }}>
                <SComboBox testID="filter-operator" value={op} options={OPERATOR_OPTIONS} width={160} greyable={false} onChange={setOp} />
            </View>
            <FilterOperandRow testID="filter-right" operand={right} disabled={noRight} onChange={setRight} />
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <RegexInfoLink testID="filter-variable-help" label="variable help" url="https://wiki.chatterino.com/Filters/#variables" />
                <View style={{ flex: 1 }} />
                <SPushButton testID="filter-ok" label="Ok" primary onPress={() => onAccept(name, buildFilterText(left, noRight ? "" : op, right))} />
                <SPushButton testID="filter-cancel" label="Cancel" onPress={onCancel} />
            </View>
        </View>
    );
}
