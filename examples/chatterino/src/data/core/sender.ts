import type { Account, SendResult, Settings } from "../api";
import type { ChatChannel } from "../channel/chat-channel";
import { emojiByShortCode } from "../emotes/emoji";
import { LINK_ACCOUNTS, makeSystemMessage } from "../messages/system";
import { parseCommand, type CommandContext } from "../twitch/commands";
import type { TwitchConnections } from "../twitch/connections";
import { runCustomCommands, type CommandVariables } from "../twitch/custom-commands";
import { Helix, HelixError } from "../twitch/helix";
import { SendRateLimiter } from "../twitch/ratelimit";
import type { FetchLike } from "../util/http";

const MAGIC_MESSAGE_SUFFIX = " ͏";
const LOGIN_REQUIRED = "You need to log in to send messages. You can link your Twitch account in the settings.";
const ANONYMOUS_NAME = "justinfan64537";

export type SenderTarget = { name: string; isTwitch: boolean; addSystemMessage(text: string): void; roomId?: string };

export type BlockOutcome = "ok" | "notFound" | "error";

export type SenderDeps = {
    fetch: FetchLike;
    connections: TwitchConnections;
    now: () => number;
    currentAccount: () => Account | undefined;
    settings: () => Settings;
    onWhisperSent: (target: string, text: string) => void;
    block: (login: string, block: boolean) => Promise<BlockOutcome>;
};

export function replaceEmojiShortCodes(text: string): string {
    return text.replace(/:([a-z0-9_+-]+):/gi, (match, code: string) => emojiByShortCode(code.toLowerCase())?.name ?? match);
}

function avoidDuplicate(prepared: string): string {
    const ignoreFirstSpace = prepared[0] === "/" || prepared[0] === ".";
    let spaceIndex = prepared.indexOf(" ");
    if (ignoreFirstSpace) spaceIndex = prepared.indexOf(" ", spaceIndex + 1);
    if (spaceIndex === -1) return prepared + MAGIC_MESSAGE_SUFFIX;
    return `${prepared.slice(0, spaceIndex)}  ${prepared.slice(spaceIndex + 1)}`;
}

