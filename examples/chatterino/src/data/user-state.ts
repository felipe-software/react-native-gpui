import type { Channel } from "./api";

export type ChannelRights = { moderator: boolean; vip: boolean; staff: boolean };

type Tags = Record<string, string | undefined>;
type UserStateMessage = { tags: Tags };
type UserStateHost = Channel & { handleUserState?: (message: UserStateMessage) => void };

type Watched = { rights: ChannelRights; listeners: Set<(rights: ChannelRights) => void> };

const NO_RIGHTS: ChannelRights = { moderator: false, vip: false, staff: false };
const watched = new WeakMap<object, Watched>();

function badgeKeys(tags: Tags): string[] {
    return (tags.badges ?? "")
        .split(",")
        .map((badge) => badge.split("/")[0])
        .filter(Boolean);
}

export function rightsFromUserState(tags: Tags): ChannelRights {
    const badges = badgeKeys(tags);
    return {
        moderator: tags.mod === "1" || badges.includes("moderator") || badges.includes("lead_moderator"),
        vip: badges.includes("vip"),
        staff: tags["user-type"] === "staff" || badges.includes("staff"),
    };
}

export function hasModRights(rights: ChannelRights, channel: string, login: string | undefined): boolean {
    if (!login) return false;
    const isBroadcaster = channel.toLowerCase() === login.toLowerCase();
    return isBroadcaster || rights.moderator;
}

function install(host: UserStateHost): Watched | undefined {
    const existing = watched.get(host);
    if (existing) return existing;
    const original = host.handleUserState;
    if (typeof original !== "function") return undefined;
    const entry: Watched = { rights: NO_RIGHTS, listeners: new Set() };
    host.handleUserState = (message: UserStateMessage) => {
        original.call(host, message);
        entry.rights = rightsFromUserState(message.tags ?? {});
        for (const listener of [...entry.listeners]) listener(entry.rights);
    };
    watched.set(host, entry);
    return entry;
}

export function channelRights(channel: Channel): ChannelRights {
    return watched.get(channel)?.rights ?? NO_RIGHTS;
}

export function watchChannelRights(channel: Channel, listener: (rights: ChannelRights) => void): () => void {
    const entry = install(channel as UserStateHost);
    if (!entry) return () => undefined;
    entry.listeners.add(listener);
    listener(entry.rights);
    return () => {
        entry.listeners.delete(listener);
    };
}
