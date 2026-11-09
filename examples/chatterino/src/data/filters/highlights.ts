import type { BlacklistedUser, HighlightBadge, HighlightPhrase, HighlightUser, Settings } from "../api";
import { parseColor } from "../util/colors";

export const COLOR_SELF_HIGHLIGHT = "#7f3f497f";
export const COLOR_SELF_MESSAGE = "#0076dd73";
export const COLOR_SUBSCRIPTION = "#c466ff64";
export const COLOR_REDEEMED = "#1c7e8d3c";
export const COLOR_FIRST_MESSAGE = "#487f3f3c";
export const COLOR_ELEVATED = "#ffae423c";
export const COLOR_THREAD = "#8f30183c";
export const COLOR_WATCH_STREAK = "#0082ff46";
export const COLOR_AUTOMOD = "#404040";
export const DEFAULT_HIGHLIGHT_COLOR = COLOR_SELF_HIGHLIGHT;

export const HIGHLIGHT_COLOR_PRESETS = [
    "#4b7f6b64",
    "#697f3f64",
    "#3f537f64",
    "#487f3f64",
    "#1f8d2b73",
    "#1c7e8d5a",
    "#888d315a",
    "#8f30187f",
    "#1c8d755a",
    COLOR_SELF_HIGHLIGHT,
    COLOR_SUBSCRIPTION,
];

export type HighlightResult = {
    color?: string;
    playSound: boolean;
    alert: boolean;
    showInMentions: boolean;
    soundUrl?: string;
};

export type HighlightBadgeInput = { key: string; value: string };

export type HighlightInput = {
    senderLogin: string;
    content: string;
    isSubscription: boolean;
    isSubscribedThread: boolean;
    isReceivedWhisper?: boolean;
    isAutomod?: boolean;
    badges?: HighlightBadgeInput[];
};

type Check = (input: HighlightInput, self: boolean) => HighlightResult | undefined;

const BOUNDARY_START = "(?:\\b|\\s|^)";
const BOUNDARY_END = "(?:\\b|\\s|$)";

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compilePattern(pattern: string, isRegex: boolean, caseSensitive: boolean): RegExp | undefined {
    if (!pattern) return undefined;
    const source = isRegex ? pattern : BOUNDARY_START + escapeRegex(pattern) + BOUNDARY_END;
    const flags = caseSensitive ? "u" : "iu";
    try {
        return new RegExp(source, flags);
    } catch {
        return undefined;
    }
}

export function colorOr(value: string | undefined, fallback: string): string {
    return value && parseColor(value) ? value : fallback;
}

function soundOf(url: string | undefined): string | undefined {
    return url ? url : undefined;
}

function result(color: string | undefined, playSound: boolean, alert: boolean, showInMentions: boolean, soundUrl?: string): HighlightResult {
    const outcome: HighlightResult = { playSound, alert, showInMentions };
    if (color) outcome.color = color;
    if (soundUrl) outcome.soundUrl = soundUrl;
    return outcome;
}

function phraseCheck(phrase: HighlightPhrase): Check | undefined {
    const regex = compilePattern(phrase.pattern, phrase.isRegex, phrase.caseSensitive);
    if (!regex) return undefined;
    const color = colorOr(phrase.color, DEFAULT_HIGHLIGHT_COLOR);
    return (input, self) => {
        if (self || !regex.test(input.content)) return undefined;
        return result(color, phrase.playSound, phrase.alert, phrase.showInMentions, soundOf(phrase.soundUrl));
    };
}

function userCheck(user: HighlightUser): Check | undefined {
    const regex = compilePattern(user.login.trim(), !!user.isRegex, !!user.caseSensitive);
    if (!regex) return undefined;
    const color = colorOr(user.color, DEFAULT_HIGHLIGHT_COLOR);
    return (input) => {
        if (!regex.test(input.senderLogin)) return undefined;
        return result(color, user.playSound, user.alert, user.showInMentions, soundOf(user.soundUrl));
    };
}

export function badgeMatches(name: string, badge: HighlightBadgeInput): boolean {
    return name.split(",").some((id) => {
        const slash = id.indexOf("/");
        if (slash === -1) return id.toLowerCase() === badge.key.toLowerCase();
        const key = id.slice(0, slash);
        const value = id.slice(slash + 1);
        return key.toLowerCase() === badge.key.toLowerCase() && value.toLowerCase() === badge.value.toLowerCase();
    });
}

function badgeCheck(highlight: HighlightBadge): Check {
    const color = colorOr(highlight.color, DEFAULT_HIGHLIGHT_COLOR);
    return (input) => {
        const matched = (input.badges ?? []).some((badge) => badgeMatches(highlight.name, badge));
        if (!matched) return undefined;
        return result(color, highlight.playSound, highlight.alert, highlight.showInMentions, soundOf(highlight.soundUrl));
    };
}

