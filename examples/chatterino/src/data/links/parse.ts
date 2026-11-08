import { TLDS } from "./tlds";

export type ParsedLink = {
    protocol: string;
    host: string;
    rest: string;
    link: string;
    prefix: string;
    suffix: string;
};

let tldSet: Set<string> | undefined;

function isValidTld(tld: string): boolean {
    if (!tldSet) tldSet = new Set(TLDS.split(" "));
    return tldSet.has(tld.toLowerCase());
}

function isValidIpv4(host: string): boolean {
    const parts = host.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) < 256);
}

function startsWithPort(text: string): boolean {
    const limit = Math.min(5, text.length);
    for (let i = 0; i < limit; i++) {
        const char = text[i];
        const isTerminator = char === "/" || char === "?" || char === "#";
        if (i >= 1 && isTerminator) return true;
        if (char < "0" || char > "9") return false;
    }
    return true;
}

const LEADING_STRIP = new Set(["<", "*", "_", "~", "("]);
const TRAILING_STRIP = new Set([">", "?", "!", ".", ",", ":", "*", "~", ")"]);

function isValidDomainChar(char: string): boolean {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    return code >= 0x80 || isDigit || isUpper || isLower || char === "_" || char === "-" || char === ".";
}

function stripBounds(source: string): { start: number; end: number } {
    let start = 0;
    let end = source.length;
    while (start < end && LEADING_STRIP.has(source[start])) start++;
    while (end > start && TRAILING_STRIP.has(source[end - 1])) end--;
    return { start, end };
}

function protocolLength(link: string): number {
    if (link.length < 8 || link.slice(0, 4).toLowerCase() !== "http") return 0;
    let index = 4;
    if (link[index] === "s" || link[index] === "S") index++;
    if (link.slice(index, index + 3) !== "://") return 0;
    return index + 3;
}

function extendOverParens(source: string, restStart: number, linkEnd: number): number {
    let nesting = 0;
    let lastClose = linkEnd;
    for (let i = restStart; i < source.length; i++) {
        const char = source[i];
        if (char === "(") {
            nesting++;
            continue;
        }
        if (nesting !== 0 && char === ")") {
            nesting--;
            if (nesting === 0) lastClose = i + 1;
        }
    }
    return Math.max(linkEnd, lastClose);
}

export function parseLink(source: string): ParsedLink | undefined {
    const bounds = stripBounds(source);
    const link = source.slice(bounds.start, bounds.end);
    const protoLen = protocolLength(link);
    const remaining = link.slice(protoLen);
    let host = remaining;
    let restOffset = -1;
    let lastWasDot = true;
    let lastDotPos = -1;
    let dots = 0;
    for (let i = 0; i < remaining.length; i++) {
        const char = remaining[i];
        if (char === ".") {
            if (lastWasDot) return undefined;
            lastDotPos = i;
            lastWasDot = true;
            dots++;
        } else {
            lastWasDot = false;
        }
        if (char === ":") {
            host = remaining.slice(0, i);
            restOffset = i;
            if (!startsWithPort(remaining.slice(i + 1))) return undefined;
            break;
        }
        if (char === "/" || char === "?" || char === "#") {
            host = remaining.slice(0, i);
            restOffset = i;
            break;
        }
        if (!isValidDomainChar(char)) return undefined;
    }
    if (lastWasDot || lastDotPos <= 0) return undefined;
    const tld = host.slice(lastDotPos + 1);
    const validHost = (dots === 3 && isValidIpv4(host)) || isValidTld(tld);
    if (!validHost) return undefined;
    let linkEnd = bounds.end;
    const restStartInSource = restOffset === -1 ? -1 : bounds.start + protoLen + restOffset;
    const hasRest = restStartInSource !== -1 && restStartInSource < linkEnd;
    if (linkEnd !== source.length && hasRest) {
        linkEnd = extendOverParens(source, restStartInSource, linkEnd);
    }
    const fullLink = source.slice(bounds.start, linkEnd);
    const rest = restStartInSource === -1 ? "" : source.slice(restStartInSource, linkEnd);
    return {
        protocol: link.slice(0, protoLen),
        host,
        rest,
        link: fullLink,
        prefix: source.slice(0, bounds.start),
        suffix: source.slice(linkEnd),
    };
}

export function linkTarget(parsed: ParsedLink): string {
    return parsed.protocol ? parsed.link : `http://${parsed.link}`;
}

export function linkDisplayText(parsed: ParsedLink): string {
    return parsed.protocol + parsed.host.toLowerCase() + parsed.rest;
}
