import type { Nickname, UsernameDisplayMode } from "../api";

export type NicknameMatcher = (usernameText: string) => string | undefined;

type CompiledNickname = { nickname: Nickname; regex?: RegExp; replacement: string };

const DOLLAR = /\$/g;
const QT_BACKREFERENCE = /\\(\d{1,2})/g;

function qtReplacement(replace: string): string {
    return replace.replace(DOLLAR, "$$$$").replace(QT_BACKREFERENCE, (_, group: string) => `$${group}`);
}

function compile(nickname: Nickname): CompiledNickname | undefined {
    if (!nickname.isRegex) return { nickname, replacement: nickname.replace };
    if (!nickname.name) return undefined;
    try {
        const flags = nickname.caseSensitive ? "gu" : "giu";
        return { nickname, regex: new RegExp(nickname.name, flags), replacement: qtReplacement(nickname.replace) };
    } catch {
        return undefined;
    }
}

function matchOne(entry: CompiledNickname, usernameText: string): string | undefined {
    if (entry.regex) {
        entry.regex.lastIndex = 0;
        const replaced = usernameText.replace(entry.regex, entry.replacement);
        return replaced !== usernameText ? replaced : undefined;
    }
    const { name, caseSensitive } = entry.nickname;
    const equal = caseSensitive ? name === usernameText : name.toLowerCase() === usernameText.toLowerCase();
    return equal ? entry.nickname.replace : undefined;
}

export function buildNicknameMatcher(nicknames: Nickname[]): NicknameMatcher {
    const compiled = nicknames.map(compile).filter((entry): entry is CompiledNickname => !!entry);
    if (compiled.length === 0) return () => undefined;
    return (usernameText) => {
        for (const entry of compiled) {
            const match = matchOne(entry, usernameText);
            if (match !== undefined) return match;
        }
        return undefined;
    };
}

export function stylizeName(
    username: string,
    localizedName: string | undefined,
    mode: UsernameDisplayMode,
    nickname: NicknameMatcher,
): string {
    let text = username;
    if (localizedName && mode === "localizedName") text = localizedName;
    if (localizedName && mode === "usernameAndLocalizedName") text = `${username}(${localizedName})`;
    return nickname(text) ?? text;
}
