import type { Account } from "./api";
import { HttpError, requestJson, type FetchLike } from "./util/http";

type ValidateResponse = {
    client_id?: string;
    login?: string;
    user_id?: string;
    scopes?: string[] | null;
    expires_in?: number;
};

export function normalizeToken(token: string): string {
    return token.trim().replace(/^oauth:/i, "");
}

export async function validateToken(fetchFn: FetchLike, rawToken: string): Promise<Account> {
    const token = normalizeToken(rawToken);
    if (!token) throw new Error("The token is empty.");
    let response: ValidateResponse;
    try {
        response = await requestJson<ValidateResponse>(fetchFn, "https://id.twitch.tv/oauth2/validate", {
            headers: { Authorization: `OAuth ${token}` },
        });
    } catch (error) {
        if (error instanceof HttpError && error.status === 401) throw new Error("The token is invalid or expired.");
        throw new Error(`Could not validate the token (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (!response.login || !response.user_id || !response.client_id) {
        throw new Error("Twitch did not return the account for this token.");
    }
    return {
        login: response.login.toLowerCase(),
        userId: response.user_id,
        clientId: response.client_id,
        token,
        scopes: response.scopes ?? [],
    };
}

export const CHAT_SCOPES = ["chat:read", "chat:edit"];

export function missingChatScopes(account: Account): string[] {
    const hasIrcScopes = CHAT_SCOPES.every((scope) => account.scopes.includes(scope));
    if (hasIrcScopes || account.scopes.includes("user:write:chat")) return [];
    return CHAT_SCOPES.filter((scope) => !account.scopes.includes(scope));
}
