import type { CheermoteSet } from "../emotes/cheermotes";
import type { Badge, Emote } from "../emotes/types";
import type { HighlightChecker } from "../filters/highlights";
import type { IgnoreFilter } from "../filters/ignores";
import type { ChatMessage } from "./model";

export type ChannelContext = {
    name: string;
    displayName(): string;
    lookupEmote(name: string): Emote | undefined;
    cheermotes(): CheermoteSet[];
    twitchBadge(setId: string, version: string): Badge | undefined;
    customModBadge(): Badge | undefined;
    customVipBadge(): Badge | undefined;
    userBadges(userId: string): Badge[];
    userColor(login: string): string | undefined;
    setUserColor(login: string, color: string): void;
    findMessage(id: string): ChatMessage | undefined;
    isThreadSubscribed(rootId: string): boolean;
    subscribeThread(rootId: string): void;
};

export type GlobalContext = {
    selfLogin?: string;
    ignores: IgnoreFilter;
    highlights: HighlightChecker;
    now(): number;
};
