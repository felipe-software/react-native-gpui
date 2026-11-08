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
}
