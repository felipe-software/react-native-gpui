export type FetchResponse = {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
};

export type FetchLike = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly body: string,
        readonly url: string,
    ) {
        super(status === 0 ? `network error (${url})` : `${status}`);
    }
}

export type RequestInit = { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number };

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

export async function requestJson<T>(fetchFn: FetchLike, url: string, init: RequestInit = {}): Promise<T> {
    const body = await requestText(fetchFn, url, init);
    try {
        return JSON.parse(body) as T;
    } catch {
        throw new HttpError(-1, body.slice(0, 200), url);
    }
}

export function formatHttpError(error: unknown): string {
    if (error instanceof HttpError) {
        if (error.status === 0) return error.body === "timeout" ? "timeout" : "network error";
        if (error.status === -1) return "invalid JSON";
        return `${error.status}`;
    }
    return String(error);
}
