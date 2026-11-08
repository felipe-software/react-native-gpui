import { TWITCH_EMOTE_SIZE_OUTLIERS } from "./twitch-sizes";
import type { Emote } from "./types";

const DEFAULT_SIZE = { width: 28, height: 28 };

let outliers: Map<string, { width: number; height: number }> | undefined;

function sizeOutliers(): Map<string, { width: number; height: number }> {
    if (outliers) return outliers;
    outliers = new Map();
    for (const entry of TWITCH_EMOTE_SIZE_OUTLIERS.split(" ")) {
        const [id, size] = entry.split(":");
        const [width, height] = size.split("x").map(Number);
        outliers.set(id, { width, height });
    }
    return outliers;
}

const ESCAPED_CODES: Record<string, string> = {
    "\\&gt\\;\\(": ">(",
    "\\&lt\\;3": "<3",
    "\\:-?(o|O)": ":O",
    "\\:-?(p|P)": ":P",
    "\\:-?[\\\\/]": ":/",
    "\\:-?[z|Z|\\|]": ":Z",
    "\\:-?\\(": ":(",
    "\\:-?\\)": ":)",
    "\\:-?D": ":D",
    "\\;-?(p|P)": ";P",
    "\\;-?\\)": ";)",
    "R-?\\)": "R)",
    "B-?\\)": "B)",
    "[oO](_|\\.)[oO]": "O_o",
};

export function cleanUpEmoteCode(code: string): string {
    return ESCAPED_CODES[code] ?? code;
}

export function twitchEmoteUrl(id: string, scale: "1.0" | "2.0" | "3.0"): string {
    return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${scale}`;
}

const cache = new Map<string, Emote>();

export function twitchEmote(id: string, rawName: string, scope: Emote["scope"] = "global"): Emote {
    const cached = cache.get(id);
    if (cached) return cached;
    const name = cleanUpEmoteCode(rawName);
    const size = sizeOutliers().get(id) ?? DEFAULT_SIZE;
    const emote: Emote = {
        id,
        name,
        url: twitchEmoteUrl(id, "1.0"),
        tooltipImage: twitchEmoteUrl(id, "3.0"),
        width: size.width,
        height: size.height,
        provider: "twitch",
        scope,
        tooltip: `${name}\nTwitch Emote`,
    };
    cache.set(id, emote);
    return emote;
}
