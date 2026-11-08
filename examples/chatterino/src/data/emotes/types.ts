import type { EmoteInfo } from "../api";

export type Emote = EmoteInfo & {
    id: string;
    tooltip: string;
    homePage?: string;
};

export type EmoteMap = Map<string, Emote>;

export type Badge = {
    key: string;
    name: string;
    url: string;
    width: number;
    height: number;
    tooltip: string;
    tooltipImage?: string;
    background?: string;
};

export function toEmoteInfo(emote: Emote): EmoteInfo {
    const info: EmoteInfo = {
        name: emote.name,
        url: emote.url,
        width: emote.width,
        height: emote.height,
        provider: emote.provider,
        scope: emote.scope,
    };
    if (emote.tooltipImage) info.tooltipImage = emote.tooltipImage;
    if (emote.zeroWidth) info.zeroWidth = true;
    if (emote.animated) info.animated = true;
    return info;
}
