import type { Settings } from "../../data/api";
import { DEFAULT_HOTKEYS } from "./hotkeyCatalog";
import { externalToolsItems } from "./externalToolsOptions";
import { filterGeneral } from "./generalFilter";
import { generalItems } from "./generalOptions";
import { HIGHLIGHT_TABS } from "./HighlightsPage";
import { defaultSoundLabel, HIGHLIGHT_LABELS } from "./highlightRows";
import { IGNORE_TABS } from "./IgnoresPage";
import { MODERATION_TABS } from "./ModerationPage";
import { NOTIFICATION_CHECKS, NOTIFICATION_TABS } from "./NotificationsPage";
import type { SettingsPageName } from "./settingsPages";
import { TIMESTAMP_FORMATS } from "./generalHelpers";

function contains(text: string | undefined, needle: string): boolean {
    return !!text && text.toLowerCase().includes(needle);
}

function anyMatch(texts: Array<string | undefined>, needle: string): boolean {
    return texts.some((text) => contains(text, needle));
}

const GENERAL_ITEMS = generalItems();

export function pageMatches(page: SettingsPageName, query: string, settings: Settings): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (contains(page, needle)) return true;
    switch (page) {
        case "General":
            return filterGeneral(GENERAL_ITEMS, query.trim()).any;
        case "External tools":
            return filterGeneral(externalToolsItems(false), query.trim()).any;
        case "Nicknames":
            return anyMatch(settings.nicknames.flatMap((entry) => [entry.name, entry.replace]), needle);
        case "Commands":
            return anyMatch(settings.commands.flatMap((entry) => [entry.trigger, entry.command]), needle);
        case "Filters":
            return anyMatch(settings.filters.flatMap((entry) => [entry.name, entry.filter]), needle);
        case "Hotkeys":
            return anyMatch(DEFAULT_HOTKEYS.map((entry) => entry.name), needle);
        case "Highlights":
            return anyMatch([...HIGHLIGHT_TABS, defaultSoundLabel(settings.pathHighlightSound), HIGHLIGHT_LABELS.alwaysPlay, HIGHLIGHT_LABELS.longAlerts], needle);
        case "Ignores":
            return anyMatch([...IGNORE_TABS, "Enable Twitch blocked users"], needle);
        case "Moderation":
            return anyMatch(
                [...MODERATION_TABS, "Enable logging", "Use Twitch's timestamps", "Only log channels listed below", "Store live stream logs as separate files", "Disable", ...TIMESTAMP_FORMATS],
                needle,
            );
        case "Live Notifications":
            return anyMatch([...NOTIFICATION_TABS, ...NOTIFICATION_CHECKS], needle);
        case "Plugins":
            return contains("Enable plugins", needle);
        default:
            return false;
    }
}
