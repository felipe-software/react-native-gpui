import { describe, expect, test } from "bun:test";
import { evaluate, type FilterContext } from "../filters/lang/evaluate";
import { checkFilterText, compileFilter, runFilter } from "../filters/lang/filter";
import { filterString, parseExpression } from "../filters/lang/parser";

const context: FilterContext = {
    "author.badges": { t: "stringlist", v: ["moderator", "subscriber"] },
    "author.color": { t: "color", v: { r: 255, g: 0, b: 0, a: 255 } },
    "author.name": { t: "string", v: "pajlada" },
    "flags.highlighted": { t: "bool", v: true },
    "flags.action": { t: "bool", v: false },
    "message.content": { t: "string", v: "hello 01 world" },
    "message.length": { t: "int", v: 14 },
};

function value(text: string) {
    const parsed = parseExpression(text);
    expect(parsed.error).toBeUndefined();
    return evaluate(parsed.expression, context);
}

describe("filter language", () => {
    test.each([
        ["", "Unexpected end of statement"],
        ["message.content contains", "Unexpected end of statement"],
        ["a && b", "Expected value but got a <unknown>"],
        ["not flags.highlighted", "Expected value but got not <unknown>"],
        ['author.name == "x" and flags.highlighted', "Unexpected token at end: and"],
        ["flags.highlighted &&!flags.action", "Expected an operator but got &&! <unknown>"],
        ['message.content = "x"', 'Expected an operator but got "x" <string>'],
        ["(flags.highlighted flags.action)", "Expected an operator but got flags.action <identifier>"],
        ["(message.length == 5 == 5)", "Missing closing parentheses: got =="],
        ["(flags.highlighted", "Missing closing parentheses at end of statement"],
        ["()", "Expected value but got ) <right parenthesis>"],
        ["flags.highlighted)", "Unexpected token at end: )"],
        ["! !flags.highlighted", "Expected value but got ! Not"],
        ["reward.cost == -1", "Expected value but got - Minus"],
        ['{"a" "b"} contains "a"', 'Missing closing list braces: got "b"'],
        ['{"a",} contains "a"', "Expected value but got } <list end>"],
        ["{", "Missing closing list braces at end of statement"],
        ["message.length <> 5", "Expected an operator but got <> <unknown>"],
    ])("syntax error for %p", (text, error) => {
        expect(parseExpression(text).error).toBe(error);
    });

    test("prints the parsed form like Chatterino", () => {
        expect(filterString(parseExpression("flags.highlighted && !flags.action || message.length > 5").expression)).toBe(
            "((flags.highlighted && (!flags.action)) || (message.length > 5))",
        );
        expect(filterString(parseExpression("1 + 2 * 3 == 9").expression)).toBe("(((1 + 2) * 3) == 9)");
        expect(filterString(parseExpression("((flags.highlighted))").expression)).toBe("flags.highlighted");
        expect(filterString(parseExpression('message.content match ri"a\\"b"').expression)).toBe('(message.content match ri"a\\"b")');
    });

    test("reports type errors with the failing node", () => {
        expect(checkFilterText('message.length < "5"')).toEqual({
            valid: false,
            message: "Parsing errors occurred:",
            detail: 'Can only perform comparisons with Ints\n\nProblem occurred here:\n(message.length < "5")',
        });
        expect(checkFilterText("message.content")).toEqual({
            valid: false,
            message: "Unexpected filter return type",
            detail: "Expected Bool but got String",
        });
        expect(checkFilterText('message.content contains "hello"')).toEqual({
            valid: true,
            message: "Filter is valid",
            detail: 'Parsed as:\n(message.content contains "hello")',
        });
    });

    test("evaluates like Chatterino", () => {
        expect(value("2 + 3 * 4")).toEqual({ t: "int", v: 20 });
        expect(value('"x" + flags.highlighted')).toEqual({ t: "string", v: "xtrue" });
        expect(value('"x" + author.color')).toEqual({ t: "string", v: "x#ff0000" });
        expect(value('author.badges contains "Moderator"')).toEqual({ t: "bool", v: true });
        expect(value('author.badges contains "mod"')).toEqual({ t: "bool", v: false });
        expect(value('message.content contains "WORLD"')).toEqual({ t: "bool", v: true });
        expect(value('(message.content match {r"(\\d+)", 1}) == "01"')).toEqual({ t: "bool", v: true });
        expect(value('flags.highlighted == "TRUE"')).toEqual({ t: "bool", v: true });
        expect(value('"TRUE" == flags.highlighted')).toEqual({ t: "bool", v: false });
        expect(value('author.color == "red"')).toEqual({ t: "bool", v: true });
        expect(value('message.length == " 14"')).toEqual({ t: "bool", v: true });
        expect(value("(0 - 7) / 2")).toEqual({ t: "int", v: -3 });
        expect(value("(0 - 7) % 3")).toEqual({ t: "int", v: -1 });
        expect(value("5 / 0")).toEqual({ t: "int", v: 0 });
    });

    test("a compiled record decides whether a message passes", () => {
        expect(runFilter(compileFilter('message.content contains "hello"'), context)).toBe(true);
        expect(runFilter(compileFilter('author.name == "forsen"'), context)).toBe(false);
        expect(runFilter(compileFilter("not valid"), context)).toBe(false);
    });
});
