import type { CustomCommand } from "../api";

export type CommandMessage = { login: string; id: string; text: string };

export type CommandVariables = {
    channelName: string;
    channelId?: string;
    isTwitchChannel: boolean;
    live?: { game?: string; title?: string };
    myId?: string;
    myName: string;
    message?: CommandMessage;
    context?: Record<string, string>;
};

const PLACEHOLDER = /(^|[^{])({{)*{(\d+\+?|([a-zA-Z.-]+)(?:;(.+?))?)}/g;

type Variable = (alt: string, vars: CommandVariables) => string;

const VARIABLES: Record<string, Variable> = {
    "channel.name": (_alt, vars) => vars.channelName,
    channel: (_alt, vars) => vars.channelName,
    "channel.id": (alt, vars) => (vars.isTwitchChannel ? vars.channelId ?? "" : alt),
    "stream.game": (alt, vars) => (vars.isTwitchChannel && vars.live ? vars.live.game ?? "" : alt),
    "stream.title": (alt, vars) => (vars.isTwitchChannel && vars.live ? vars.live.title ?? "" : alt),
    "my.id": (alt, vars) => vars.myId || alt,
    "my.name": (alt, vars) => vars.myName || alt,
    "user.name": (alt, vars) => vars.message?.login || alt,
    user: (alt, vars) => vars.message?.login || alt,
    "msg.id": (alt, vars) => vars.message?.id || alt,
    "msg-id": (alt, vars) => vars.message?.id || alt,
    "msg.text": (alt, vars) => vars.message?.text || alt,
    message: (alt, vars) => vars.message?.text || alt,
};

function variable(name: string, alt: string, raw: string, vars: CommandVariables): string {
    const contextValue = vars.context?.[name];
    if (contextValue !== undefined) return contextValue === "" ? alt : contextValue;
    const resolver = VARIABLES[name];
    if (resolver) return resolver(alt, vars);
    return `{${raw}}`;
}

export function expandCustomCommand(func: string, words: string[], vars: CommandVariables): string {
    let result = "";
    let lastCaptureEnd = 0;
    let offset = 0;
    while (offset <= func.length) {
        PLACEHOLDER.lastIndex = offset;
        const match = PLACEHOLDER.exec(func);
        if (!match) break;
        const start = match.index;
        result += func.slice(lastCaptureEnd, start + 1);
        lastCaptureEnd = start + match[0].length;
        offset = lastCaptureEnd - 1;
        const raw = match[3];
        const plus = raw.endsWith("+");
        const indexText = raw.replace("+", "");
        const isNumber = /^\d+$/.test(indexText);
        const wordIndex = isNumber ? Number(indexText) : 0;
        if (!isNumber || wordIndex === 0) {
            result += variable(match[4] ?? "", match[5] ?? "", raw, vars);
            continue;
        }
        if (words.length <= wordIndex) continue;
        result += plus ? words.slice(wordIndex).join(" ") : words[wordIndex];
    }
    result += func.slice(lastCaptureEnd);
    if (result.startsWith("{")) result = result.slice(1);
    return result.split("{{").join("{");
}

export function findCustomCommand(commands: CustomCommand[], trigger: string): CustomCommand | undefined {
    return commands.find((command) => command.trigger === trigger);
}

export function maxTriggerSpaces(commands: CustomCommand[]): number {
    return commands.reduce((max, command) => Math.max(max, command.trigger.split(" ").length - 1), 0);
}

export type CustomCommandResult = { kind: "none" } | { kind: "builtin"; text: string } | { kind: "raw"; text: string };

export function runCustomCommands(text: string, commands: CustomCommand[], vars: CommandVariables): CustomCommandResult {
    const words = text.split(" ").filter(Boolean);
    if (words.length === 0) return { kind: "none" };
    const direct = findCustomCommand(commands, words[0]);
    if (direct) return { kind: "builtin", text: expandCustomCommand(direct.command, words, vars) };
    const maxSpaces = maxTriggerSpaces(commands);
    for (let spaces = 1; spaces <= Math.min(maxSpaces, words.length - 1); spaces++) {
        const trigger = words.slice(0, spaces + 1).join(" ");
        const command = findCustomCommand(commands, trigger);
        if (command) return { kind: "raw", text: expandCustomCommand(command.command, words, vars) };
    }
    return { kind: "none" };
}

export function duplicateTriggers(commands: CustomCommand[]): Set<string> {
    const counts = new Map<string, number>();
    for (const command of commands) counts.set(command.trigger, (counts.get(command.trigger) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([trigger]) => trigger));
}
