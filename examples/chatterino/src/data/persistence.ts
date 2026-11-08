import type {
    Account,
    AccountsState,
    HighlightPhrase,
    HighlightUser,
    IgnoredPhrase,
    Settings,
    SplitNode,
    TabLayout,
    ThemeName,
    WindowLayout,
} from "./api";
import { defaultAccounts, defaultLayout, defaultSettings } from "./defaults";

export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
};

export const STORAGE_KEYS = {
    settings: "chatterino-gpui/v1/settings",
    layout: "chatterino-gpui/v1/layout",
    accounts: "chatterino-gpui/v1/accounts",
} as const;

const THEMES: ThemeName[] = ["white", "light", "dark", "black"];
const STREAMER_MODES: Settings["streamerMode"][] = ["off", "on", "auto"];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(storage: StorageLike, key: string): unknown {
    let raw: string | null;
    try {
        raw = storage.getItem(key);
    } catch {
        return undefined;
    }
    if (raw === null) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function pick<T>(value: unknown, fallback: T, valid: (value: unknown) => boolean): T {
    return valid(value) ? (value as T) : fallback;
}

const isBool = (value: unknown) => typeof value === "boolean";
const isString = (value: unknown) => typeof value === "string";
const isPositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

function sanitizeHighlightPhrase(value: unknown): HighlightPhrase | undefined {
    if (!isObject(value) || !isString(value.pattern) || !value.pattern) return undefined;
    const phrase: HighlightPhrase = {
        pattern: value.pattern as string,
        isRegex: value.isRegex === true,
        caseSensitive: value.caseSensitive === true,
        playSound: value.playSound === true,
        alert: value.alert === true,
        showInMentions: value.showInMentions !== false,
    };
    if (isString(value.color)) phrase.color = value.color as string;
    return phrase;
}

function sanitizeHighlightUser(value: unknown): HighlightUser | undefined {
    if (!isObject(value) || !isString(value.login) || !value.login) return undefined;
    const user: HighlightUser = {
        login: (value.login as string).toLowerCase(),
        playSound: value.playSound === true,
        alert: value.alert === true,
        showInMentions: value.showInMentions === true,
    };
    if (isString(value.color)) user.color = value.color as string;
    return user;
}

function sanitizeIgnoredPhrase(value: unknown): IgnoredPhrase | undefined {
    if (!isObject(value) || !isString(value.pattern) || !value.pattern) return undefined;
    const phrase: IgnoredPhrase = {
        pattern: value.pattern as string,
        isRegex: value.isRegex === true,
        caseSensitive: value.caseSensitive === true,
    };
    if (isString(value.replaceWith)) phrase.replaceWith = value.replaceWith as string;
    return phrase;
}

function sanitizeList<T>(value: unknown, sanitize: (entry: unknown) => T | undefined): T[] {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const entry of value) {
        const clean = sanitize(entry);
        if (clean !== undefined) out.push(clean);
    }
    return out;
}

export function sanitizeSettings(value: unknown): Settings {
    const defaults = defaultSettings();
    if (!isObject(value)) return defaults;
    const settings: Settings = {
        theme: pick(value.theme, defaults.theme, (theme) => THEMES.includes(theme as ThemeName)),
        fontSize: pick(value.fontSize, defaults.fontSize, isPositive),
        showTimestamps: pick(value.showTimestamps, defaults.showTimestamps, isBool),
        timestampFormat: pick(value.timestampFormat, defaults.timestampFormat, isString),
        showBadges: pick(value.showBadges, defaults.showBadges, isBool),
        emoteScale: pick(value.emoteScale, defaults.emoteScale, isPositive),
        animateEmotes: pick(value.animateEmotes, defaults.animateEmotes, isBool),
        showMessageSeparators: pick(value.showMessageSeparators, defaults.showMessageSeparators, isBool),
        alternateMessageBackground: pick(value.alternateMessageBackground, defaults.alternateMessageBackground, isBool),
        pauseChatOnHover: pick(value.pauseChatOnHover, defaults.pauseChatOnHover, isBool),
        loadHistoryOnJoin: pick(value.loadHistoryOnJoin, defaults.loadHistoryOnJoin, isBool),
        historyLimit: Math.round(pick(value.historyLimit, defaults.historyLimit, isPositive)),
        messageLimit: Math.round(pick(value.messageLimit, defaults.messageLimit, isPositive)),
        highlightSelfMentions: pick(value.highlightSelfMentions, defaults.highlightSelfMentions, isBool),
        highlightPhrases: sanitizeList(value.highlightPhrases, sanitizeHighlightPhrase),
        highlightUsers: sanitizeList(value.highlightUsers, sanitizeHighlightUser),
        ignoredUsers: sanitizeList(value.ignoredUsers, (login) =>
            isString(login) && login ? (login as string).toLowerCase() : undefined,
        ),
        ignoredPhrases: sanitizeList(value.ignoredPhrases, sanitizeIgnoredPhrase),
        mentionSound: pick(value.mentionSound, defaults.mentionSound, isBool),
        mentionNotification: pick(value.mentionNotification, defaults.mentionNotification, isBool),
        liveNotifications: pick(value.liveNotifications, defaults.liveNotifications, isBool),
        streamerMode: pick(value.streamerMode, defaults.streamerMode, (mode) =>
            STREAMER_MODES.includes(mode as Settings["streamerMode"]),
        ),
        showLinkPreviews: pick(value.showLinkPreviews, defaults.showLinkPreviews, isBool),
        showDeletedMessages: pick(value.showDeletedMessages, defaults.showDeletedMessages, isBool),
    };
    if (isString(value.fontFamily) && value.fontFamily) settings.fontFamily = value.fontFamily as string;
    return settings;
}

