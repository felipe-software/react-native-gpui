export type IrcTags = Record<string, string>;

export type IrcMessage = {
    raw: string;
    tags: IrcTags;
    prefix: string;
    nick: string;
    command: string;
    params: string[];
};

const TAG_ESCAPES: Record<string, string> = {
    ":": ";",
    s: " ",
    "\\": "\\",
    r: "\r",
    n: "\n",
};

export function unescapeTagValue(value: string): string {
    if (!value.includes("\\")) return value;
    let out = "";
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char !== "\\") {
            out += char;
            continue;
        }
        const next = value[i + 1];
        i++;
        if (next === undefined) break;
        out += TAG_ESCAPES[next] ?? next;
    }
    return out;
}

function parseTags(raw: string): IrcTags {
    const tags: IrcTags = {};
    for (const part of raw.split(";")) {
        if (!part) continue;
        const eq = part.indexOf("=");
        if (eq === -1) {
            tags[part] = "";
            continue;
        }
        tags[part.slice(0, eq)] = unescapeTagValue(part.slice(eq + 1));
    }
    return tags;
}

function nickFromPrefix(prefix: string): string {
    const bang = prefix.indexOf("!");
    if (bang !== -1) return prefix.slice(0, bang);
    const at = prefix.indexOf("@");
    if (at !== -1) return prefix.slice(0, at);
    return prefix.includes(".") ? "" : prefix;
}

export function parseIrcLine(line: string): IrcMessage | undefined {
    let rest = line.replace(/[\r\n]+$/, "");
    if (!rest) return undefined;
    const raw = rest;
    let tags: IrcTags = {};
    if (rest.startsWith("@")) {
        const space = rest.indexOf(" ");
        if (space === -1) return undefined;
        tags = parseTags(rest.slice(1, space));
        rest = rest.slice(space + 1).trimStart();
    }
    let prefix = "";
    if (rest.startsWith(":")) {
        const space = rest.indexOf(" ");
        if (space === -1) return undefined;
        prefix = rest.slice(1, space);
        rest = rest.slice(space + 1).trimStart();
    }
    const params: string[] = [];
    const commandEnd = rest.indexOf(" ");
    const command = (commandEnd === -1 ? rest : rest.slice(0, commandEnd)).toUpperCase();
    rest = commandEnd === -1 ? "" : rest.slice(commandEnd + 1);
    while (rest.length > 0) {
        if (rest.startsWith(":")) {
            params.push(rest.slice(1));
            break;
        }
        const space = rest.indexOf(" ");
        if (space === -1) {
            params.push(rest);
            break;
        }
        params.push(rest.slice(0, space));
        rest = rest.slice(space + 1);
        while (rest.startsWith(" ")) rest = rest.slice(1);
    }
    if (!command) return undefined;
    return { raw, tags, prefix, nick: nickFromPrefix(prefix), command, params };
}

export function splitIrcPayload(payload: string): string[] {
    return payload.split(/\r?\n/).filter((line) => line.length > 0);
}

const ZERO_WIDTH_JOINER_ESCAPE = /\u{E0002}/gu;

export function unescapeZeroWidthJoiner(text: string): string {
    return text.replace(ZERO_WIDTH_JOINER_ESCAPE, "‍");
}

export function channelFromTarget(target: string | undefined): string | undefined {
    if (!target || !target.startsWith("#")) return undefined;
    const name = target.slice(1).toLowerCase();
    return name || undefined;
}

export function isAction(content: string): boolean {
    return content.startsWith("\u0001ACTION ") && content.endsWith("\u0001");
}

export function stripAction(content: string): string {
    return content.slice(8, -1);
}
