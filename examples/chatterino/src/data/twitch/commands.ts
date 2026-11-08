import { Helix, HelixError } from "./helix";

export type CommandContext = {
    helix: Helix;
    broadcasterId: string | undefined;
    selfId: string;
    channel: string;
};

export type ParsedCommand =
    | { kind: "irc"; text: string }
    | { kind: "helix"; run: (ctx: CommandContext) => Promise<string | undefined> }
    | { kind: "error"; message: string };

type Handler = (args: string[], rest: string) => ParsedCommand;

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

export function parseDuration(text: string, defaultUnit = 1): number | undefined {
    if (!text) return undefined;
    if (/^\d+$/.test(text)) return Number(text) * defaultUnit;
    const re = /(\d+)([smhdw])/gi;
    let total = 0;
    let consumed = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        total += Number(match[1]) * DURATION_UNITS[match[2].toLowerCase()];
        consumed += match[0].length;
    }
    return consumed === text.length && total > 0 ? total : undefined;
}

function stripAt(login: string): string {
    return login.replace(/^@/, "").replace(/,$/, "").toLowerCase();
}

async function requireUser(ctx: CommandContext, login: string): Promise<string> {
    const id = await ctx.helix.userId(login);
    if (!id) throw new HelixError(404, `Invalid username: ${login}`);
    return id;
}

function requireBroadcaster(ctx: CommandContext): string {
    if (!ctx.broadcasterId) throw new HelixError(0, "the channel is not loaded yet");
    return ctx.broadcasterId;
}

