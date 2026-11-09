import type { Account } from "../api";
import { HttpError, requestText, type FetchLike } from "../util/http";

const HELIX = "https://api.twitch.tv/helix";

export class HelixError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

function errorMessage(body: string, status: number): string {
    try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) return parsed.message;
    } catch {}
    return `HTTP ${status}`;
}

export class Helix {
    constructor(
        private readonly fetchFn: FetchLike,
        private readonly account: Account,
    ) {}

    async request<T>(
        method: string,
        path: string,
        query: Record<string, string | string[]>,
        body?: unknown,
    ): Promise<T | undefined> {
        const params = Object.entries(query)
            .flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((item) => [key, item]))
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");
        const url = `${HELIX}${path}${params ? `?${params}` : ""}`;
        const headers: Record<string, string> = {
            "Client-Id": this.account.clientId,
            Authorization: `Bearer ${this.account.token}`,
        };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        try {
            const text = await requestText(this.fetchFn, url, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return text ? (JSON.parse(text) as T) : undefined;
        } catch (error) {
            if (error instanceof HttpError && error.status > 0) {
                throw new HelixError(error.status, errorMessage(error.body, error.status));
            }
            throw new HelixError(0, String(error instanceof Error ? error.message : error));
        }
    }

    async userId(login: string): Promise<string | undefined> {
        const result = await this.request<{ data?: Array<{ id: string }> }>("GET", "/users", { login });
        return result?.data?.[0]?.id;
    }

    cheermotes(broadcasterId: string): Promise<unknown> {
        return this.request("GET", "/bits/cheermotes", { broadcaster_id: broadcasterId });
    }

    async users(query: { login?: string[]; id?: string[] }): Promise<HelixUser[]> {
        const params: Record<string, string[]> = {};
        if (query.login?.length) params.login = query.login;
        if (query.id?.length) params.id = query.id;
        const result = await this.request<{ data?: HelixUser[] }>("GET", "/users", params);
        return result?.data ?? [];
    }

    async streams(query: { userLogin?: string[]; userId?: string[] }): Promise<HelixStream[]> {
        const params: Record<string, string[] | string> = { first: "100" };
        if (query.userLogin?.length) params.user_login = query.userLogin;
        if (query.userId?.length) params.user_id = query.userId;
        const result = await this.request<{ data?: HelixStream[] }>("GET", "/streams", params);
        return result?.data ?? [];
    }

    async followerCount(broadcasterId: string): Promise<number | undefined> {
        const result = await this.request<{ total?: number }>("GET", "/channels/followers", { broadcaster_id: broadcasterId, first: "1" });
        return result?.total;
    }

    async globalBadges(): Promise<HelixBadgeSet[]> {
        const result = await this.request<{ data?: HelixBadgeSet[] }>("GET", "/chat/badges/global", {});
        return result?.data ?? [];
    }

    async channelBadges(broadcasterId: string): Promise<HelixBadgeSet[]> {
        const result = await this.request<{ data?: HelixBadgeSet[] }>("GET", "/chat/badges", { broadcaster_id: broadcasterId });
        return result?.data ?? [];
    }

    async userEmotes(userId: string): Promise<HelixUserEmote[]> {
        const emotes: HelixUserEmote[] = [];
        let after: string | undefined;
        for (let page = 0; page < 50; page++) {
            const query: Record<string, string> = { user_id: userId };
            if (after) query.after = after;
            const result = await this.request<{ data?: HelixUserEmote[]; pagination?: { cursor?: string } }>("GET", "/chat/emotes/user", query);
            emotes.push(...(result?.data ?? []));
            after = result?.pagination?.cursor;
            if (!after) break;
        }
        return emotes;
    }

    async blocks(userId: string): Promise<HelixBlock[]> {
        const blocks: HelixBlock[] = [];
        let after: string | undefined;
        for (let page = 0; page < 100; page++) {
            const query: Record<string, string> = { broadcaster_id: userId, first: "100" };
            if (after) query.after = after;
            const result = await this.request<{ data?: HelixBlock[]; pagination?: { cursor?: string } }>("GET", "/users/blocks", query);
            blocks.push(...(result?.data ?? []));
            after = result?.pagination?.cursor;
            if (!after) break;
        }
        return blocks;
    }

    async block(targetId: string): Promise<void> {
        await this.request("PUT", "/users/blocks", { target_user_id: targetId });
    }

    async unblock(targetId: string): Promise<void> {
        await this.request("DELETE", "/users/blocks", { target_user_id: targetId });
    }

    async sendWhisper(fromId: string, toId: string, message: string): Promise<void> {
        await this.request("POST", "/whispers", { from_user_id: fromId, to_user_id: toId }, { message });
    }

    async sendChatMessage(broadcasterId: string, senderId: string, message: string): Promise<HelixSentMessage | undefined> {
        const body = { broadcaster_id: broadcasterId, sender_id: senderId, message };
        const result = await this.request<{ data?: HelixSentMessage[] }>("POST", "/chat/messages", {}, body);
        return result?.data?.[0];
    }
}

export type HelixUser = {
    id: string;
    login: string;
    display_name?: string;
    profile_image_url?: string;
    created_at?: string;
    description?: string;
    broadcaster_type?: string;
};

export type HelixStream = {
    user_id: string;
    user_login: string;
    user_name?: string;
    game_name?: string;
    title?: string;
    viewer_count?: number;
    started_at?: string;
    type?: string;
};

export type HelixBadgeVersion = {
    id: string;
    image_url_1x?: string;
    image_url_2x?: string;
    image_url_4x?: string;
    title?: string;
    description?: string;
};

export type HelixBadgeSet = { set_id: string; versions?: HelixBadgeVersion[] };

export type HelixUserEmote = {
    id: string;
    name: string;
    emote_type?: string;
    emote_set_id?: string;
    owner_id?: string;
    format?: string[];
};

export type HelixBlock = { user_id: string; user_login: string; display_name?: string };

export type HelixSentMessage = { message_id?: string; is_sent?: boolean; drop_reason?: { code?: string; message?: string } | null };
