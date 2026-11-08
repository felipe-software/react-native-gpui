let counter = 0;

export function newId(prefix: string): string {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export const MENTIONS_CHANNEL = "/mentions";
