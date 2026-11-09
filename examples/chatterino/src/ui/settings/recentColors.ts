import type { Settings } from "../../data/api";
import { COLOR_SELF_HIGHLIGHT, COLOR_SUBSCRIPTION, COLOR_WATCH_STREAK } from "../../data/filters/highlights";

export function recentColors(settings: Settings): string[] {
    const colors = new Set<string>();
    for (const phrase of settings.highlightPhrases) if (phrase.color) colors.add(phrase.color);
    for (const user of settings.highlightUsers) if (user.color) colors.add(user.color);
    colors.add(settings.selfHighlightColor || COLOR_SELF_HIGHLIGHT);
    colors.add(settings.subHighlightColor || COLOR_SUBSCRIPTION);
    colors.add(settings.watchStreakHighlightColor || COLOR_WATCH_STREAK);
    colors.add(settings.whisperHighlightColor || COLOR_SELF_HIGHLIGHT);
    return [...colors];
}
