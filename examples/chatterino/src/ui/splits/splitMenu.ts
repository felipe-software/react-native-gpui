import type { Settings, SplitLeaf } from "../../data/api";
import type { AppServices } from "../state/AppContext";
import { isSpecialChannel } from "../state/specialChannels";
import type { MenuEntry } from "../state/overlays";

export type SplitMenuOptions = { detached?: boolean; hasModRights?: boolean; onClosePopup?: () => void };

function explain(services: AppServices, title: string, message: string): void {
    services.openOverlay({ kind: "confirm", title, message, onConfirm: () => undefined, infoOnly: true });
}

function toggleListSetting(services: AppServices, key: "notificationChannels" | "mutedChannels", channel: string): void {
    services.core.settings.set((current: Settings) => {
        const list = current[key] ?? [];
        const next = list.includes(channel) ? list.filter((entry) => entry !== channel) : [...list, channel];
        return { ...current, [key]: next };
    });
}

function twitchEntries(services: AppServices, split: SplitLeaf, options: SplitMenuOptions): MenuEntry[] {
    const channel = split.channel;
    const core = services.core as { openInStreamlink?: (name: string) => Promise<unknown>; customPlayerUrl?: (name: string) => string | undefined };
    const entries: MenuEntry[] = [
        { kind: "item", label: "Open stream in browser", onSelect: () => services.openUrl(`https://www.twitch.tv/${channel}`) },
        {
            kind: "item",
            label: "Open player in browser",
            onSelect: () => services.openUrl(`https://player.twitch.tv/?parent=twitch.tv&channel=${channel}`),
        },
    ];
    if (typeof core.openInStreamlink === "function") {
        const open = core.openInStreamlink;
        entries.push({ kind: "item", label: "Open in streamlink", onSelect: () => void open.call(services.core, channel) });
    }
    const customUrl = typeof core.customPlayerUrl === "function" ? core.customPlayerUrl.call(services.core, channel) : undefined;
    if (customUrl) entries.push({ kind: "item", label: "Open in custom player", onSelect: () => services.openUrl(customUrl) });
    if (options.hasModRights) {
        entries.push({ kind: "item", label: "Open mod view in browser", onSelect: () => services.openUrl(`https://www.twitch.tv/moderator/${channel}`) });
    }
    entries.push({ kind: "separator" });
    return entries;
}

function moreEntries(services: AppServices, split: SplitLeaf, clearMessages: () => void, isTwitch: boolean): MenuEntry[] {
    const { settings } = services;
    const channel = split.channel;
    const entries: MenuEntry[] = [
        {
            kind: "item",
            label: "Toggle moderation mode",
            onSelect: () => services.actions.setModerationMode(split.id, !split.moderationMode),
        },
    ];
    if (isTwitch) {
        entries.push({ kind: "item", label: "Subscribe", onSelect: () => services.openUrl(`https://www.twitch.tv/subs/${channel}`) });
        entries.push({
            kind: "item",
            label: "Notify when live",
            checked: (settings.notificationChannels ?? []).includes(channel),
            onSelect: () => toggleListSetting(services, "notificationChannels", channel),
        });
        entries.push({
            kind: "item",
            label: "Mute highlight sounds",
            checked: (settings.mutedChannels ?? []).includes(channel),
            onSelect: () => toggleListSetting(services, "mutedChannels", channel),
        });
    }
    entries.push({ kind: "separator" }, { kind: "item", label: "Clear messages", onSelect: clearMessages });
    return entries;
}

export function splitMenuEntries(services: AppServices, split: SplitLeaf, clearMessages: () => void, options: SplitMenuOptions = {}): MenuEntry[] {
    const { actions } = services;
    const isTwitch = !!split.channel && !isSpecialChannel(split.channel);
    const detached = !!options.detached;
    const closeEntry: MenuEntry = detached
        ? { kind: "item", label: "Close", shortcut: "Ctrl+W", onSelect: () => options.onClosePopup?.() }
        : { kind: "item", label: "Close", shortcut: "Ctrl+W", onSelect: () => actions.closeSplit(split.id) };
    const entries: MenuEntry[] = [];
    if (!detached) {
        entries.push({
            kind: "item",
            label: "Change channel",
            shortcut: "Ctrl+R",
            onSelect: () => services.openOverlay({ kind: "selectChannel", splitId: split.id, isNew: false }),
        });
    }
    entries.push(closeEntry, { kind: "separator" });
    if (split.channel) {
        entries.push({ kind: "item", label: "Popup", shortcut: "Ctrl+N", onSelect: () => services.openOverlay({ kind: "splitPopup", channel: split.channel }) });
    }
    entries.push(
        {
            kind: "item",
            label: "Search",
            shortcut: "Ctrl+F",
            onSelect: () => services.openOverlay({ kind: "search", splitId: split.id, channels: [split.channel] }),
        },
        { kind: "separator" },
    );
    if (isTwitch) entries.push(...twitchEntries(services, split, options));
    if (isTwitch) entries.push({ kind: "item", label: "Reconnect", shortcut: "Ctrl+F5", onSelect: () => services.core.reconnect() });
    entries.push(
        { kind: "separator" },
        {
            kind: "submenu",
            label: "How to...",
            entries: [
                {
                    kind: "item",
                    label: "move split",
                    onSelect: () =>
                        explain(services, "Moving", "Hold <Ctrl+Alt> over a split and drag the center button, or drag a split by its header."),
                },
                {
                    kind: "item",
                    label: "add/split",
                    onSelect: () => explain(services, "Splitting", "Hold <Ctrl+Alt> over a split and click an arrow to add a split next to it."),
                },
            ],
        },
        { kind: "separator" },
    );
    if (!detached) entries.push({ kind: "submenu", label: "More", entries: moreEntries(services, split, clearMessages, isTwitch) });
    else entries.push({ kind: "submenu", label: "More", entries: [{ kind: "item", label: "Clear messages", onSelect: clearMessages }] });
    return entries;
}
