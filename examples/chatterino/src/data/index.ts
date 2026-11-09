import * as gpui from "react-native-gpui";
import type { ChatCore } from "./api";
import { createChatCore as createCore, type ChatCoreExtras, type ChatCoreOptions } from "./core";
import { platformHooksFrom } from "./platform";

export type * from "./api";
export type { ChatCoreExtras, ChatCoreOptions } from "./core";
export type { PlatformHooks } from "./platform";
export { defaultLayout, defaultSettings } from "./defaults";
export { STORAGE_KEYS } from "./persistence";
export { themePalette, type ThemePalette } from "./theme";
export { LINK_ACCOUNTS, LINK_RECONNECT } from "./messages/system";
export { parseInternalLink, type InternalLink } from "./links/internal";
export { parseModerationLink } from "./twitch/moderation-actions";

function envValue(name: string): string | undefined {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const value = env?.[name];
    return value ? value : undefined;
}

export function createChatCore(options: ChatCoreOptions = {}): ChatCore & ChatCoreExtras {
    const platform = options.platform ?? platformHooksFrom(gpui as unknown as Record<string, unknown>);
    const ircUrl = options.ircUrl ?? envValue("CHATTERINO_IRC_URL");
    const recentMessagesUrl = options.recentMessagesUrl ?? envValue("CHATTERINO_RECENT_MESSAGES_URL");
    return createCore({ ...options, platform, ircUrl, recentMessagesUrl });
}
