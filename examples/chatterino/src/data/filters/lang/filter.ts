import type { FilterCheck } from "../../api";
import { evaluate, truthy, type FilterContext } from "./evaluate";
import { filterString, parseExpression, type Expression } from "./parser";
import { synthesize, typeErrorText } from "./typecheck";
import type { ValueType } from "./tokenizer";

export type CompiledFilter =
    | { valid: true; expression: Expression; type: ValueType; text: string }
    | { valid: false; error: string; text: string; expression?: Expression; type?: ValueType };

export function compileFilter(text: string): CompiledFilter {
    const parsed = parseExpression(text);
    if (parsed.error !== undefined) return { valid: false, error: parsed.error, text };
    const typed = synthesize(parsed.expression);
    if ("error" in typed) return { valid: false, error: typeErrorText(typed), text, expression: parsed.expression };
    if (typed.type !== "Bool") return { valid: false, error: `Expected Bool but got ${typed.type}`, text, expression: parsed.expression, type: typed.type };
    return { valid: true, expression: parsed.expression, type: typed.type, text };
}

export function checkFilterText(text: string): FilterCheck {
    const parsed = parseExpression(text);
    if (parsed.error !== undefined) return { valid: false, message: "Parsing errors occurred:", detail: parsed.error };
    const typed = synthesize(parsed.expression);
    if ("error" in typed) return { valid: false, message: "Parsing errors occurred:", detail: typeErrorText(typed) };
    if (typed.type !== "Bool") {
        return { valid: false, message: "Unexpected filter return type", detail: `Expected Bool but got ${typed.type}` };
    }
    return { valid: true, message: "Filter is valid", detail: `Parsed as:\n${filterString(parsed.expression)}` };
}

export function runFilter(filter: CompiledFilter, context: FilterContext): boolean {
    if (!filter.valid) return false;
    return truthy(evaluate(filter.expression, context));
}
