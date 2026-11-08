import type { IgnoredPhrase, Settings } from "../api";

export type EmoteOccurrence = { start: number; end: number; id: string; name: string };

type CompiledPhrase = { phrase: IgnoredPhrase; regex: RegExp | undefined };

export type IgnoreFilter = {
    isIgnoredUser(login: string): boolean;
    isBlocked(content: string): boolean;
    replace(content: string, emotes: EmoteOccurrence[]): { content: string; emotes: EmoteOccurrence[] };
};

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(phrase: IgnoredPhrase): CompiledPhrase {
    if (!phrase.pattern) return { phrase, regex: undefined };
    const source = phrase.isRegex ? phrase.pattern : escapeRegex(phrase.pattern);
    const flags = phrase.caseSensitive ? "gu" : "giu";
    try {
        return { phrase, regex: new RegExp(source, flags) };
    } catch {
        return { phrase, regex: undefined };
    }
}

function matches(compiled: CompiledPhrase, content: string): boolean {
    if (!compiled.regex) return false;
    compiled.regex.lastIndex = 0;
    return compiled.regex.test(content);
}

type MatchRange = { start: number; end: number; shift: number };

function overlaps(emote: EmoteOccurrence, range: MatchRange): boolean {
    return emote.start < range.end && emote.end >= range.start;
}

function shiftEmote(emote: EmoteOccurrence, ranges: MatchRange[]): EmoteOccurrence {
    let shift = 0;
    for (const range of ranges) {
        if (range.end <= emote.start) shift += range.shift;
    }
    return { ...emote, start: emote.start + shift, end: emote.end + shift };
}

function replaceOne(
    compiled: CompiledPhrase,
    content: string,
    emotes: EmoteOccurrence[],
): { content: string; emotes: EmoteOccurrence[] } {
    const regex = compiled.regex;
    if (!regex) return { content, emotes };
    const replacement = compiled.phrase.replaceWith ?? "";
    const ranges: MatchRange[] = [];
    let output = "";
    let lastIndex = 0;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        if (match[0].length === 0) {
            regex.lastIndex++;
            continue;
        }
        const start = match.index;
        const end = start + match[0].length;
        output += content.slice(lastIndex, start) + replacement;
        lastIndex = end;
        ranges.push({ start, end, shift: replacement.length - match[0].length });
    }
    if (ranges.length === 0) return { content, emotes };
    output += content.slice(lastIndex);
    const kept = emotes.filter((emote) => !ranges.some((range) => overlaps(emote, range)));
    return { content: output, emotes: kept.map((emote) => shiftEmote(emote, ranges)) };
}

export function buildIgnoreFilter(settings: Settings): IgnoreFilter {
    const users = new Set(settings.ignoredUsers.map((login) => login.toLowerCase()));
    const compiled = settings.ignoredPhrases.map(compile);
    const blockers = compiled.filter((entry) => entry.phrase.replaceWith === undefined);
    const replacers = compiled.filter((entry) => entry.phrase.replaceWith !== undefined);
    return {
        isIgnoredUser: (login) => users.has(login.toLowerCase()),
        isBlocked: (content) => content.length > 0 && blockers.some((entry) => matches(entry, content)),
        replace(content, emotes) {
            let state = { content, emotes };
            for (const entry of replacers) state = replaceOne(entry, state.content, state.emotes);
            return state;
        },
    };
}
