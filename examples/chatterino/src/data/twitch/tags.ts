import type { IrcTags } from "../irc/message";
import type { EmoteOccurrence } from "../filters/ignores";

export type TwitchBadge = { key: string; value: string };

export function parseBadgeTag(tags: IrcTags, tagName = "badges"): TwitchBadge[] {
    const raw = tags[tagName];
    if (!raw) return [];
    const badges: TwitchBadge[] = [];
    for (const part of raw.split(",")) {
        const slash = part.indexOf("/");
        if (slash === -1) continue;
        badges.push({ key: part.slice(0, slash), value: part.slice(slash + 1) });
    }
    return badges;
}

export function parseBadgeInfoTag(tags: IrcTags): Map<string, string> {
    const info = new Map<string, string>();
    const raw = tags["badge-info"];
    if (!raw) return info;
    for (const part of raw.split(",")) {
        if (!part) continue;
        const slash = part.indexOf("/");
        if (slash === -1) info.set(part, "");
        else info.set(part.slice(0, slash), part.slice(slash + 1));
    }
    return info;
}

function codePointOffsets(content: string): number[] {
    const offsets: number[] = [];
    for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
        if (!isLowSurrogate) offsets.push(i);
    }
    return offsets;
}

export function parseTwitchEmotes(tags: IrcTags, content: string, messageOffset = 0): EmoteOccurrence[] {
    const raw = tags.emotes;
    if (!raw) return [];
    const offsets = codePointOffsets(content);
    const occurrences: EmoteOccurrence[] = [];
    for (const group of raw.split("/")) {
        const colon = group.indexOf(":");
        if (colon === -1) continue;
        const id = group.slice(0, colon);
        for (const range of group.slice(colon + 1).split(",")) {
            const [fromText, toText] = range.split("-");
            if (toText === undefined) break;
            const from = Number(fromText) - messageOffset;
            const to = Number(toText) - messageOffset;
            if (!(from >= 0) || from > to || to >= offsets.length) break;
            const start = offsets[from];
            const endStart = offsets[to];
            const endCode = content.charCodeAt(endStart);
            const isHighSurrogate = endCode >= 0xd800 && endCode <= 0xdbff;
            const end = isHighSurrogate ? endStart + 1 : endStart;
            occurrences.push({ start, end, id, name: content.slice(start, end + 1) });
        }
    }
    occurrences.sort((a, b) => a.start - b.start);
    return occurrences.filter((occurrence, index) => index === 0 || occurrence.start !== occurrences[index - 1].start);
}

export function messageTime(tags: IrcTags, fallback: number): number {
    if ("historical" in tags) {
        const received = Number(tags["rm-received-ts"]);
        if (Number.isFinite(received) && received > 0) return received;
        const sent = Number(tags["tmi-sent-ts"]);
        if (Number.isFinite(sent) && sent > 0) return sent;
    }
    const sent = Number(tags["tmi-sent-ts"]);
    if (Number.isFinite(sent) && sent > 0) return sent;
    const serverTime = tags.time ? Date.parse(tags.time) : NaN;
    return Number.isFinite(serverTime) ? serverTime : fallback;
}

export function isHistorical(tags: IrcTags): boolean {
    return "historical" in tags;
}
