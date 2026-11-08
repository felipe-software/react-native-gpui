const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

type Token = { kind: "field"; field: string } | { kind: "literal"; text: string };

const FIELD_RE = /^(hh|h|HH|H|mm|m|ss|s|zzz|z|AP|ap|A|a|t)/;

const tokenCache = new Map<string, Token[]>();

function tokenize(format: string): Token[] {
    const cached = tokenCache.get(format);
    if (cached) return cached;
    const tokens: Token[] = [];
    let index = 0;
    while (index < format.length) {
        const rest = format.slice(index);
        if (rest[0] === "'") {
            const close = format.indexOf("'", index + 1);
            const end = close === -1 ? format.length : close;
            const quoted = format.slice(index + 1, end);
            tokens.push({ kind: "literal", text: quoted === "" ? "'" : quoted });
            index = end + 1;
            continue;
        }
        const match = FIELD_RE.exec(rest);
        if (match) {
            tokens.push({ kind: "field", field: match[1] });
            index += match[1].length;
            continue;
        }
        tokens.push({ kind: "literal", text: rest[0] });
        index += 1;
    }
    tokenCache.set(format, tokens);
    return tokens;
}

function hasAmPm(tokens: Token[]): boolean {
    return tokens.some((token) => token.kind === "field" && /^(AP|ap|A|a)$/.test(token.field));
}

function pad(value: number, width: number): string {
    return String(value).padStart(width, "0");
}

function formatField(field: string, date: Date, twelveHour: boolean): string {
    const hours = date.getHours();
    const displayHours = twelveHour ? hours % 12 || 12 : hours;
    switch (field) {
        case "h":
            return String(displayHours);
        case "hh":
            return pad(displayHours, 2);
        case "H":
            return String(hours);
        case "HH":
            return pad(hours, 2);
        case "m":
            return String(date.getMinutes());
        case "mm":
            return pad(date.getMinutes(), 2);
        case "s":
            return String(date.getSeconds());
        case "ss":
            return pad(date.getSeconds(), 2);
        case "z":
            return String(date.getMilliseconds());
        case "zzz":
            return pad(date.getMilliseconds(), 3);
        case "AP":
        case "A":
            return hours < 12 ? "AM" : "PM";
        case "ap":
        case "a":
            return hours < 12 ? "am" : "pm";
        default:
            return "";
    }
}

export function formatTimestamp(timeMs: number, format: string): string {
    const date = new Date(timeMs);
    const tokens = tokenize(format || "h:mm");
    const twelveHour = hasAmPm(tokens);
    let out = "";
    for (const token of tokens) {
        out += token.kind === "literal" ? token.text : formatField(token.field, date, twelveHour);
    }
    return out;
}

export function formatLongDate(timeMs: number): string {
    const date = new Date(timeMs);
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function localDayKey(timeMs: number): string {
    const date = new Date(timeMs);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function startOfLocalDay(timeMs: number): number {
    const date = new Date(timeMs);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function formatDuration(totalSeconds: number, components = 4): string {
    const parts: string[] = [];
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);
    let remaining = components;
    const units: Array<[number, string]> = [
        [days, "d"],
        [hours, "h"],
        [minutes, "m"],
        [seconds, "s"],
    ];
    for (const [count, suffix] of units) {
        if (count > 0 && remaining > 0) {
            parts.push(`${count}${suffix}`);
            remaining -= 1;
        }
    }
    return parts.join(" ");
}
