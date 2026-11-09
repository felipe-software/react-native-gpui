import type {
    Account,
    AccountsState,
    BlacklistedUser,
    CustomCommand,
    FilterRecord,
    HighlightBadge,
    HighlightPhrase,
    HighlightUser,
    HotkeyOverride,
    IgnoredPhrase,
    ModerationAction,
    Nickname,
    Settings,
    SplitLeaf,
    SplitNode,
    TabLayout,
    ThemeName,
    TimeoutButton,
    WindowLayout,
} from "./api";
import { DEFAULT_TIMEOUT_BUTTONS, defaultAccounts, defaultLayout, defaultSettings } from "./defaults";

export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
};

export const STORAGE_KEYS = {
    settings: "chatterino-gpui/v1/settings",
    layout: "chatterino-gpui/v1/layout",
    accounts: "chatterino-gpui/v1/accounts",
    roomIds: "chatterino-gpui/v1/room-ids",
} as const;

const ROOM_ID_LIMIT = 500;

const THEMES: readonly ThemeName[] = ["white", "light", "dark", "black"];
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
    if (isString(value.soundUrl) && value.soundUrl) phrase.soundUrl = value.soundUrl as string;
    return phrase;
}

function sanitizeHighlightUser(value: unknown): HighlightUser | undefined {
    if (!isObject(value) || !isString(value.login) || !value.login) return undefined;
    const user: HighlightUser = {
        login: value.isRegex === true ? (value.login as string) : (value.login as string).toLowerCase(),
        playSound: value.playSound === true,
        alert: value.alert === true,
        showInMentions: value.showInMentions === true,
    };
    if (isString(value.color)) user.color = value.color as string;
    if (value.isRegex === true) user.isRegex = true;
    if (value.caseSensitive === true) user.caseSensitive = true;
    if (isString(value.soundUrl) && value.soundUrl) user.soundUrl = value.soundUrl as string;
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
    if (isBool(value.isBlock)) phrase.isBlock = value.isBlock as boolean;
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

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
    darkSystemTheme: THEMES,
    lightSystemTheme: THEMES,
    tabDirection: ["top", "left", "right", "bottom"],
    tabStyle: ["normal", "compact"],
    pauseChatModifier: ["none", "shift", "control", "alt", "meta"],
    messageOverflow: ["highlight", "prevent", "allow"],
    usernameRightClickBehavior: ["reply", "mention", "ignore"],
    usernameRightClickModifierBehavior: ["reply", "mention", "ignore"],
    usernameRightClickModifier: ["shift", "control", "alt", "meta"],
    lastMessagePattern: ["solid", "dotted"],
    emotesTooltipPreview: ["dontShow", "alwaysShow", "showOnShift"],
    emoteTooltipScale: ["small", "medium", "large", "huge"],
    emojiSet: ["twitter", "facebook", "apple", "google"],
    soundBackend: ["miniaudio", "null"],
    usernameDisplayMode: ["username", "localizedName", "usernameAndLocalizedName"],
    showBlockedTermAutomodMessages: ["always", "never"],
    timeoutStackStyle: ["stack", "stackUntilTimeout", "dontStack"],
    chatSendProtocol: ["default", "irc", "helix"],
    showBlockedUsersMessages: ["never", "moderator", "broadcaster"],
    streamlinkQuality: ["choose", "source", "high", "medium", "low", "audioOnly"],
};

const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
    uiScale: [0.1, 10],
    fontWeight: [100, 900],
    mouseScrollMultiplier: [0.1, 10],
    collapseMessagesMinLines: [0, 100],
    deletedMessageLengthLimit: [0, 10_000],
    thumbnailSize: [0, 1000],
    thumbnailSizeStream: [0, 3],
    similarityPercentage: [0, 1],
    hideSimilarMaxDelay: [1, 600],
    hideSimilarMaxMessagesToCheck: [1, 100],
    overlayScaleFactor: [0.1, 10],
    overlayBackgroundOpacity: [0, 255],
    overlayShadowOpacity: [0, 255],
    overlayShadowRadius: [0, 40],
    overlayShadowOffsetX: [-20, 20],
    overlayShadowOffsetY: [-20, 20],
    boldScale: [0, 100],
    scrollbackUsercardLimit: [100, 100_000],
    pauseOnHoverDuration: [-1, 3600],
    nSpellCheckingSuggestions: [-1, 2_147_483_647],
};

const isTimeoutUnit = (value: unknown) => ["s", "m", "h", "d", "w"].includes(value as string);

