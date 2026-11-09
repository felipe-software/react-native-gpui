import { filterString, type Expression } from "./parser";
import { VARIABLES, type ValueType } from "./tokenizer";

export type TypeResult = { type: ValueType } | { error: string; node: Expression };

const LIST_TYPES: ValueType[] = ["List", "StringList", "MatchingSpecifier"];

function isList(type: ValueType): boolean {
    return LIST_TYPES.includes(type);
}

function fail(error: string, node: Expression): TypeResult {
    return { error, node };
}

function listType(expression: Extract<Expression, { kind: "list" }>): TypeResult {
    const types: ValueType[] = [];
    for (const item of expression.items) {
        const result = synthesize(item);
        if ("error" in result) return result;
        types.push(result.type);
    }
    if (types.length === 2 && types[0] === "RegularExpression" && types[1] === "Int") return { type: "MatchingSpecifier" };
    if (types.every((type) => type === "String")) return { type: "StringList" };
    return { type: "List" };
}

function binaryType(expression: Extract<Expression, { kind: "binary" }>): TypeResult {
    const left = synthesize(expression.left);
    if ("error" in left) return left;
    const right = synthesize(expression.right);
    if ("error" in right) return right;
    const l = left.type;
    const r = right.type;
    switch (expression.op) {
        case "PLUS":
            if (l === "String") return { type: "String" };
            if (l === "Int" && r === "Int") return { type: "Int" };
            return fail("Can only add Ints or concatenate a String", expression);
        case "MINUS":
        case "MULTIPLY":
        case "DIVIDE":
        case "MOD":
            return l === "Int" && r === "Int" ? { type: "Int" } : fail("Can only perform operation with Ints", expression);
        case "AND":
        case "OR":
            return l === "Bool" && r === "Bool" ? { type: "Bool" } : fail("Can only perform logical operations with Bools", expression);
        case "EQ":
        case "NEQ":
            return { type: "Bool" };
        case "LT":
        case "GT":
        case "LTE":
        case "GTE":
            return l === "Int" && r === "Int" ? { type: "Bool" } : fail("Can only perform comparisons with Ints", expression);
        case "STARTS_WITH":
        case "ENDS_WITH":
            if (isList(l) || (l === "String" && r === "String")) return { type: "Bool" };
            return fail("Can only perform starts/ends with a List or two Strings", expression);
        case "CONTAINS":
            if (isList(l) || l === "Map" || (l === "String" && r === "String")) return { type: "Bool" };
            return fail("Can only perform contains with a List, a Map, or two Strings", expression);
        case "MATCH":
            if (l !== "String") return fail("Left argument of match must be a String", expression);
            if (r === "RegularExpression") return { type: "Bool" };
            if (r === "MatchingSpecifier") return { type: "String" };
            return fail("Can only match on a RegularExpression or a MatchingSpecifier", expression);
        default:
            return fail("Invalid operation", expression);
    }
}

export function synthesize(expression: Expression): TypeResult {
    switch (expression.kind) {
        case "int":
            return { type: "Int" };
        case "string":
            return { type: "String" };
        case "identifier":
            return { type: VARIABLES[expression.name]?.type ?? "String" };
        case "regex":
            return { type: "RegularExpression" };
        case "list":
            return listType(expression);
        case "not": {
            const operand = synthesize(expression.operand);
            if ("error" in operand) return operand;
            return operand.type === "Bool" ? { type: "Bool" } : fail("Can only negate boolean values", expression);
        }
        case "binary":
            return binaryType(expression);
    }
}

export function typeErrorText(result: { error: string; node: Expression }): string {
    return `${result.error}\n\nProblem occurred here:\n${filterString(result.node)}`;
}