function stripTarget(word: string): string {
    return word.replace(/^[@#]/, "").replace(/,$/, "");
}

function whisperError(error: unknown): string {
    if (!(error instanceof HelixError)) return "An unknown error has occurred.";
    const message = error.message;
    if (error.status === 400 && message.startsWith("A user cannot whisper themself")) return "You cannot whisper yourself.";
    if (error.status === 400 || error.status === 404) return message;
    if (error.status === 401 && message.startsWith("Missing scope")) return "Missing required scope. Re-login with your account and try again.";
    if (error.status === 401 && message.includes("verified phone number")) return message;
    if (error.status === 403 && message.startsWith("The recipient's settings prevent")) {
        return "The recipient doesn't allow whispers from strangers or you directly.";
    }
    if (error.status === 403) return "You don't have permission to perform that action.";
    if (error.status === 429) {
        return "You may only whisper a maximum of 40 unique recipients per day. Within the per day limit, you may whisper a maximum of 3 whispers per second and a maximum of 100 whispers per minute.";
    }
    return "An unknown error has occurred.";
}

export class Sender {
    private readonly rateLimiter: SendRateLimiter;
    private readonly lastSent = new Map<string, string>();

    constructor(private readonly deps: SenderDeps) {
        this.rateLimiter = new SendRateLimiter(deps.now);
    }

    variables(channel: SenderTarget, live?: { game?: string; title?: string }): CommandVariables {
        const account = this.deps.currentAccount();
        return {
            channelName: channel.name,
            channelId: channel.roomId,
            isTwitchChannel: channel.isTwitch,
            live,
            myId: account?.userId,
            myName: account?.login ?? ANONYMOUS_NAME,
        };
    }

    expand(channel: SenderTarget, text: string, live?: { game?: string; title?: string }): { text: string; raw: boolean } {
        const replaced = replaceEmojiShortCodes(text).replace(/\s+/g, " ").trim();
        const custom = runCustomCommands(replaced, this.deps.settings().commands, this.variables(channel, live));
        if (custom.kind === "none") return { text: replaced, raw: false };
        return { text: replaceEmojiShortCodes(custom.text).replace(/\s+/g, " ").trim(), raw: custom.kind === "raw" };
    }

    send(channel: ChatChannel, text: string): Promise<SendResult> {
        const live = channel.info().live;
        const expanded = this.expand({ name: channel.name, isTwitch: true, roomId: channel.info().roomId, addSystemMessage: (line) => channel.addSystemMessage(line) }, text, live?.live ? live : undefined);
        return this.sendExpanded(channel, expanded.text, expanded.raw);
    }

    sendExpanded(channel: ChatChannel, prepared: string, raw = false): Promise<SendResult> {
        if (!prepared) return Promise.resolve({ ok: false, reason: "The message is empty." });
        const local = raw ? undefined : this.localCommand(channel, prepared);
        if (local) return local;
        const account = this.deps.currentAccount();
        if (!account) return Promise.resolve(this.loginRequired(channel));
        const message = this.withDuplicateGuard(channel, prepared);
        const command = raw ? { kind: "irc" as const, text: message } : parseCommand(message);
        if (command.kind === "error") {
            channel.addSystemMessage(command.message);
            return Promise.resolve({ ok: false, reason: command.message });
        }
        if (command.kind === "helix") return this.runHelix(channel, account, command.run);
        const decision = this.rateLimiter.check(channel.highRateLimit);
        if (!decision.ok) {
            if (decision.announce) channel.addSystemMessage(decision.reason);
            return Promise.resolve({ ok: false, reason: decision.reason });
        }
        return this.deliver(channel, account, command.text).then((result) => {
            if (result.ok) this.lastSent.set(channel.name, prepared);
            return result;
        });
    }

    async whisper(target: SenderTarget, text: string): Promise<SendResult> {
        const words = text.split(" ").filter(Boolean);
        const fail = (reason: string): SendResult => {
            target.addSystemMessage(reason);
            return { ok: false, reason };
        };
        if (words.length < 3) return fail("Usage: /w <username> <message>");
        const account = this.deps.currentAccount();
        if (!account) return fail("You must be logged in to send a whisper!");
        const typed = words[1];
        const login = stripTarget(typed).toLowerCase();
        const body = words.slice(2).join(" ");
        const helix = new Helix(this.deps.fetch, account);
        let targetId: string | undefined;
        try {
            targetId = await helix.userId(login);
        } catch {
            targetId = undefined;
        }
        if (!targetId) return fail("No user matching that username.");
        try {
            await helix.sendWhisper(account.userId, targetId, body);
        } catch (error) {
            return fail(`Failed to send whisper - ${whisperError(error)}`);
        }
        this.deps.onWhisperSent(stripTarget(typed), body);
        return { ok: true };
    }

    private withDuplicateGuard(channel: ChatChannel, prepared: string): string {
        const allowDuplicates = this.deps.settings().allowDuplicateMessages;
        const isRepeat = prepared === this.lastSent.get(channel.name);
        if (!allowDuplicates || channel.highRateLimit || !isRepeat) return prepared;
        return avoidDuplicate(prepared);
    }

    private localCommand(channel: ChatChannel, text: string): Promise<SendResult> | undefined {
        const words = text.split(" ").filter(Boolean);
        const name = (words[0] ?? "").toLowerCase();
        const isCommand = name.startsWith("/") || name.startsWith(".");
        if (!isCommand) return undefined;
        const bare = name.slice(1);
        if (bare === "w") {
            return this.whisper({ name: channel.name, isTwitch: true, addSystemMessage: (line) => channel.addSystemMessage(line) }, text);
        }
        if (bare === "ignore" || bare === "unignore") {
            const renamed = bare === "ignore" ? "block" : "unblock";
            channel.addSystemMessage(`Ignore command has been renamed to /${renamed}, please use it from now on as /${bare} is going to be removed in the near future.`);
            return this.block(channel, renamed === "block", words[1]);
        }
        if (bare === "block" || bare === "unblock") return this.block(channel, bare === "block", words[1]);
        return undefined;
    }

    private async block(channel: ChatChannel, block: boolean, rawUser: string | undefined): Promise<SendResult> {
        const verb = block ? "block" : "unblock";
        const reply = (text: string, ok: boolean): SendResult => {
            channel.addSystemMessage(text);
            return ok ? { ok: true } : { ok: false, reason: text };
        };
        if (!rawUser) return reply(`Usage: /${verb} <user>`, false);
        if (!this.deps.currentAccount()) return reply(`You must be logged in to ${verb} someone!`, false);
        const user = stripTarget(rawUser);
        const outcome = await this.deps.block(user.toLowerCase(), block);
        if (outcome === "ok") return reply(`You successfully ${verb}ed user ${user}`, true);
        if (outcome === "notFound") return reply(`User ${user} couldn't be ${verb}ed, no user with that name found!`, false);
        return reply(`User ${user} couldn't be ${verb}ed, an unknown error occurred!`, false);
    }

    private async deliver(channel: ChatChannel, account: Account, text: string): Promise<SendResult> {
        const useHelix = this.deps.settings().chatSendProtocol === "helix";
        const roomId = channel.info().roomId;
        if (!useHelix || !roomId) return this.deps.connections.sendPrivmsg(channel.name, text);
        try {
            const sent = await new Helix(this.deps.fetch, account).sendChatMessage(roomId, account.userId, text);
            if (sent?.is_sent === false) {
                const reason = sent.drop_reason?.message ?? "Your message was not sent.";
                channel.addSystemMessage(reason);
                return { ok: false, reason };
            }
            return { ok: true };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            channel.addSystemMessage(reason);
            return { ok: false, reason };
        }
    }

    private async runHelix(
        channel: ChatChannel,
        account: Account,
        run: (ctx: CommandContext) => Promise<string | undefined>,
    ): Promise<SendResult> {
        try {
            const result = await run({
                helix: new Helix(this.deps.fetch, account),
                broadcasterId: channel.info().roomId,
                selfId: account.userId,
                channel: channel.name,
            });
            if (result) channel.addSystemMessage(result);
            return { ok: true };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            channel.addSystemMessage(reason);
            return { ok: false, reason };
        }
    }

    private loginRequired(channel: ChatChannel): SendResult {
        const message = makeSystemMessage(channel.name, "You need to log in to send messages. You can link your Twitch account");
        message.pieces.push({ kind: "text", text: "in the settings.", tint: "link", link: LINK_ACCOUNTS });
        message.text = LOGIN_REQUIRED;
        message.searchText = LOGIN_REQUIRED;
        channel.addMessage(message);
        return { ok: false, reason: LOGIN_REQUIRED };
    }
}
