import { parseColor, type Rgba } from "../../util/colors";
import type { Expression } from "./parser";

export type Value =
    | { t: "string"; v: string }
    | { t: "int"; v: number }
    | { t: "bool"; v: boolean }
    | { t: "color"; v: Rgba | undefined }
    | { t: "regex"; v: RegExp | undefined; pattern: string; ci: boolean }
    | { t: "stringlist"; v: string[] }
    | { t: "list"; v: Value[] };

export type FilterContext = Record<string, Value>;

const INT_MIN = -2147483648;

function wrap(value: number): number {
    return value | 0;
}

export function fold(text: string): string {
    let out = "";
    for (const char of text) {
        const lower = char.toLowerCase();
        out += [...lower].length === 1 ? lower : char;
    }
    return out.replace(/ς/g, "σ").replace(/ſ/g, "s").replace(/µ/g, "μ");
}

function foldEqual(a: string, b: string): boolean {
    return fold(a) === fold(b);
}

function hex(value: number): string {
    return value.toString(16).padStart(2, "0");
}

function colorString(color: Rgba | undefined): string {
    if (!color) return "#000000";
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

function toStringValue(value: Value): string | undefined {
    switch (value.t) {
        case "string":
            return value.v;
        case "int":
            return String(value.v);
        case "bool":
            return value.v ? "true" : "false";
        case "color":
            return colorString(value.v);
        case "stringlist":
            return value.v.length === 1 ? value.v[0] : undefined;
        default:
            return undefined;
    }
}

function concatString(value: Value): string | undefined {
    if (value.t === "stringlist") return value.v.join("");
    return toStringValue(value);
}

function toInt(value: Value): number | undefined {
    if (value.t === "int") return value.v;
    if (value.t === "bool") return value.v ? 1 : 0;
    if (value.t !== "string") return undefined;
    const trimmed = value.v.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return undefined;
    const parsed = Number(trimmed);
    return parsed >= INT_MIN && parsed <= 2147483647 ? parsed : undefined;
}

function toBool(value: Value): boolean | undefined {
    if (value.t === "bool") return value.v;
    if (value.t === "int") return value.v !== 0;
    if (value.t === "string") return !(value.v === "" || value.v === "0" || value.v.toLowerCase() === "false");
    return undefined;
}

function toColor(value: Value): Rgba | undefined {
    if (value.t === "color") return value.v;
    if (value.t !== "string") return undefined;
    const text = value.v.trim();
    const argb = /^#([0-9a-f]{8})$/i.exec(text);
    if (argb) return parseColor(`#${argb[1].slice(2)}${argb[1].slice(0, 2)}`);
    return parseColor(text);
}

function convert(value: Value, target: Value["t"]): Value | undefined {
    switch (target) {
        case "string": {
            const text = toStringValue(value);
            return text === undefined ? undefined : { t: "string", v: text };
        }
        case "int": {
            const number = toInt(value);
            return number === undefined ? undefined : { t: "int", v: number };
        }
        case "bool": {
            const bool = toBool(value);
            return bool === undefined ? undefined : { t: "bool", v: bool };
        }
        case "color": {
            const color = toColor(value);
            return color ? { t: "color", v: color } : undefined;
        }
        case "stringlist":
            if (value.t === "string") return { t: "stringlist", v: [value.v] };
            return undefined;
        default:
            return undefined;
    }
}

function strictEqual(a: Value, b: Value): boolean {
    if (a.t !== b.t) return false;
    switch (a.t) {
        case "string":
        case "int":
        case "bool":
            return a.v === (b as typeof a).v;
        case "color": {
            const other = (b as typeof a).v;
            if (!a.v || !other) return !a.v && !other;
            return a.v.r === other.r && a.v.g === other.g && a.v.b === other.b && a.v.a === other.a;
        }
        case "regex": {
            const other = b as typeof a;
            return a.pattern === other.pattern && a.ci === other.ci;
        }
        case "stringlist": {
            const other = (b as typeof a).v;
            return a.v.length === other.length && a.v.every((item, index) => item === other[index]);
        }
        case "list": {
            const other = (b as typeof a).v;
            return a.v.length === other.length && a.v.every((item, index) => variantEqual(item, other[index]));
        }
    }
}

function variantEqual(a: Value, b: Value): boolean {
    if (a.t === b.t) return strictEqual(a, b);
    const converted = convert(b, a.t);
    return converted ? strictEqual(a, converted) : false;
}

function equal(left: Value, right: Value): boolean {
    if (left.t === "string" && right.t === "string") return foldEqual(left.v, right.v);
    if (left.t === right.t) return strictEqual(left, right);
    const toLeft = convert(right, left.t);
    if (toLeft) return strictEqual(left, toLeft);
    const toRight = convert(left, right.t);
    return toRight ? strictEqual(toRight, right) : false;
}

function listContains(left: Value, right: Value): boolean {
    if (left.t === "stringlist") {
        const needle = toStringValue(right);
        return needle !== undefined && left.v.some((item) => foldEqual(item, needle));
    }
    if (left.t === "list") return left.v.some((item) => variantEqual(item, right));
    if (left.t === "string" && right.t === "string") return fold(left.v).includes(fold(right.v));
    return false;
}

function edge(left: Value, right: Value, fromStart: boolean): boolean {
    if (left.t === "stringlist") {
        const needle = toStringValue(right);
        const item = fromStart ? left.v[0] : left.v[left.v.length - 1];
        return needle !== undefined && item !== undefined && foldEqual(item, needle);
    }
    if (left.t === "list") {
        const item = fromStart ? left.v[0] : left.v[left.v.length - 1];
        return item !== undefined && variantEqual(item, right);
    }
    if (left.t === "string" && right.t === "string") {
        const subject = fold(left.v);
        const needle = fold(right.v);
        return fromStart ? subject.startsWith(needle) : subject.endsWith(needle);
    }
    return false;
}

function match(left: Value, right: Value): Value {
    if (left.t !== "string") return { t: "bool", v: false };
    if (right.t === "regex") return { t: "bool", v: !!right.v && right.v.test(left.v) };
    const isSpecifier = right.t === "list" && right.v.length === 2 && right.v[0].t === "regex" && right.v[1].t === "int";
    if (!isSpecifier) return { t: "bool", v: false };
    const [regexValue, indexValue] = right.v as [Extract<Value, { t: "regex" }>, Extract<Value, { t: "int" }>];
    if (!regexValue.v) return { t: "string", v: "" };
    const found = regexValue.v.exec(left.v);
    return { t: "string", v: found?.[indexValue.v] ?? "" };
}

export function compileRegex(pattern: string, caseInsensitive: boolean): RegExp | undefined {
    const flags = caseInsensitive ? "i" : "";
    try {
        return new RegExp(pattern, `${flags}u`);
    } catch {
        try {
            return new RegExp(pattern, flags);
        } catch {
            return undefined;
        }
    }
}

function arithmetic(op: string, a: number, b: number): number {
    switch (op) {
        case "MINUS":
            return wrap(a - b);
        case "MULTIPLY":
            return wrap(Math.imul(a, b));
        case "DIVIDE":
            return b === 0 ? 0 : wrap(Math.trunc(a / b));
        case "MOD":
            return b === 0 ? 0 : wrap(a % b);
        default:
            return wrap(a + b);
    }
}

function plus(left: Value, right: Value): Value {
    if (left.t === "string") {
        const text = concatString(right);
        if (text !== undefined) return { t: "string", v: left.v + text };
    }
    const a = toInt(left);
    const b = toInt(right);
    if (a !== undefined && b !== undefined) return { t: "int", v: wrap(a + b) };
    return { t: "int", v: 0 };
}

function binary(expression: Extract<Expression, { kind: "binary" }>, context: FilterContext): Value {
    const left = evaluate(expression.left, context);
    const right = evaluate(expression.right, context);
    switch (expression.op) {
        case "PLUS":
            return plus(left, right);
        case "MINUS":
        case "MULTIPLY":
        case "DIVIDE":
        case "MOD":
            return { t: "int", v: arithmetic(expression.op, toInt(left) ?? 0, toInt(right) ?? 0) };
        case "AND":
            return { t: "bool", v: !!toBool(left) && !!toBool(right) };
        case "OR":
            return { t: "bool", v: !!toBool(left) || !!toBool(right) };
        case "EQ":
            return { t: "bool", v: equal(left, right) };
        case "NEQ":
            return { t: "bool", v: !equal(left, right) };
        case "LT":
            return { t: "bool", v: (toInt(left) ?? 0) < (toInt(right) ?? 0) };
        case "GT":
            return { t: "bool", v: (toInt(left) ?? 0) > (toInt(right) ?? 0) };
        case "LTE":
            return { t: "bool", v: (toInt(left) ?? 0) <= (toInt(right) ?? 0) };
        case "GTE":
            return { t: "bool", v: (toInt(left) ?? 0) >= (toInt(right) ?? 0) };
        case "CONTAINS":
            return { t: "bool", v: listContains(left, right) };
        case "STARTS_WITH":
            return { t: "bool", v: edge(left, right, true) };
        case "ENDS_WITH":
            return { t: "bool", v: edge(left, right, false) };
        case "MATCH":
            return match(left, right);
        default:
            return { t: "bool", v: false };
    }
}

export function evaluate(expression: Expression, context: FilterContext): Value {
    switch (expression.kind) {
        case "int":
            return { t: "int", v: expression.value };
        case "string":
            return { t: "string", v: expression.value };
        case "identifier":
            return context[expression.name] ?? { t: "string", v: "" };
        case "regex":
            return { t: "regex", v: compileRegex(expression.pattern, expression.caseInsensitive), pattern: expression.pattern, ci: expression.caseInsensitive };
        case "list": {
            const items = expression.items.map((item) => evaluate(item, context));
            const strings = items.every((item) => item.t === "string");
            return strings ? { t: "stringlist", v: items.map((item) => (item as { v: string }).v) } : { t: "list", v: items };
        }
        case "not":
            return { t: "bool", v: !toBool(evaluate(expression.operand, context)) };
        case "binary":
            return binary(expression, context);
    }
}

export function truthy(value: Value): boolean {
    return !!toBool(value);
}
