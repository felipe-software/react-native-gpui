import { COMPARISONS, isOperator, MATH, OPERATOR_TEXT, tokenInfo, tokenize, type Token, type TokenType } from "./tokenizer";

export type Expression =
    | { kind: "int"; value: number }
    | { kind: "string"; value: string }
    | { kind: "identifier"; name: string }
    | { kind: "regex"; pattern: string; caseInsensitive: boolean }
    | { kind: "list"; items: Expression[] }
    | { kind: "binary"; op: TokenType; left: Expression; right: Expression }
    | { kind: "not"; operand: Expression };

export type ParseResult = { expression: Expression; error?: string };

const ZERO: Expression = { kind: "int", value: 0 };

function unescapeQuotes(text: string): string {
    return text.replace(/\\"/g, '"');
}

class Parser {
    private index = 0;
    private error: string | undefined;

    constructor(private readonly tokens: Token[]) {}

    parse(): ParseResult {
        const expression = this.parseExpression(true);
        return this.error ? { expression, error: this.error } : { expression };
    }

    private get hasNext(): boolean {
        return this.index < this.tokens.length;
    }

    private peek(): Token {
        return this.tokens[this.index];
    }

    private next(): Token {
        return this.tokens[this.index++];
    }

    private fail(message: string): void {
        if (this.error === undefined) this.error = message;
    }

    private parseExpression(top: boolean): Expression {
        let expression = this.parseAnd();
        while (this.hasNext && this.peek().type === "OR") {
            this.next();
            expression = { kind: "binary", op: "OR", left: expression, right: this.parseAnd() };
        }
        if (top && this.hasNext) this.fail(`Unexpected token at end: ${this.peek().text}`);
        return expression;
    }

    private parseAnd(): Expression {
        let expression = this.parseUnary();
        while (this.hasNext && this.peek().type === "AND") {
            this.next();
            expression = { kind: "binary", op: "AND", left: expression, right: this.parseUnary() };
        }
        return expression;
    }

    private parseUnary(): Expression {
        if (this.hasNext && this.peek().type === "NOT") {
            this.next();
            return { kind: "not", operand: this.parseCondition() };
        }
        return this.parseCondition();
    }

    private parseCondition(): Expression {
        let value = this.hasNext && this.peek().type === "LP" ? this.parseParens() : this.parseValue();
        while (this.hasNext) {
            const token = this.peek();
            if (COMPARISONS.includes(token.type)) {
                this.next();
                return { kind: "binary", op: token.type, left: value, right: this.parseValue() };
            }
            if (MATH.includes(token.type)) {
                this.next();
                value = { kind: "binary", op: token.type, left: value, right: this.parseValue() };
                continue;
            }
            if (token.type === "RP") break;
            if (!isOperator(token.type)) this.fail(`Expected an operator but got ${token.text} ${tokenInfo(token.type)}`);
            break;
        }
        return value;
    }

    private parseParens(): Expression {
        this.next();
        const expression = this.parseExpression(false);
        if (this.hasNext && this.peek().type === "RP") {
            this.next();
            return expression;
        }
        this.fail(this.hasNext ? `Missing closing parentheses: got ${this.peek().text}` : "Missing closing parentheses at end of statement");
        return expression;
    }

    private parseValue(): Expression {
        if (!this.hasNext) {
            this.fail("Unexpected end of statement");
            return ZERO;
        }
        const token = this.peek();
        switch (token.type) {
            case "INT":
                this.next();
                return { kind: "int", value: Number(token.text) };
            case "STRING":
                this.next();
                return { kind: "string", value: unescapeQuotes(token.text.slice(1, -1)) };
            case "IDENTIFIER":
                this.next();
                return { kind: "identifier", name: token.text };
            case "REGULAR_EXPRESSION": {
                this.next();
                const caseInsensitive = token.text.startsWith('ri"');
                const prefix = caseInsensitive ? 3 : 2;
                return { kind: "regex", pattern: unescapeQuotes(token.text.slice(prefix, -1)), caseInsensitive };
            }
            case "LP":
                return this.parseParens();
            case "LIST_START":
                return this.parseList();
            default:
                this.next();
                this.fail(`Expected value but got ${token.text} ${tokenInfo(token.type)}`);
                return ZERO;
        }
    }

    private parseList(): Expression {
        this.next();
        const items: Expression[] = [];
        let first = true;
        while (this.hasNext) {
            const token = this.peek();
            if (token.type === "LIST_END") {
                this.next();
                return { kind: "list", items };
            }
            if (token.type === "COMMA" && !first) {
                this.next();
                items.push(this.parseValue());
                continue;
            }
            if (first) {
                items.push(this.parseValue());
                first = false;
                continue;
            }
            break;
        }
        this.fail(this.hasNext ? `Missing closing list braces: got ${this.peek().text}` : "Missing closing list braces at end of statement");
        return { kind: "list", items: [] };
    }
}

export function parseExpression(text: string): ParseResult {
    return new Parser(tokenize(text)).parse();
}

function quote(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

export function filterString(expression: Expression): string {
    switch (expression.kind) {
        case "int":
            return String(expression.value);
        case "string":
            return quote(expression.value);
        case "identifier":
            return expression.name;
        case "regex":
            return `${expression.caseInsensitive ? "ri" : "r"}${quote(expression.pattern)}`;
        case "list":
            return `{${expression.items.map(filterString).join(", ")}}`;
        case "binary":
            return `(${filterString(expression.left)} ${OPERATOR_TEXT[expression.op] ?? ""} ${filterString(expression.right)})`;
        case "not":
            return `(!${filterString(expression.operand)})`;
    }
}
