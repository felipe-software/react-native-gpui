import type { LiveStatus, UserInfo } from "./api";
import { normalizeHexColor } from "./twitch/usercolor";
import { requestJson, type FetchLike } from "./util/http";

type IvrStream = {
    title?: string;
    createdAt?: string;
    viewersCount?: number;
    game?: { displayName?: string } | null;
};

export type IvrUser = {
    login: string;
    displayName?: string;
    id?: string;
    bio?: string | null;
    logo?: string | null;
    createdAt?: string | null;
    followers?: number | null;
    chatColor?: string | null;
    banned?: boolean;
    stream?: IvrStream | null;
};

function parseTime(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : undefined;
}

export function liveStatusOf(user: IvrUser): LiveStatus {
    const stream = user.stream;
    if (!stream) return { live: false };
    const status: LiveStatus = { live: true };
    if (stream.title) status.title = stream.title;
    if (stream.game?.displayName) status.game = stream.game.displayName;
    if (typeof stream.viewersCount === "number") status.viewers = stream.viewersCount;
    const startedAt = parseTime(stream.createdAt);
    if (startedAt !== undefined) status.startedAt = startedAt;
    return status;
}

export function userInfoOf(user: IvrUser): UserInfo {
    const info: UserInfo = { login: user.login.toLowerCase(), displayName: user.displayName || user.login };
    if (user.id) info.id = user.id;
    if (user.logo) info.avatarUrl = user.logo;
    if (user.bio) info.bio = user.bio;
    const created = parseTime(user.createdAt);
    if (created !== undefined) info.createdAt = created;
    if (typeof user.followers === "number") info.followers = user.followers;
    const color = normalizeHexColor(user.chatColor ?? undefined);
    if (color) info.color = color;
    if (typeof user.banned === "boolean") info.banned = user.banned;
    return info;
}

export async function fetchUsers(fetchFn: FetchLike, logins: string[]): Promise<IvrUser[]> {
    if (logins.length === 0) return [];
    const query = logins.map((login) => encodeURIComponent(login)).join(",");
    const result = await requestJson<IvrUser[] | IvrUser>(fetchFn, `https://api.ivr.fi/v2/twitch/user?login=${query}`);
    return Array.isArray(result) ? result : [result];
}

export async function fetchUserInfo(fetchFn: FetchLike, login: string): Promise<UserInfo> {
    const [user] = await fetchUsers(fetchFn, [login.toLowerCase()]);
    if (!user) throw new Error(`User ${login} does not exist.`);
    return userInfoOf(user);
}

export const LIVE_POLL_INTERVAL_MS = 60_000;
export const LIVE_BATCH_SIZE = 25;

type PronounDefinition = { subject?: string; object?: string; singular?: boolean };

let pronounDefinitions: Promise<Record<string, PronounDefinition>> | undefined;

function formatPronoun(main: PronounDefinition | undefined, alt: PronounDefinition | undefined): string | undefined {
    if (!main?.subject) return undefined;
    if (alt?.subject) return `${main.subject}/${alt.subject}`.toLowerCase();
    if (main.singular || !main.object) return main.subject.toLowerCase();
    return `${main.subject}/${main.object}`.toLowerCase();
}

export async function fetchPronouns(fetchFn: FetchLike, login: string): Promise<string | undefined> {
    pronounDefinitions ??= requestJson<Record<string, PronounDefinition>>(fetchFn, "https://api.pronouns.alejo.io/v1/pronouns").catch(() => {
        pronounDefinitions = undefined;
        return {};
    });
    const user = await requestJson<{ pronoun_id?: string; alt_pronoun_id?: string | null }>(
        fetchFn,
        `https://api.pronouns.alejo.io/v1/users/${encodeURIComponent(login.toLowerCase())}`,
    );
    const definitions = await pronounDefinitions;
    return formatPronoun(user.pronoun_id ? definitions[user.pronoun_id] : undefined, user.alt_pronoun_id ? definitions[user.alt_pronoun_id] : undefined);
}