function sanitizeNode(value: unknown, ids: Set<string>): SplitNode | null {
    if (!isObject(value) || !isString(value.id) || ids.has(value.id as string)) return null;
    const id = value.id as string;
    if (value.type === "split") {
        if (!isString(value.channel)) return null;
        ids.add(id);
        return { type: "split", id, channel: (value.channel as string).trim().replace(/^#/, "").toLowerCase() };
    }
    if (value.type !== "container") return null;
    const direction = value.direction === "vertical" ? "vertical" : "horizontal";
    ids.add(id);
    const rawChildren = Array.isArray(value.children) ? value.children : [];
    const rawSizes = Array.isArray(value.sizes) ? value.sizes : [];
    const children: SplitNode[] = [];
    const sizes: number[] = [];
    rawChildren.forEach((child, index) => {
        const clean = sanitizeNode(child, ids);
        if (!clean) return;
        children.push(clean);
        const size = rawSizes[index];
        sizes.push(isPositive(size) ? (size as number) : 1);
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const total = sizes.reduce((sum, size) => sum + size, 0);
    return { type: "container", id, direction, children, sizes: sizes.map((size) => size / total) };
}

function firstSplitId(node: SplitNode | null): string | undefined {
    if (!node) return undefined;
    if (node.type === "split") return node.id;
    for (const child of node.children) {
        const found = firstSplitId(child);
        if (found) return found;
    }
    return undefined;
}

function containsSplit(node: SplitNode | null, id: string): boolean {
    if (!node) return false;
    if (node.type === "split") return node.id === id;
    return node.children.some((child) => containsSplit(child, id));
}

function sanitizeTab(value: unknown, ids: Set<string>): TabLayout | undefined {
    if (!isObject(value) || !isString(value.id) || ids.has(value.id as string)) return undefined;
    const id = value.id as string;
    ids.add(id);
    const root = sanitizeNode(value.root, ids);
    const tab: TabLayout = { id, root };
    if (isString(value.title) && value.title) tab.title = value.title as string;
    const focused = isOptionalString(value.focusedSplitId) ? (value.focusedSplitId as string | undefined) : undefined;
    const focusedSplitId = focused && containsSplit(root, focused) ? focused : firstSplitId(root);
    if (focusedSplitId) tab.focusedSplitId = focusedSplitId;
    return tab;
}

export function sanitizeLayout(value: unknown): WindowLayout {
    if (!isObject(value) || !Array.isArray(value.tabs)) return defaultLayout();
    const ids = new Set<string>();
    const tabs = sanitizeList(value.tabs, (tab) => sanitizeTab(tab, ids));
    if (tabs.length === 0) return defaultLayout();
    const selected = tabs.some((tab) => tab.id === value.selectedTabId) ? (value.selectedTabId as string) : tabs[0].id;
    return { tabs, selectedTabId: selected };
}

function sanitizeAccount(value: unknown): Account | undefined {
    if (!isObject(value)) return undefined;
    const fields = [value.login, value.userId, value.clientId, value.token];
    if (!fields.every((field) => isString(field) && field)) return undefined;
    return {
        login: (value.login as string).toLowerCase(),
        userId: value.userId as string,
        clientId: value.clientId as string,
        token: (value.token as string).replace(/^oauth:/, ""),
        scopes: sanitizeList(value.scopes, (scope) => (isString(scope) ? (scope as string) : undefined)),
    };
}

export function sanitizeAccounts(value: unknown): AccountsState {
    if (!isObject(value)) return defaultAccounts();
    const seen = new Set<string>();
    const accounts = sanitizeList(value.accounts, (entry) => {
        const account = sanitizeAccount(entry);
        if (!account || seen.has(account.login)) return undefined;
        seen.add(account.login);
        return account;
    });
    const current = isString(value.current) && seen.has((value.current as string).toLowerCase());
    const state: AccountsState = { accounts };
    if (current) state.current = (value.current as string).toLowerCase();
    return state;
}

export function loadSettings(storage: StorageLike): Settings {
    return sanitizeSettings(readJson(storage, STORAGE_KEYS.settings));
}

export function loadLayout(storage: StorageLike): WindowLayout {
    return sanitizeLayout(readJson(storage, STORAGE_KEYS.layout));
}

export function loadAccounts(storage: StorageLike): AccountsState {
    return sanitizeAccounts(readJson(storage, STORAGE_KEYS.accounts));
}

export function save(storage: StorageLike, key: string, value: unknown): void {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`failed to persist ${key}`, error);
    }
}

export function memoryStorage(): StorageLike {
    const data = new Map<string, string>();
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, String(value));
        },
        removeItem: (key) => {
            data.delete(key);
        },
    };
}
