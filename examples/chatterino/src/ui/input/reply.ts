export const MESSAGE_LIMIT = 500;

export type MessageOverflowMode = "highlight" | "prevent" | "allow";

function prefixOf(displayName: string): string {
    return `@${displayName}`;
}

export function textWithReplyPrefix(text: string, displayName: string): string {
    const prefix = prefixOf(displayName);
    let plain = text.trim();
    if (plain.startsWith(prefix)) {
        const next = plain[prefix.length];
        const hasMore = plain.length > prefix.length;
        if (!hasMore) plain = plain.slice(prefix.length);
        else if (next === "," || next === " ") plain = plain.slice(prefix.length + 1);
    }
    const separator = plain.length > 0 && !plain.startsWith(" ") ? " " : "";
    return `${prefix}${separator}${plain} `;
}

export function textWithoutReplyPrefix(text: string, displayName: string): string {
    const prefix = prefixOf(displayName);
    let plain = text.trim();
    if (plain.startsWith(prefix)) plain = plain.slice(prefix.length);
    return plain.trim();
}

export function keepsReplyPrefix(text: string, displayName: string): boolean {
    const prefix = prefixOf(displayName);
    if (!text.startsWith(prefix)) return false;
    return text.length === prefix.length || text[prefix.length] === " ";
}

export function replyBody(text: string, displayName: string): string {
    let body = text.slice(displayName.length + 1);
    if (body.startsWith(" ")) body = body.slice(1);
    return body.replace(/\n/g, " ");
}

export type OverflowSplit = { allowed: string; overflow: string };

export function splitAtLimit(text: string, limit = MESSAGE_LIMIT): OverflowSplit {
    return { allowed: text.slice(0, limit), overflow: text.slice(limit) };
}

export function applyOverflowMode(text: string, mode: MessageOverflowMode, limit = MESSAGE_LIMIT): string {
    if (mode !== "prevent" || text.length <= limit) return text;
    return text.slice(0, limit);
}
