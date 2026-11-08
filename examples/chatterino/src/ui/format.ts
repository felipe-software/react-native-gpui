import type { ChannelInfo, ChannelModes, LiveStatus } from "../data/api";

export function localizeNumber(value: number): string {
    return Math.trunc(value).toLocaleString("en-US");
}

export function formatDurationExact(totalSeconds: number): string {
    if (totalSeconds === 0) return "0s";
    let value = totalSeconds;
    if (value % 60 !== 0) return `${localizeNumber(value)}s`;
    value /= 60;
    if (value % 60 !== 0) return `${localizeNumber(value)}m`;
    value /= 60;
    if (value % 24 !== 0) return `${localizeNumber(value)}h`;
    return `${localizeNumber(value / 24)}d`;
}

export function roomModesText(modes: ChannelModes, hasModRights = false): string {
    const parts: string[] = [];
    if (modes.r9k) parts.push("r9k");
    if (modes.slowSeconds && modes.slowSeconds > 0) parts.push(`slow(${localizeNumber(modes.slowSeconds)})`);
    if (modes.emoteOnly) parts.push("emote");
    if (modes.subOnly) parts.push("sub");
    const followers = modes.followersOnlyMinutes;
    const followersOn = typeof followers === "number" && followers >= 0;
    if (followersOn) parts.push(followers === 0 ? "follow" : `follow(${formatDurationExact(followers * 60)})`);
    if (parts.length === 0) return hasModRights ? "none" : "";
    if (parts.length <= 2) return parts.join(", ");
    return `${parts.slice(0, 2).join(", ")},\n${parts.slice(2).join(", ")}`;
}

export function formatUptime(startedAt: number | undefined, now: number): string {
    if (startedAt === undefined) return "";
    const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function headerTitle(channel: string, info: ChannelInfo | undefined): string {
    if (!channel) return "<empty>";
    const name = info?.displayName || channel;
    return info?.live?.live ? `${name} (live)` : name;
}

export type LiveTooltip = { title?: string; game?: string; status: string; live: boolean };

export function liveTooltip(live: LiveStatus | undefined, now: number): LiveTooltip | undefined {
    if (!live) return undefined;
    if (!live.live) return { title: live.title, status: "Offline", live: false };
    const uptime = formatUptime(live.startedAt, now);
    const viewers = localizeNumber(live.viewers ?? 0);
    return { title: live.title, game: live.game, status: `Live for ${uptime} with ${viewers} viewers`, live: true };
}

export function formatDate(time: number): string {
    const date = new Date(time);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

function plural(count: number, unit: string): string {
    const suffix = count === 1 ? "" : "s";
    return `${count} ${unit}${suffix}`;
}

export function accountAge(created: number, now: number): string {
    const days = Math.max(0, Math.floor((now - created) / 86_400_000));
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const parts: string[] = [];
    if (years > 0) parts.push(plural(years, "year"));
    if (months > 0) parts.push(plural(months, "month"));
    if (parts.length === 0) parts.push(plural(days, "day"));
    return `${parts.join(", ")} ago`;
}
