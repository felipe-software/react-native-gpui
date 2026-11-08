import type { HighlightPhrase, HighlightUser, Settings } from "../api";

export const COLOR_SELF_HIGHLIGHT = "#7f3f497f";
export const COLOR_SUBSCRIPTION = "#c466ff64";
export const COLOR_REDEEMED = "#1c7e8d3c";
export const COLOR_FIRST_MESSAGE = "#487f3f3c";
export const COLOR_ELEVATED = "#ffae423c";
export const COLOR_THREAD = "#8f30183c";
export const COLOR_WATCH_STREAK = "#0082ff46";
export const COLOR_AUTOMOD = "#404040";
export const DEFAULT_HIGHLIGHT_COLOR = COLOR_SELF_HIGHLIGHT;

export type HighlightResult = {
    color?: string;
    playSound: boolean;
    alert: boolean;
    showInMentions: boolean;
};

export type HighlightInput = {
    senderLogin: string;
    content: string;
    isSubscription: boolean;
    isSubscribedThread: boolean;
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

function phraseCheck(phrase: HighlightPhrase): Check | undefined {
    const regex = compilePattern(phrase.pattern, phrase.isRegex, phrase.caseSensitive);
    if (!regex) return undefined;
    return (input, self) => {
        if (self || !regex.test(input.content)) return undefined;
        return {
            color: phrase.color ?? DEFAULT_HIGHLIGHT_COLOR,
            playSound: phrase.playSound,
            alert: phrase.alert,
            showInMentions: phrase.showInMentions,
        };
    };
}

function userCheck(user: HighlightUser): Check | undefined {
    const regex = compilePattern(user.login, false, false);
    if (!regex) return undefined;
    return (input) => {
        if (!regex.test(input.senderLogin)) return undefined;
        return {
            color: user.color ?? DEFAULT_HIGHLIGHT_COLOR,
            playSound: user.playSound,
            alert: user.alert,
            showInMentions: user.showInMentions,
        };
    };
}

function subscriptionCheck(): Check {
    return (input) => {
        if (!input.isSubscription) return undefined;
        return { color: COLOR_SUBSCRIPTION, playSound: false, alert: false, showInMentions: false };
    };
}

function threadCheck(): Check {
    return (input, self) => {
        if (!input.isSubscribedThread || self) return undefined;
        return { color: COLOR_THREAD, playSound: true, alert: true, showInMentions: true };
    };
}

export type HighlightChecker = {
    check(input: HighlightInput): HighlightResult | undefined;
};

function collect<T>(items: T[], make: (item: T) => Check | undefined): Check[] {
    const checks: Check[] = [];
    for (const item of items) {
        const check = make(item);
        if (check) checks.push(check);
    }
    return checks;
}

export function buildHighlightChecker(settings: Settings, currentLogin: string | undefined): HighlightChecker {
    const checks: Check[] = [subscriptionCheck()];
    const selfLogin = currentLogin?.toLowerCase();
    if (settings.highlightSelfMentions && selfLogin) {
        const selfPhrase = phraseCheck({
            pattern: selfLogin,
            isRegex: false,
            caseSensitive: false,
            color: COLOR_SELF_HIGHLIGHT,
            playSound: settings.mentionSound,
            alert: true,
            showInMentions: true,
        });
        if (selfPhrase) checks.push(selfPhrase);
    }
    checks.push(...collect(settings.highlightPhrases, phraseCheck));
    checks.push(...collect(settings.highlightUsers, userCheck));
    checks.push(threadCheck());
    return {
        check(input) {
            const self = !!selfLogin && input.senderLogin.toLowerCase() === selfLogin;
            let highlighted = false;
            const result: HighlightResult = { playSound: false, alert: false, showInMentions: false };
            for (const check of checks) {
                const outcome = check(input, self);
                if (!outcome) continue;
                highlighted = true;
                result.playSound ||= outcome.playSound;
                result.alert ||= outcome.alert;
                result.showInMentions ||= outcome.showInMentions;
                result.color ??= outcome.color;
            }
            return highlighted ? result : undefined;
        },
    };
}