function sanitizeHighlightBadge(value: unknown): HighlightBadge | undefined {
    if (!isObject(value) || !isString(value.name) || !value.name) return undefined;
    const badge: HighlightBadge = {
        name: value.name as string,
        displayName: isString(value.displayName) ? (value.displayName as string) : (value.name as string),
        showInMentions: value.showInMentions === true,
        alert: value.alert === true,
        playSound: value.playSound === true,
    };
    if (isString(value.soundUrl) && value.soundUrl) badge.soundUrl = value.soundUrl as string;
    if (isString(value.color) && value.color) badge.color = value.color as string;
    return badge;
}

function sanitizeBlacklisted(value: unknown): BlacklistedUser | undefined {
    if (!isObject(value) || !isString(value.pattern)) return undefined;
    return { pattern: value.pattern as string, isRegex: value.isRegex === true };
}

function sanitizeNickname(value: unknown): Nickname | undefined {
    if (!isObject(value) || !isString(value.name) || !isString(value.replace)) return undefined;
    return {
        name: value.name as string,
        replace: value.replace as string,
        isRegex: value.isRegex === true,
        caseSensitive: value.caseSensitive === true,
    };
}

function sanitizeCommand(value: unknown): CustomCommand | undefined {
    if (!isObject(value) || !isString(value.trigger) || !isString(value.command)) return undefined;
    return { trigger: value.trigger as string, command: value.command as string, showInMessageMenu: value.showInMessageMenu === true };
}

function sanitizeFilterRecord(value: unknown): FilterRecord | undefined {
    if (!isObject(value) || !isString(value.id) || !value.id || !isString(value.filter)) return undefined;
    return { id: value.id as string, name: isString(value.name) ? (value.name as string) : "", filter: value.filter as string };
}

function sanitizeModerationAction(value: unknown): ModerationAction | undefined {
    if (!isObject(value) || !isString(value.action)) return undefined;
    const action: ModerationAction = { action: value.action as string };
    if (isString(value.iconPath) && value.iconPath) action.iconPath = value.iconPath as string;
    return action;
}

function sanitizeTimeoutButton(value: unknown): TimeoutButton | undefined {
    if (!isObject(value) || !isTimeoutUnit(value.unit) || !isPositive(value.value)) return undefined;
    return { unit: value.unit as TimeoutButton["unit"], value: Math.min(99, Math.round(value.value as number)) };
}

function sanitizeHotkeyOverride(value: unknown): HotkeyOverride | undefined {
    if (!isObject(value) || !isString(value.id) || !isString(value.key)) return undefined;
    const override: HotkeyOverride = { id: value.id as string, key: value.key as string };
    if (value.removed === true) override.removed = true;
    if (isString(value.action) && value.action) override.action = value.action as string;
    const categories = ["Popup Windows", "Split", "Split input box", "Window"];
    if (categories.includes(value.category as string)) override.category = value.category as HotkeyOverride["category"];
    return override;
}

