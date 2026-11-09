import type { ChatMessage } from "../../messages/model";
import { parseColor } from "../../util/colors";
import type { FilterContext, Value } from "./evaluate";

export type ChannelState = { live: boolean; watching?: string };

function bool(value: boolean | undefined): Value {
    return { t: "bool", v: !!value };
}

function text(value: string | undefined): Value {
    return { t: "string", v: value ?? "" };
}

function externalBadge(key: string): string | undefined {
    if (key.startsWith("chatterino:")) return key;
    if (key.startsWith("ffz:")) return `frankerfacez:${key.slice(4)}`;
    if (key.startsWith("betterttv:")) return "betterttv:pro";
    if (key.startsWith("7tv:")) return key;
    return undefined;
}

function authorName(message: ChatMessage): string {
    if (message.flags.system) return "";
    if (message.localizedName) return message.login;
    return message.displayName;
}

function subLength(message: ChatMessage): number {
    const infos = message.badgeInfos ?? {};
    const value = infos.founder ?? infos.subscriber;
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function filterContext(message: ChatMessage, channel: ChannelState): FilterContext {
    const badges = (message.twitchBadges ?? []).map((badge) => badge.key);
    const external: string[] = [];
    for (const piece of message.pieces) {
        if (piece.kind !== "badge") continue;
        const key = externalBadge(piece.badge.key);
        if (key) external.push(key);
    }
    const color = parseColor(message.userColor);
    const { flags } = message;
    const content = message.text;
    return {
        "author.badges": { t: "stringlist", v: badges },
        "author.external_badges": { t: "stringlist", v: external },
        "author.color": { t: "color", v: color },
        "author.name": text(authorName(message)),
        "author.user_id": text(message.userId),
        "author.no_color": bool(!color),
        "author.subbed": bool(badges.includes("subscriber") || badges.includes("founder")),
        "author.sub_length": { t: "int", v: subLength(message) },
        "channel.name": text(flags.system ? "" : message.channel),
        "channel.watching": bool(!!channel.watching && channel.watching.toLowerCase() === message.channel.toLowerCase()),
        "channel.live": bool(channel.live),
        "flags.action": bool(flags.action),
        "flags.highlighted": bool(flags.highlighted),
        "flags.points_redeemed": bool(flags.redeemed && !message.rewardId),
        "flags.sub_message": bool(flags.subscription),
        "flags.system_message": bool(flags.system),
        "flags.reward_message": bool(!!message.rewardId),
        "flags.first_message": bool(flags.firstMessage),
        "flags.elevated_message": bool(flags.elevated),
        "flags.hype_chat": bool(flags.elevated),
        "flags.cheer_message": bool(flags.cheer),
        "flags.whisper": bool(flags.whisper),
        "flags.reply": bool(flags.reply),
        "flags.automod": bool(flags.automod),
        "flags.restricted": bool(false),
        "flags.monitored": bool(false),
        "flags.shared": bool(false),
        "flags.similar": bool(flags.similar),
        "flags.watch_streak": bool(flags.watchStreak),
        "message.content": text(content),
        "message.length": { t: "int", v: content.length },
        "reward.title": text(message.rewardTitle),
        "reward.cost": { t: "int", v: message.rewardCost ?? -1 },
        "reward.id": text(message.rewardId),
    };
}
