import type { Completion } from "./api";
import { emojiShortCodes } from "./emotes/emoji";
import { toEmoteInfo, type Emote } from "./emotes/types";

export type EmoteCandidate = { emote: Emote; provider: string };

export type UserCandidate = { login: string; displayName: string };

export type CompletionSources = {
    emotes: () => EmoteCandidate[];
    users: () => UserCandidate[];
    commands: () => string[];
    mentionWithComma: boolean;
    prefixOnly?: boolean;
    usersOnlyWithAt?: boolean;
};

const CHATTER_LIMIT = 2000;

export class RecentChatters {
    private readonly items = new Map<string, string>();

    add(displayName: string): void {
        const login = displayName.toLowerCase();
        this.items.delete(login);
        this.items.set(login, displayName);
        if (this.items.size > CHATTER_LIMIT) {
            const oldest = this.items.keys().next().value as string;
            this.items.delete(oldest);
        }
    }

    has(login: string): boolean {
        return this.items.has(login.toLowerCase());
    }

    all(): UserCandidate[] {
        return [...this.items.entries()].reverse().map(([login, displayName]) => ({ login, displayName }));
    }
}

function compareEmoteNames(a: string, b: string): number {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
    if (a === b) return 0;
    return a > b ? -1 : 1;
}

function emoteCompletions(query: string, sources: CompletionSources): Completion[] {
    const colonStart = query.startsWith(":");
    const normalized = (colonStart ? query.slice(1) : query).toLowerCase();
    const seen = new Set<string>();
    const results: Array<{ name: string; completion: Completion }> = [];
    for (const { emote, provider } of sources.emotes()) {
        const lowerName = emote.name.toLowerCase();
        const matches = sources.prefixOnly === false ? lowerName.includes(normalized) : lowerName.startsWith(normalized);
        if (!matches || seen.has(emote.name)) continue;
        seen.add(emote.name);
        results.push({
            name: emote.name,
            completion: { text: `${emote.name} `, display: `${emote.name} - ${provider}`, kind: "emote", emote: toEmoteInfo(emote) },
        });
    }
    if (colonStart) {
        for (const [shortCode, emote] of emojiShortCodes()) {
            if (!shortCode.startsWith(normalized)) continue;
            results.push({
                name: shortCode,
                completion: { text: `:${shortCode}: `, display: `${shortCode} - Emoji`, kind: "emote", emote: toEmoteInfo(emote) },
            });
        }
    }
    results.sort((a, b) => compareEmoteNames(a.name, b.name));
    return results.map((entry) => entry.completion);
}

function userCompletions(query: string, sources: CompletionSources, prependAt: boolean, isFirstWord: boolean): Completion[] {
    const lower = (query.startsWith("@") ? query.slice(1) : query).toLowerCase();
    const results: Completion[] = [];
    for (const user of sources.users()) {
        if (!user.login.startsWith(lower)) continue;
        const mention = isFirstWord && sources.mentionWithComma ? `${user.displayName},` : user.displayName;
        const text = prependAt ? `@${mention} ` : `${mention} `;
        results.push({ text, display: user.displayName, kind: "user" });
    }
    return results;
}

function commandCompletions(query: string, sources: CompletionSources): Completion[] {
    const prefix = query[0];
    const name = query.slice(1).toLowerCase();
    const results: Completion[] = [];
    for (const command of sources.commands()) {
        const bare = command.replace(/^[/.]/, "");
        if (!bare.toLowerCase().startsWith(name)) continue;
        results.push({ text: `${prefix}${bare} `, display: `${prefix}${bare}`, kind: "command" });
    }
    return results;
}

function dedupe(completions: Completion[]): Completion[] {
    const seen = new Set<string>();
    return completions.filter((completion) => {
        if (seen.has(completion.text)) return false;
        seen.add(completion.text);
        return true;
    });
}

export function complete(word: string, atStartOfMessage: boolean, sources: CompletionSources): Completion[] {
    if (word.length < 2) return [];
    if (word.startsWith("@")) return userCompletions(word, sources, true, atStartOfMessage);
    if (word.startsWith(":")) return emoteCompletions(word, sources);
    const isCommand = atStartOfMessage && (word.startsWith("/") || word.startsWith("."));
    if (isCommand) return commandCompletions(word, sources);
    const emotes = emoteCompletions(word, sources);
    const users = sources.usersOnlyWithAt ? [] : userCompletions(word, sources, false, atStartOfMessage);
    return dedupe([...emotes, ...users]);
}