function sanitizeChannelName(value: unknown): string | undefined {
    if (!isString(value)) return undefined;
    const clean = (value as string).trim().replace(/^#/, "").toLowerCase();
    return clean || undefined;
}

const LISTS: Partial<Record<keyof Settings, (value: unknown) => unknown[]>> = {
    highlightPhrases: (value) => sanitizeList(value, sanitizeHighlightPhrase),
    highlightUsers: (value) => sanitizeList(value, sanitizeHighlightUser),
    ignoredUsers: (value) => sanitizeList(value, (login) => (isString(login) && login ? (login as string).toLowerCase() : undefined)),
    ignoredPhrases: (value) => sanitizeList(value, sanitizeIgnoredPhrase),
    nicknames: (value) => sanitizeList(value, sanitizeNickname),
    commands: (value) => sanitizeList(value, sanitizeCommand),
    highlightBadges: (value) => sanitizeList(value, sanitizeHighlightBadge),
    blacklistedUsers: (value) => sanitizeList(value, sanitizeBlacklisted),
    mutedChannels: (value) => sanitizeList(value, sanitizeChannelName),
    filters: (value) => sanitizeList(value, sanitizeFilterRecord),
    hotkeyOverrides: (value) => sanitizeList(value, sanitizeHotkeyOverride),
    loggedChannels: (value) => sanitizeList(value, sanitizeChannelName),
    moderationActions: (value) => sanitizeList(value, sanitizeModerationAction),
    notificationChannels: (value) => sanitizeList(value, sanitizeChannelName),
};

const POSITIVE_INTEGERS = new Set<keyof Settings>(["historyLimit", "messageLimit"]);

function sanitizeField(key: keyof Settings, value: unknown, fallback: unknown): unknown {
    if (value === undefined) return fallback;
    const list = LISTS[key];
    if (list) return Array.isArray(value) ? list(value) : fallback;
    if (key === "timeoutButtons") {
        const buttons = Array.isArray(value) ? sanitizeList(value, sanitizeTimeoutButton) : [];
        return buttons.length === DEFAULT_TIMEOUT_BUTTONS.length ? buttons : fallback;
    }
    if (key === "theme") return THEMES.includes(value as ThemeName) ? value : fallback;
    if (key === "streamerMode") return STREAMER_MODES.includes(value as Settings["streamerMode"]) ? value : fallback;
    const allowed = ENUMS[key];
    if (allowed) return allowed.includes(value as string) ? value : fallback;
    if (typeof fallback === "boolean") return isBool(value) ? value : fallback;
    if (typeof fallback === "string") return isString(value) ? value : fallback;
    if (typeof fallback === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
        if (POSITIVE_INTEGERS.has(key)) return value > 0 ? Math.round(value) : fallback;
        if (key === "fontSize" || key === "emoteScale") return value > 0 ? value : fallback;
        const range = RANGES[key];
        if (!range) return value;
        return Math.min(range[1], Math.max(range[0], value));
    }
    return fallback;
}

function migrateLegacy(value: Json, settings: Settings): void {
    const hasDuration = typeof value.pauseOnHoverDuration === "number";
    if (!hasDuration && value.pauseChatOnHover === true) settings.pauseOnHoverDuration = -1;
    settings.pauseChatOnHover = settings.pauseOnHoverDuration !== 0;
    if (value.showBadges === false && value.showBadgesVanity === undefined) {
        settings.showBadges = true;
        settings.showBadgesGlobalAuthority = false;
        settings.showBadgesPredictions = false;
        settings.showBadgesChannelAuthority = false;
        settings.showBadgesSubscription = false;
        settings.showBadgesVanity = false;
        settings.showBadgesChatterino = false;
        settings.showBadgesFfz = false;
        settings.showBadgesSevenTV = false;
        settings.showBadgesBttv = false;
    }
    const filterIds = new Set<string>();
    settings.filters = settings.filters.filter((record) => {
        if (filterIds.has(record.id)) return false;
        filterIds.add(record.id);
        return true;
    });
}

export function sanitizeSettings(value: unknown): Settings {
    const defaults = defaultSettings();
    if (!isObject(value)) return defaults;
    const settings = { ...defaults } as Record<keyof Settings, unknown>;
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
        settings[key] = sanitizeField(key, value[key], defaults[key]);
    }
    const typed = settings as Settings;
    if (isString(value.fontFamily) && value.fontFamily) typed.fontFamily = value.fontFamily as string;
    migrateLegacy(value, typed);
    return typed;
}

function sanitizeNode(value: unknown, ids: Set<string>): SplitNode | null {
    if (!isObject(value) || !isString(value.id) || ids.has(value.id as string)) return null;
    const id = value.id as string;
    if (value.type === "split") {
        if (!isString(value.channel)) return null;
        ids.add(id);
        const leaf: SplitLeaf = { type: "split", id, channel: (value.channel as string).trim().replace(/^#/, "").toLowerCase() };
        const filters = sanitizeList(value.filters, (entry) => (isString(entry) && entry ? (entry as string) : undefined));
        if (filters.length > 0) leaf.filters = filters;
        if (value.moderationMode === true) leaf.moderationMode = true;
        return leaf;
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

export function roomIdCache(storage: StorageLike): { get(channel: string): string | undefined; set(channel: string, roomId: string): void } {
    const read = (): Record<string, string> => {
        const value = readJson(storage, STORAGE_KEYS.roomIds);
        if (!isObject(value)) return {};
        const ids: Record<string, string> = {};
        for (const [channel, roomId] of Object.entries(value)) {
            if (isString(roomId) && /^\d+$/.test(roomId as string)) ids[channel] = roomId as string;
        }
        return ids;
    };
    return {
        get: (channel) => read()[channel],
        set: (channel, roomId) => {
            const ids = read();
            if (ids[channel] === roomId) return;
            delete ids[channel];
            ids[channel] = roomId;
            const entries = Object.entries(ids);
            save(storage, STORAGE_KEYS.roomIds, Object.fromEntries(entries.slice(Math.max(0, entries.length - ROOM_ID_LIMIT))));
        },
    };
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
