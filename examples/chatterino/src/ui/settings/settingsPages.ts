export const SETTINGS_PAGES = [
    { name: "General", icon: "settings/about.svg", group: 0 },
    { name: "Accounts", icon: "settings/accounts.svg", group: 1 },
    { name: "Nicknames", icon: "settings/accounts.svg", group: 1 },
    { name: "Commands", icon: "settings/commands.svg", group: 2 },
    { name: "Highlights", icon: "settings/notifications.svg", group: 2 },
    { name: "Ignores", icon: "settings/ignore.svg", group: 2 },
    { name: "Filters", icon: "settings/filters.svg", group: 2 },
    { name: "Hotkeys", icon: "settings/keybinds.svg", group: 3 },
    { name: "Moderation", icon: "settings/moderation.svg", group: 3 },
    { name: "Live Notifications", icon: "settings/notification2.svg", group: 3 },
    { name: "External tools", icon: "settings/externaltools.svg", group: 3 },
    { name: "Plugins", icon: "settings/plugins.svg", group: 3 },
    { name: "About", icon: "settings/about.svg", group: 4 },
] as const;

export type SettingsPageName = (typeof SETTINGS_PAGES)[number]["name"];

export const PAGE_ALIASES: Record<string, SettingsPageName> = {
    Notifications: "Live Notifications",
    "Live notifications": "Live Notifications",
    Keybindings: "Hotkeys",
};

export function resolvePage(page: string | undefined): SettingsPageName {
    if (!page) return "General";
    const direct = SETTINGS_PAGES.find((entry) => entry.name === page);
    if (direct) return direct.name;
    return PAGE_ALIASES[page] ?? "General";
}