export function isBlacklisted(entries: BlacklistedUser[], login: string): boolean {
    return entries.some((entry) => {
        if (!entry.pattern) return false;
        if (!entry.isRegex) return entry.pattern.toLowerCase() === login.toLowerCase();
        try {
            return new RegExp(entry.pattern, "iu").test(login);
        } catch {
            return false;
        }
    });
}

function subscriptionChecks(settings: Settings): Check[] {
    if (!settings.enableSubHighlight) return [];
    const color = colorOr(settings.subHighlightColor, COLOR_SUBSCRIPTION);
    const sound = soundOf(settings.subHighlightSoundUrl);
    return [
        (input) =>
            input.isSubscription
                ? result(color, settings.enableSubHighlightSound, settings.enableSubHighlightTaskbar, false, sound)
                : undefined,
    ];
}

function whisperChecks(settings: Settings): Check[] {
    if (!settings.enableWhisperHighlight) return [];
    const color = colorOr(settings.whisperHighlightColor, COLOR_SELF_HIGHLIGHT);
    const sound = soundOf(settings.whisperHighlightSoundUrl);
    return [
        (input) =>
            input.isReceivedWhisper
                ? result(color, settings.enableWhisperHighlightSound, settings.enableWhisperHighlightTaskbar, false, sound)
                : undefined,
    ];
}

function messageChecks(settings: Settings, selfLogin: string | undefined): Check[] {
    const checks: Check[] = [];
    if (settings.highlightSelfMentions && selfLogin) {
        const self = phraseCheck({
            pattern: selfLogin,
            isRegex: false,
            caseSensitive: false,
            color: colorOr(settings.selfHighlightColor, COLOR_SELF_HIGHLIGHT),
            playSound: settings.mentionSound,
            alert: settings.enableSelfHighlightTaskbar,
            showInMentions: settings.showSelfHighlightInMentions,
            soundUrl: settings.selfHighlightSoundUrl,
        });
        if (self) checks.push(self);
    }
    for (const phrase of settings.highlightPhrases) {
        const check = phraseCheck(phrase);
        if (check) checks.push(check);
    }
    if (settings.enableAutomodHighlight) {
        const color = colorOr(settings.automodHighlightColor, COLOR_AUTOMOD);
        const sound = soundOf(settings.automodHighlightSoundUrl);
        checks.push((input) =>
            input.isAutomod
                ? result(color, settings.enableAutomodHighlightSound, settings.enableAutomodHighlightTaskbar, false, sound)
                : undefined,
        );
    }
    return checks;
}

function userChecks(settings: Settings): Check[] {
    const checks: Check[] = [];
    if (settings.enableSelfMessageHighlight) {
        const color = colorOr(settings.selfMessageHighlightColor, COLOR_SELF_MESSAGE);
        const showInMentions = settings.showSelfMessageHighlightInMentions;
        checks.push((_input, self) => (self ? result(color, false, false, showInMentions) : undefined));
    }
    for (const user of settings.highlightUsers) {
        const check = userCheck(user);
        if (check) checks.push(check);
    }
    return checks;
}

function threadChecks(settings: Settings): Check[] {
    if (!settings.enableThreadHighlight) return [];
    const color = colorOr(settings.threadHighlightColor, COLOR_THREAD);
    const sound = soundOf(settings.threadHighlightSoundUrl);
    return [
        (input, self) =>
            input.isSubscribedThread && !self
                ? result(
                      color,
                      settings.enableThreadHighlightSound,
                      settings.enableThreadHighlightTaskbar,
                      settings.showThreadHighlightInMentions,
                      sound,
                  )
                : undefined,
    ];
}

export type HighlightChecker = {
    check(input: HighlightInput): HighlightResult | undefined;
};

export function buildHighlightChecker(settings: Settings, currentLogin: string | undefined): HighlightChecker {
    const selfLogin = currentLogin?.toLowerCase();
    const checks: Check[] = [
        ...subscriptionChecks(settings),
        ...whisperChecks(settings),
        ...messageChecks(settings, selfLogin),
        ...userChecks(settings),
        ...threadChecks(settings),
        ...settings.highlightBadges.map(badgeCheck),
    ];
    const blacklist = settings.blacklistedUsers;
    return {
        check(input) {
            if (isBlacklisted(blacklist, input.senderLogin)) return undefined;
            const self = !!selfLogin && input.senderLogin.toLowerCase() === selfLogin;
            let highlighted = false;
            const outcome: HighlightResult = { playSound: false, alert: false, showInMentions: false };
            for (const check of checks) {
                const matched = check(input, self);
                if (!matched) continue;
                highlighted = true;
                outcome.playSound ||= matched.playSound;
                outcome.alert ||= matched.alert;
                outcome.showInMentions ||= matched.showInMentions;
                outcome.color ??= matched.color;
                outcome.soundUrl ??= matched.soundUrl;
            }
            return highlighted ? outcome : undefined;
        },
    };
}
