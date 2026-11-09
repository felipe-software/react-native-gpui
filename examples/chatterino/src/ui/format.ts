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

export type HeaderTitleOptions = { uptime?: boolean; viewers?: boolean; game?: boolean; title?: boolean; filtered?: boolean };

export function headerTitle(channel: string, info: ChannelInfo | undefined, options: HeaderTitleOptions = {}, now = Date.now()): string {
    if (!channel) return "<empty>";
    let title = info?.displayName || channel;
    const live = info?.live;
    if (live?.live) {
        title += " (live)";
        if (options.uptime) title += ` - ${formatUptime(live.startedAt, now)}`;
        if (options.viewers) title += ` - ${localizeNumber(live.viewers ?? 0)}`;
        if (options.game && live.game) title += ` - ${live.game}`;
        if (options.title && live.title) title += ` - ${live.title.replace(/\s+/g, " ").trim()}`;
    }
    if (options.filtered) title += " - filtered";
    return title;
}

export type LiveTooltip = { title?: string; game?: string; status: string; live: boolean };

export function liveTooltip(live: LiveStatus | undefined, now: number): LiveTooltip | undefined {
    if (!live) return undefined;
    if (!live.live) return { title: live.title, status: "Offline", live: false };
    const uptime = formatUptime(live.startedAt, now);
    const viewers = localizeNumber(live.viewers ?? 0);
    return { title: live.title, game: live.game, status: `Live for ${uptime} with ${viewers} viewers`, live: true };
}

const THUMBNAIL_SIZES: Record<number, { width: number; height: number } | undefined> = {
    1: { width: 80, height: 45 },
    2: { width: 160, height: 90 },
    3: { width: 360, height: 203 },
};

const THUMBNAIL_MAX_AGE_MS = 5 * 60 * 1000;

export type StreamThumbnail = { url: string; width: number; height: number };

export function streamThumbnail(login: string, sizeSetting: number, now: number): StreamThumbnail | undefined {
    const size = THUMBNAIL_SIZES[sizeSetting];
    if (!size || !login) return undefined;
    const epoch = Math.floor(now / THUMBNAIL_MAX_AGE_MS);
    const url = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login.toLowerCase()}-${size.width}x${size.height}.jpg?t=${epoch}`;
    return { url, ...size };
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
