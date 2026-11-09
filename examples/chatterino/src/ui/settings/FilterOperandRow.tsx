import { View } from "react-native-gpui";
import { FILTER_VARIABLES, type FilterOperand } from "../../data/filters/records";
import { SComboBox } from "./SComboBox";
import { SLineEdit } from "./SLineEdit";

type Props = { testID: string; operand: FilterOperand; disabled?: boolean; onChange: (operand: FilterOperand) => void };

const TYPES = [
    { value: "text", label: "Constant Text" },
    { value: "number", label: "Constant Number" },
    { value: "variable", label: "Variable" },
];

const VARIABLE_OPTIONS = FILTER_VARIABLES.map((variable) => ({ value: variable.key, label: variable.label }));

export function FilterOperandRow({ testID, operand, disabled, onChange }: Props) {
    const isVariable = operand.type === "variable";
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 5, opacity: disabled ? 0.5 : 1 }}>
            <SComboBox
                testID={`${testID}-type`}
                value={operand.type}
                options={TYPES}
                width={160}
                greyable={false}
                disabled={disabled}
                onChange={(type) => onChange({ type: type as FilterOperand["type"], value: type === "variable" ? VARIABLE_OPTIONS[0].value : "" })}
            />
            {isVariable ? (
                <SComboBox
                    testID={`${testID}-variable`}
                    value={operand.value}
                    options={VARIABLE_OPTIONS}
                    width={260}
                    greyable={false}
                    disabled={disabled}
                    onChange={(value) => onChange({ type: "variable", value })}
                />
            ) : (
                <SLineEdit
                    testID={`${testID}-value`}
                    value={operand.value}
                    grow
                    disabled={disabled}
                    onChange={(value) => {
                        const isNumber = operand.type === "number";
                        const accepted = !isNumber || /^\d*$/.test(value);
                        if (accepted) onChange({ type: operand.type, value });
                    }}
                />
            )}
        </View>
    );
}
