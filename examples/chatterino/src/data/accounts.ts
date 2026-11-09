import type { Account, LoginCredentials } from "./api";
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

export const LOGIN_URL = "https://chatterino.com/client_login";

export function parseLoginInfo(text: string): LoginCredentials {
    const credentials: LoginCredentials = { username: "", userId: "", clientId: "", oauthToken: "" };
    for (const parameter of text.split(";")) {
        const parts = parameter.split("=");
        if (parts.length !== 2) continue;
        const [key, value] = parts;
        if (key === "oauth_token") credentials.oauthToken = value;
        else if (key === "client_id") credentials.clientId = value;
        else if (key === "username") credentials.username = value;
        else if (key === "user_id") credentials.userId = value;
    }
    return credentials;
}

export function credentialErrors(credentials: LoginCredentials): string[] {
    const errors: string[] = [];
    if (!credentials.userId) errors.push("Missing user ID");
    if (!credentials.username) errors.push("Missing username");
    if (!credentials.clientId) errors.push("Missing Client ID");
    if (!credentials.oauthToken) errors.push("Missing OAuth Token");
    return errors;
}

export function accountFromCredentials(credentials: LoginCredentials, scopes: string[] = []): Account {
    return {
        login: credentials.username.trim().toLowerCase(),
        userId: credentials.userId.trim(),
        clientId: credentials.clientId.trim(),
        token: normalizeToken(credentials.oauthToken),
        scopes,
    };
}

export async function fetchTokenScopes(fetchFn: FetchLike, token: string): Promise<string[] | undefined> {
    try {
        const response = await requestJson<ValidateResponse>(fetchFn, "https://id.twitch.tv/oauth2/validate", {
            headers: { Authorization: `OAuth ${token}` },
        });
        return response.scopes ?? [];
    } catch {
        return undefined;
    }
}
