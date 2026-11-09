import type { Channel } from "../../data/api";
import type { Core } from "./AppContext";

export type SpecialKind = "whispers" | "mentions" | "watching" | "live" | "automod";

export const SPECIAL_CHANNELS: Record<SpecialKind, string> = {
    whispers: "/whispers",
    mentions: "/mentions",
    watching: "/watching",
    live: "/live",
    automod: "/automod",
};

export function isSpecialChannel(name: string): boolean {
    return name.startsWith("/");
}

export function specialKindOf(name: string): SpecialKind | undefined {
    const entry = Object.entries(SPECIAL_CHANNELS).find(([, channel]) => channel === name);
    return entry?.[0] as SpecialKind | undefined;
}

export function specialChannel(core: Core, kind: SpecialKind): Channel | undefined {
    const candidate = (core as unknown as Record<string, unknown>)[kind];
    const looksLikeChannel = !!candidate && typeof (candidate as Channel).snapshot === "function" && typeof (candidate as Channel).subscribe === "function";
    return looksLikeChannel ? (candidate as Channel) : undefined;
}

export function supportsSpecial(core: Core, kind: SpecialKind): boolean {
    return !!specialChannel(core, kind);
}