function helixCommand(verb: string, run: (ctx: CommandContext) => Promise<string | undefined>): ParsedCommand {
    return {
        kind: "helix",
        run: async (ctx) => {
            try {
                return await run(ctx);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to ${verb} - ${reason}`);
            }
        },
    };
}

function moderationQuery(ctx: CommandContext): Record<string, string> {
    return { broadcaster_id: requireBroadcaster(ctx), moderator_id: ctx.selfId };
}

function chatSettings(verb: string, body: Record<string, unknown>): ParsedCommand {
    return helixCommand(verb, async (ctx) => {
        await ctx.helix.request("PATCH", "/chat/settings", moderationQuery(ctx), body);
        return undefined;
    });
}

function usage(text: string): ParsedCommand {
    return { kind: "error", message: text };
}

const TIMEOUT_USAGE =
    'Usage: "/timeout <username> [duration][time unit] [reason]" - Temporarily prevent a user from chatting. Duration (optional, default=10 minutes) must be a positive integer; time unit (optional, default=s) must be one of s, m, h, d, w; maximum duration is 2 weeks. Combinations like 1d2h are also allowed. Reason is optional and will be shown to the target user and other moderators. Use "/untimeout" to remove a timeout.';

const handlers: Record<string, Handler> = {
    me: (_args, rest) => (rest ? { kind: "irc", text: `\u0001ACTION ${rest}\u0001` } : usage("Usage: /me <message>")),
    timeout: (args) => {
        const [user, durationText, ...reason] = args;
        if (!user) return usage(TIMEOUT_USAGE);
        const duration = durationText ? parseDuration(durationText) : 600;
        if (!duration) return usage(TIMEOUT_USAGE);
        return helixCommand("timeout user", async (ctx) => {
            const userId = await requireUser(ctx, stripAt(user));
            const data = { user_id: userId, duration, reason: reason.join(" ") };
            await ctx.helix.request("POST", "/moderation/bans", moderationQuery(ctx), { data });
            return undefined;
        });
    },
    ban: (args) => {
        const [user, ...reason] = args;
        if (!user) return usage('Usage: "/ban <username> [reason]" - Permanently prevent a user from chatting.');
        return helixCommand("ban user", async (ctx) => {
            const userId = await requireUser(ctx, stripAt(user));
            await ctx.helix.request("POST", "/moderation/bans", moderationQuery(ctx), { data: { user_id: userId, reason: reason.join(" ") } });
            return undefined;
        });
    },
    unban: (args) => {
        const [user] = args;
        if (!user) return usage('Usage: "/unban <username>" - Removes a ban on a user.');
        return helixCommand("unban user", async (ctx) => {
            const userId = await requireUser(ctx, stripAt(user));
            await ctx.helix.request("DELETE", "/moderation/bans", { ...moderationQuery(ctx), user_id: userId });
            return `You have unbanned ${stripAt(user)}.`;
        });
    },
    delete: (args) => {
        const [messageId] = args;
        if (!messageId) return usage("Usage: /delete <msg-id> - Deletes the specified message. Can't take more than one argument.");
        return helixCommand("delete message", async (ctx) => {
            await ctx.helix.request("DELETE", "/moderation/chat", { ...moderationQuery(ctx), message_id: messageId });
            return undefined;
        });
    },
    clear: () =>
        helixCommand("clear chat", async (ctx) => {
            await ctx.helix.request("DELETE", "/moderation/chat", moderationQuery(ctx));
            return undefined;
        }),
    slow: (args) => {
        const seconds = args[0] ? Number(args[0]) : 30;
        if (!Number.isInteger(seconds) || seconds < 3 || seconds > 120) {
            return usage('Usage: "/slow [duration]" - Enables slow mode (limit how often users may send messages). Duration (optional, default=30) must be a positive number of seconds. Use "slowoff" to disable.');
        }
        return chatSettings("update chat settings", { slow_mode: true, slow_mode_wait_time: seconds });
    },
    slowoff: () => chatSettings("update chat settings", { slow_mode: false }),
    followers: (args) => {
        const minutes = args[0] ? parseDuration(args[0], 60) : 0;
        if (minutes === undefined) return usage('Usage: "/followers [duration]" - Enables followers-only mode.');
        return chatSettings("update chat settings", { follower_mode: true, follower_mode_duration: Math.round(minutes / 60) });
    },
    followersoff: () => chatSettings("update chat settings", { follower_mode: false }),
    subscribers: () => chatSettings("update chat settings", { subscriber_mode: true }),
    subscribersoff: () => chatSettings("update chat settings", { subscriber_mode: false }),
    emoteonly: () => chatSettings("update chat settings", { emote_mode: true }),
    emoteonlyoff: () => chatSettings("update chat settings", { emote_mode: false }),
    uniquechat: () => chatSettings("update chat settings", { unique_chat_mode: true }),
    uniquechatoff: () => chatSettings("update chat settings", { unique_chat_mode: false }),
    announce: (_args, rest) => {
        if (!rest) return usage("Usage: /announce <message> - Call attention to your message with a highlight.");
        return helixCommand("send announcement", async (ctx) => {
            await ctx.helix.request("POST", "/chat/announcements", moderationQuery(ctx), { message: rest });
            return undefined;
        });
    },
    color: (args) => {
        const [color] = args;
        if (!color) return usage("Usage: /color <color> - Color must be one of Twitch's supported colors or a hex code (#000000) if you have Turbo or Prime.");
        return helixCommand("change color", async (ctx) => {
            await ctx.helix.request("PUT", "/chat/color", { user_id: ctx.selfId, color });
            return `Your color has been changed to ${color}.`;
        });
    },
    mod: (args) => userAction(args, "mod", "POST", "/moderation/moderators", (login) => `You have added ${login} as a moderator of this channel.`),
    unmod: (args) => userAction(args, "unmod", "DELETE", "/moderation/moderators", (login) => `You have removed ${login} as a moderator of this channel.`),
    vip: (args) => userAction(args, "vip", "POST", "/channels/vips", (login) => `You have added ${login} as a VIP of this channel.`),
    unvip: (args) => userAction(args, "unvip", "DELETE", "/channels/vips", (login) => `You have removed ${login} as a VIP of this channel.`),
    raid: (args) => {
        const [target] = args;
        if (!target) return usage('Usage: "/raid <username>" - Raid a user. Only the broadcaster can start a raid.');
        return helixCommand("start a raid", async (ctx) => {
            const targetId = await requireUser(ctx, stripAt(target));
            await ctx.helix.request("POST", "/raids", { from_broadcaster_id: requireBroadcaster(ctx), to_broadcaster_id: targetId });
            return `You started to raid ${stripAt(target)}.`;
        });
    },
    unraid: () =>
        helixCommand("cancel the raid", async (ctx) => {
            await ctx.helix.request("DELETE", "/raids", { broadcaster_id: requireBroadcaster(ctx) });
            return "You cancelled the raid.";
        }),
    w: (args) => {
        const [user, ...words] = args;
        if (!user || words.length === 0) return usage("Usage: /w <username> <message>");
        return helixCommand("send whisper", async (ctx) => {
            const userId = await requireUser(ctx, stripAt(user));
            await ctx.helix.request("POST", "/whispers", { from_user_id: ctx.selfId, to_user_id: userId }, { message: words.join(" ") });
            return `Whisper sent to ${stripAt(user)}.`;
        });
    },
};

handlers.untimeout = handlers.unban;
handlers.r9kbeta = handlers.uniquechat;
handlers.r9kbetaoff = handlers.uniquechatoff;

function userAction(
    args: string[],
    verb: string,
    method: string,
    path: string,
    success: (login: string) => string,
): ParsedCommand {
    const [user] = args;
    if (!user) return usage(`Usage: "/${verb} <username>"`);
    return helixCommand(`${verb} user`, async (ctx) => {
        const userId = await requireUser(ctx, stripAt(user));
        await ctx.helix.request(method, path, { broadcaster_id: requireBroadcaster(ctx), user_id: userId });
        return success(stripAt(user));
    });
}

export const COMMAND_NAMES = Object.keys(handlers)
    .map((name) => `/${name}`)
    .sort();

const UNKNOWN_COMMAND = /^(?:\.(?!\.|$)|\/)(?!me(?:\s|$)|\s)/i;

export function parseCommand(text: string): ParsedCommand {
    const isCommand = UNKNOWN_COMMAND.test(text) || /^[/.]me(\s|$)/i.test(text);
    if (!isCommand) return { kind: "irc", text };
    const body = text.slice(1);
    const space = body.indexOf(" ");
    const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
    const rest = space === -1 ? "" : body.slice(space + 1).trim();
    const handler = handlers[name];
    if (!handler) return { kind: "error", message: `${text.split(" ")[0]} is not a known command.` };
    return handler(rest ? rest.split(/\s+/) : [], rest);
}
