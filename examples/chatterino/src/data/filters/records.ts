import type { FilterRecord } from "../api";
import { compileFilter } from "./lang/filter";
import { VARIABLES } from "./lang/tokenizer";

export const QUICK_ADD_FILTER: Omit<FilterRecord, "id"> = { name: "My filter", filter: 'message.content contains "hello"' };

function randomHex(length: number): string {
    let out = "";
    for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
}

export function newFilterId(): string {
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    const uuid = cryptoApi?.randomUUID?.();
    if (uuid) return uuid.toLowerCase();
    return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

export function isValidFilter(text: string): boolean {
    return compileFilter(text).valid;
}

export type FilterOperand = { type: "text" | "number" | "variable"; value: string };

export const FILTER_OPERATORS: Array<{ label: string; op: string }> = [
    { label: "and", op: "&&" },
    { label: "or", op: "||" },
    { label: "+", op: "+" },
    { label: "-", op: "-" },
    { label: "*", op: "*" },
    { label: "/", op: "/" },
    { label: "%", op: "%" },
    { label: "equals", op: "==" },
    { label: "not equals", op: "!=" },
    { label: "<", op: "<" },
    { label: ">", op: ">" },
    { label: "<=", op: "<=" },
    { label: ">=", op: ">=" },
    { label: "contains", op: "contains" },
    { label: "starts with", op: "startswith" },
    { label: "ends with", op: "endswith" },
    { label: "(nothing)", op: "" },
];

function compareKeys(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export const FILTER_VARIABLES = Object.entries(VARIABLES)
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([key, info]) => ({ key, label: info.label }));

function operandText(operand: FilterOperand): string {
    if (operand.type === "variable") return operand.value;
    if (operand.type === "number") return operand.value;
    return `"${operand.value.replace(/"/g, '\\"')}"`;
}

export function buildFilterText(left: FilterOperand, op: string, right: FilterOperand): string {
    if (!op) return operandText(left);
    return `(${operandText(left)} ${op} ${operandText(right)})`;
}
