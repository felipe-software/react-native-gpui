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

export function createChatCore(options: ChatCoreOptions = {}): ChatCore & ChatCoreExtras {
    const platform = options.platform ?? platformHooksFrom(gpui as unknown as Record<string, unknown>);
    return createCore({ ...options, platform });
}
