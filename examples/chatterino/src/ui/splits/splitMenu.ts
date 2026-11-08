import type { SplitLeaf } from "../../data/api";
import type { AppServices } from "../state/AppContext";
import { MENTIONS_CHANNEL } from "../state/ids";
import { inputRegistry } from "../state/inputs";
import type { MenuEntry } from "../state/overlays";

function explain(services: AppServices, title: string, message: string): void {
    services.openOverlay({ kind: "confirm", title, message, onConfirm: () => undefined, infoOnly: true });
}

export function splitMenuEntries(services: AppServices, split: SplitLeaf, clearMessages: () => void): MenuEntry[] {
    const { actions } = services;
    const isTwitch = !!split.channel && split.channel !== MENTIONS_CHANNEL;
    const twitchEntries: MenuEntry[] = isTwitch
        ? [
              { kind: "item", label: "Open stream in browser", onSelect: () => services.openUrl(`https://www.twitch.tv/${split.channel}`) },
              {
                  kind: "item",
                  label: "Open player in browser",
                  onSelect: () => services.openUrl(`https://player.twitch.tv/?parent=twitch.tv&channel=${split.channel}`),
              },
              { kind: "separator" },
              { kind: "item", label: "Reconnect", shortcut: "Ctrl+F5", onSelect: () => services.core.reconnect() },
              { kind: "separator" },
          ]
        : [];
    return [
        {
            kind: "item",
            label: "Change channel",
            shortcut: "Ctrl+R",
            onSelect: () => services.openOverlay({ kind: "selectChannel", splitId: split.id, isNew: false }),
        },
        { kind: "item", label: "Close", shortcut: "Ctrl+W", onSelect: () => actions.closeSplit(split.id) },
        { kind: "separator" },
        {
            kind: "item",
            label: "Search",
            shortcut: "Ctrl+F",
            onSelect: () => services.openOverlay({ kind: "search", splitId: split.id, channels: [split.channel] }),
        },
        {
            kind: "item",
            label: "Scroll to bottom",
            shortcut: "Ctrl+End",
            onSelect: () => inputRegistry.get(split.id)?.scrollToBottom(),
        },
        { kind: "separator" },
        ...twitchEntries,
        {
            kind: "submenu",
            label: "How to...",
            entries: [
                {
                    kind: "item",
                    label: "move split",
                    onSelect: () => explain(services, "Moving", "Drag a split by its header and drop it on an edge of another split."),
                },
                {
                    kind: "item",
                    label: "add/split",
                    onSelect: () =>
                        explain(services, "Splitting", "Press Ctrl+T or the + in the top-right header to add a split on the right."),
                },
            ],
        },
        { kind: "separator" },
        { kind: "submenu", label: "More", entries: [{ kind: "item", label: "Clear messages", onSelect: clearMessages }] },
    ];
}
