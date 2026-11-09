export type TokenType =
    | "AND"
    | "OR"
    | "LP"
    | "RP"
    | "LIST_START"
    | "LIST_END"
    | "COMMA"
    | "EQ"
    | "NEQ"
    | "LT"
    | "GT"
    | "LTE"
    | "GTE"
    | "CONTAINS"
    | "STARTS_WITH"
    | "ENDS_WITH"
    | "MATCH"
    | "NOT"
    | "PLUS"
    | "MINUS"
    | "MULTIPLY"
    | "DIVIDE"
    | "MOD"
    | "STRING"
    | "INT"
    | "IDENTIFIER"
    | "REGULAR_EXPRESSION"
    | "NONE";

export type Token = { text: string; type: TokenType };

export type ValueType = "String" | "Int" | "Bool" | "Color" | "RegularExpression" | "List" | "StringList" | "MatchingSpecifier" | "Map";

export type VariableInfo = { type: ValueType; label: string };

export const VARIABLES: Record<string, VariableInfo> = {
    "author.badges": { type: "StringList", label: "author badges" },
    "author.color": { type: "Color", label: "author color" },
    "author.external_badges": { type: "StringList", label: "author external badges" },
    "author.name": { type: "String", label: "author name" },
    "author.no_color": { type: "Bool", label: "author has no color?" },
    "author.subbed": { type: "Bool", label: "author subscribed?" },
    "author.sub_length": { type: "Int", label: "author sub length" },
    "author.user_id": { type: "String", label: "author user id" },
    "channel.live": { type: "Bool", label: "channel live?" },
    "channel.name": { type: "String", label: "channel name" },
    "channel.watching": { type: "Bool", label: "/watching channel?" },
    "flags.action": { type: "Bool", label: "action/me message?" },
    "flags.automod": { type: "Bool", label: "automod message?" },
    "flags.cheer_message": { type: "Bool", label: "cheer message?" },
    "flags.elevated_message": { type: "Bool", label: "hype chat message?" },
    "flags.first_message": { type: "Bool", label: "first message?" },
    "flags.highlighted": { type: "Bool", label: "highlighted?" },
    "flags.hype_chat": { type: "Bool", label: "hype chat message?" },
    "flags.monitored": { type: "Bool", label: "monitored message?" },
    "flags.points_redeemed": { type: "Bool", label: "redeemed points?" },
    "flags.reply": { type: "Bool", label: "reply message?" },
    "flags.restricted": { type: "Bool", label: "restricted message?" },
    "flags.reward_message": { type: "Bool", label: "channel point reward message?" },
    "flags.shared": { type: "Bool", label: "shared message?" },
    "flags.similar": { type: "Bool", label: "r9k filtered message?" },
    "flags.sub_message": { type: "Bool", label: "sub/resub message?" },
    "flags.system_message": { type: "Bool", label: "system message?" },
    "flags.watch_streak": { type: "Bool", label: "watch streak message?" },
    "flags.whisper": { type: "Bool", label: "whisper message?" },
    "message.content": { type: "String", label: "message text" },
    "message.length": { type: "Int", label: "message length" },
    "reward.cost": { type: "Int", label: "point reward cost" },
    "reward.id": { type: "String", label: "point reward id" },
    "reward.title": { type: "String", label: "point reward title" },
};

const TOKEN_RE = /((r|ri)?")((\\")|[^"])*"|[\w.]+|(<=?|>=?|!=?|==|\|\||&&|\+|-|\*|\/|%)+|[()]|[{},]/g;

const FIXED: Record<string, TokenType> = {
    "&&": "AND",
    "||": "OR",
    "(": "LP",
    ")": "RP",
    "{": "LIST_START",
    "}": "LIST_END",
    ",": "COMMA",
    "==": "EQ",
    "!=": "NEQ",
    "<": "LT",
    ">": "GT",
    "<=": "LTE",
    ">=": "GTE",
    contains: "CONTAINS",
    startswith: "STARTS_WITH",
    endswith: "ENDS_WITH",
    match: "MATCH",
    "!": "NOT",
    "+": "PLUS",
    "-": "MINUS",
    "*": "MULTIPLY",
    "/": "DIVIDE",
    "%": "MOD",
};

const INFO: Partial<Record<TokenType, string>> = {
    AND: "And",
    OR: "Or",
    LP: "<left parenthesis>",
    RP: "<right parenthesis>",
    LIST_START: "<list start>",
    LIST_END: "<list end>",
    COMMA: "<comma>",
    PLUS: "Plus",
    MINUS: "Minus",
    MULTIPLY: "Multiply",
    DIVIDE: "Divide",
    MOD: "Mod",
    EQ: "Eq",
    NEQ: "NotEq",
    LT: "LessThan",
    GT: "GreaterThan",
    LTE: "LessThanEq",
    GTE: "GreaterThanEq",
    CONTAINS: "Contains",
    STARTS_WITH: "StartsWith",
    ENDS_WITH: "EndsWith",
    MATCH: "Match",
    NOT: "Not",
    STRING: "<string>",
    INT: "<int>",
    IDENTIFIER: "<identifier>",
};

export function tokenInfo(type: TokenType): string {
    return INFO[type] ?? "<unknown>";
}

const INT_MAX = 2147483647;

function classify(text: string): TokenType {
    const fixed = FIXED[text];
    if (fixed) return fixed;
    const isRegex = (text.startsWith('r"') || text.startsWith('ri"')) && text.endsWith('"') && text.length >= 3;
    if (isRegex) return "REGULAR_EXPRESSION";
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return "STRING";
    if (Object.prototype.hasOwnProperty.call(VARIABLES, text)) return "IDENTIFIER";
    if (/^\d+$/.test(text) && Number(text) <= INT_MAX) return "INT";
    return "NONE";
}

export function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(text)) !== null) {
        if (match[0].length === 0) {
            TOKEN_RE.lastIndex++;
            continue;
        }
        tokens.push({ text: match[0], type: classify(match[0]) });
    }
    return tokens;
}

export const COMPARISONS: TokenType[] = ["EQ", "NEQ", "LT", "GT", "LTE", "GTE", "CONTAINS", "STARTS_WITH", "ENDS_WITH", "MATCH"];
export const MATH: TokenType[] = ["PLUS", "MINUS", "MULTIPLY", "DIVIDE", "MOD"];

export function isOperator(type: TokenType): boolean {
    return COMPARISONS.includes(type) || MATH.includes(type) || type === "NOT" || type === "AND" || type === "OR";
}

export const OPERATOR_TEXT: Partial<Record<TokenType, string>> = {
    AND: "&&",
    OR: "||",
    EQ: "==",
    NEQ: "!=",
    LT: "<",
    GT: ">",
    LTE: "<=",
    GTE: ">=",
    CONTAINS: "contains",
    STARTS_WITH: "startswith",
    ENDS_WITH: "endswith",
    MATCH: "match",
    PLUS: "+",
    MINUS: "-",
    MULTIPLY: "*",
    DIVIDE: "/",
    MOD: "%",
};
