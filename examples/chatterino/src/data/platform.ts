export type PlatformHooks = {
    notify?: (title: string, body: string) => void;
    playSound?: (name: string) => void;
    findRunning?: (names: string[]) => Promise<string[]> | string[];
};

type MaybeModule = Record<string, unknown>;

function method(target: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
    if (!target || typeof target !== "object") return undefined;
    const candidate = (target as MaybeModule)[name];
    return typeof candidate === "function" ? (candidate as (...args: unknown[]) => unknown).bind(target) : undefined;
}

export function platformHooksFrom(gpui: MaybeModule | undefined): PlatformHooks {
    if (!gpui) return {};
    const show = method(gpui.Notifications, "show");
    const play = method(gpui.Sound, "play");
    const find = method(gpui.Processes, "findRunning");
    const hooks: PlatformHooks = {};
    if (show) hooks.notify = (title, body) => void show({ title, body });
    if (play) hooks.playSound = (name) => void play(name);
    if (find) hooks.findRunning = (names) => find(names) as Promise<string[]> | string[];
    return hooks;
}

export const STREAMING_SOFTWARE = ["obs", "obs64", "obs32", "obs-studio", "streamlabs obs", "streamlabs", "twitchstudio", "xsplit.core", "xsplit"];
