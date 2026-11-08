import type { Account, SendResult } from "../api";
import type { ChatChannel } from "../channel/chat-channel";
import { emojiByShortCode } from "../emotes/emoji";
import { LINK_ACCOUNTS, makeSystemMessage } from "../messages/system";
import { parseCommand, type CommandContext } from "../twitch/commands";
import type { TwitchConnections } from "../twitch/connections";
import { Helix } from "../twitch/helix";
import { SendRateLimiter } from "../twitch/ratelimit";
import type { FetchLike } from "../util/http";

const MAGIC_MESSAGE_SUFFIX = " ͏";
const LOGIN_REQUIRED = "You need to log in to send messages. You can link your Twitch account in the settings.";

export type SenderDeps = {
    fetch: FetchLike;
    connections: TwitchConnections;
    now: () => number;
    currentAccount: () => Account | undefined;
};

function replaceEmojiShortCodes(text: string): string {
    return text.replace(/:([a-z0-9_+-]+):/gi, (match, code: string) => emojiByShortCode(code.toLowerCase())?.name ?? match);
}

function avoidDuplicate(prepared: string): string {
    const ignoreFirstSpace = prepared[0] === "/" || prepared[0] === ".";
    let spaceIndex = prepared.indexOf(" ");
    if (ignoreFirstSpace) spaceIndex = prepared.indexOf(" ", spaceIndex + 1);
    if (spaceIndex === -1) return prepared + MAGIC_MESSAGE_SUFFIX;
    return `${prepared.slice(0, spaceIndex)}  ${prepared.slice(spaceIndex + 1)}`;
}

export class Sender {
    private readonly rateLimiter: SendRateLimiter;
    private readonly lastSent = new Map<string, string>();

    constructor(private readonly deps: SenderDeps) {
        this.rateLimiter = new SendRateLimiter(deps.now);
    }

    async send(channel: ChatChannel, text: string): Promise<SendResult> {
        const account = this.deps.currentAccount();
        if (!account) return this.loginRequired(channel);
        const prepared = this.prepare(channel, text);
        if (!prepared) return { ok: false, reason: "The message is empty." };
        const command = parseCommand(prepared);
        if (command.kind === "error") {
            channel.addSystemMessage(command.message);
            return { ok: false, reason: command.message };
        }
        if (command.kind === "helix") return this.runHelix(channel, account, command.run);
        const decision = this.rateLimiter.check(channel.highRateLimit);
        if (!decision.ok) {
            if (decision.announce) channel.addSystemMessage(decision.reason);
            return { ok: false, reason: decision.reason };
        }
        const result = await this.deps.connections.sendPrivmsg(channel.name, command.text);
        if (result.ok) this.lastSent.set(channel.name, prepared);
        return result;
    }

    private prepare(channel: ChatChannel, text: string): string {
        const prepared = replaceEmojiShortCodes(text).replace(/\s+/g, " ").trim();
        if (!prepared || channel.highRateLimit) return prepared;
        return prepared === this.lastSent.get(channel.name) ? avoidDuplicate(prepared) : prepared;
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
