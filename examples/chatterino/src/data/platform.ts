export type SpawnResult = { ok: true } | { ok: false; reason: string };

export type PlatformHooks = {
    notify?: (title: string, body: string) => void;
    playSound?: (name: string) => void;
    findRunning?: (names: string[]) => Promise<string[]> | string[];
    requestAttention?: (critical: boolean) => void;
    colorScheme?: () => "light" | "dark" | null | undefined;
    onColorSchemeChange?: (listener: () => void) => () => void;
    readClipboard?: () => Promise<string>;
    writeClipboard?: (text: string) => void;
    spawn?: (command: string, args: string[]) => Promise<SpawnResult>;
    isAppActive?: () => boolean;
    prefetchImages?: (urls: string[]) => void;
    preconnect?: (origins: string[]) => void;
};

type MaybeModule = Record<string, unknown>;

function method(target: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
    if (!target || typeof target !== "object") return undefined;
    const candidate = (target as MaybeModule)[name];
    return typeof candidate === "function" ? (candidate as (...args: unknown[]) => unknown).bind(target) : undefined;
}

function spawnHook(processes: unknown): PlatformHooks["spawn"] {
    const spawn = method(processes, "spawn") ?? method(processes, "launch") ?? method(processes, "run");
    if (!spawn) return undefined;
    return async (command, args) => {
        try {
            await spawn(command, args);
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
    };
}

export function platformHooksFrom(gpui: MaybeModule | undefined): PlatformHooks {
    if (!gpui) return {};
    const show = method(gpui.Notifications, "show");
    const play = method(gpui.Sound, "play");
    const find = method(gpui.Processes, "findRunning");
    const attention = method(gpui.Dock, "requestAttention");
    const getScheme = method(gpui.Appearance, "getColorScheme");
    const addSchemeListener = method(gpui.Appearance, "addChangeListener");
    const readClipboard = method(gpui.NativeClipboard, "read") ?? method(gpui.NativeClipboard, "getString");
    const writeClipboard = method(gpui.NativeClipboard, "setString");
    const prefetch = method(gpui.ImageCache, "prefetch");
    const preconnect = method(gpui.ImageCache, "preconnect");
    const hooks: PlatformHooks = {};
    const appState = gpui.AppState as { currentState?: string } | undefined;
    if (appState && "currentState" in appState) hooks.isAppActive = () => appState.currentState === "active";
    if (show) hooks.notify = (title, body) => void Promise.resolve(show({ title, body })).catch(() => undefined);
    if (play) hooks.playSound = (name) => void Promise.resolve(play(name)).catch(() => undefined);
    if (find) hooks.findRunning = (names) => find(names) as Promise<string[]> | string[];
    if (attention) hooks.requestAttention = (critical) => void attention(critical);
    if (getScheme) hooks.colorScheme = () => getScheme() as "light" | "dark" | null;
    if (addSchemeListener) {
        hooks.onColorSchemeChange = (listener) => {
            const subscription = addSchemeListener(() => listener()) as { remove?: () => void } | undefined;
            return () => subscription?.remove?.();
        };
    }
    if (readClipboard) hooks.readClipboard = async () => String((await readClipboard()) ?? "");
    if (writeClipboard) hooks.writeClipboard = (text) => void writeClipboard(text);
    const spawn = spawnHook(gpui.Processes);
    if (spawn) hooks.spawn = spawn;
    if (prefetch) hooks.prefetchImages = (urls) => void prefetch(urls);
    if (preconnect) hooks.preconnect = (origins) => void preconnect(origins);
    return hooks;
}

export const STREAMING_SOFTWARE = ["obs", "obs64", "obs32", "obs-studio", "streamlabs obs", "streamlabs", "twitchstudio", "xsplit.core", "xsplit"];
