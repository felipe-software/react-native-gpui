export type FetchResponse = {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
};

export type FetchCacheMode = "default" | "no-store" | "reload" | "no-cache" | "force-cache" | "only-if-cached";

export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string; cache?: FetchCacheMode };

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly body: string,
        readonly url: string,
    ) {
        super(status === 0 ? `network error (${url})` : `${status}`);
    }
}

export type RequestInit = FetchInit & { timeoutMs?: number };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, url: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new HttpError(0, "timeout", url)), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

export async function requestText(fetchFn: FetchLike, url: string, init: RequestInit = {}): Promise<string> {
    const { timeoutMs = 20_000, ...rest } = init;
    let response: FetchResponse;
    try {
        response = await withTimeout(fetchFn(url, rest), timeoutMs, url);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(0, String(error), url);
    }
    const body = await response.text();
    if (!response.ok) throw new HttpError(response.status, body, url);
    return body;
}

export function parseJsonBody<T>(body: string, url: string): T {
    try {
        return JSON.parse(body) as T;
    } catch {
        throw new HttpError(-1, body.slice(0, 200), url);
    }
}

export async function requestJson<T>(fetchFn: FetchLike, url: string, init: RequestInit = {}): Promise<T> {
    return parseJsonBody<T>(await requestText(fetchFn, url, init), url);
}

export type ResponseSource = "cache" | "network";

export type CachedRequest = { cached: Promise<boolean>; fresh: Promise<void> };

export function requestCachedJson(
    fetchFn: FetchLike,
    url: string,
    apply: (json: unknown, source: ResponseSource) => void,
    init: RequestInit = {},
): CachedRequest {
    let networkAnswered = false;
    let cachedBody: string | undefined;
    const cached = requestText(fetchFn, url, { ...init, cache: "only-if-cached" })
        .then((body) => {
            if (networkAnswered) return false;
            const json = parseJsonBody<unknown>(body, url);
            cachedBody = body;
            apply(json, "cache");
            return true;
        })
        .catch(() => false);
    const fresh = requestText(fetchFn, url, { ...init, cache: "reload" }).then((body) => {
        networkAnswered = true;
        if (body === cachedBody) return;
        apply(parseJsonBody<unknown>(body, url), "network");
    });
    return { cached, fresh };
}

export function isNotFound(error: unknown): boolean {
    return error instanceof HttpError && error.status === 404;
}

export function formatHttpError(error: unknown): string {
    if (error instanceof HttpError) {
        if (error.status === 0) return error.body === "timeout" ? "timeout" : "network error";
        if (error.status === -1) return "invalid JSON";
        return `${error.status}`;
    }
    return String(error);
}
