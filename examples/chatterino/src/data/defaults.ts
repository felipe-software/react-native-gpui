import type { AccountsState, Settings, SplitContainer, SplitLeaf, TabLayout, WindowLayout } from "./api";

function hostPlatform(): string {
    return (globalThis as { process?: { platform?: string } }).process?.platform ?? "linux";
}

function defaultFontSize(platform: string): number {
    if (platform === "darwin") return 12;
    if (platform === "win32") return 10;
    return 11;
}

export function defaultSettings(platform: string = hostPlatform()): Settings {
    return {
        theme: "dark",
        fontSize: defaultFontSize(platform),
        showTimestamps: true,
        timestampFormat: "h:mm",
        showBadges: true,
        emoteScale: 1,
        animateEmotes: true,
        showMessageSeparators: false,
        alternateMessageBackground: false,
        pauseChatOnHover: false,
        loadHistoryOnJoin: true,
        historyLimit: 800,
        messageLimit: 1000,
        highlightSelfMentions: true,
        highlightPhrases: [],
        highlightUsers: [],
        ignoredUsers: [],
        ignoredPhrases: [],
        mentionSound: true,
        mentionNotification: false,
        liveNotifications: false,
        streamerMode: "auto",
        showLinkPreviews: false,
        showDeletedMessages: true,
    };
}

function split(id: string, channel: string): SplitLeaf {
    return { type: "split", id, channel };
}

function container(id: string, direction: SplitContainer["direction"], children: SplitContainer["children"]): SplitContainer {
    return { type: "container", id, direction, children, sizes: children.map(() => 1 / children.length) };
}

export function defaultLayout(): WindowLayout {
    const main: TabLayout = {
        id: "tab-main",
        title: "Main",
        root: container("main-root", "horizontal", [
            split("split-xqc", "xqc"),
            container("main-right", "vertical", [split("split-forsen", "forsen"), split("split-sodapoppin", "sodapoppin")]),
        ]),
        focusedSplitId: "split-xqc",
    };
    const more: TabLayout = {
        id: "tab-more",
        title: "More",
        root: container("more-root", "horizontal", [
            split("split-lirik", "lirik"),
            split("split-kaicenat", "kaicenat"),
            split("split-hasanabi", "hasanabi"),
        ]),
        focusedSplitId: "split-lirik",
    };
    return { tabs: [main, more], selectedTabId: main.id };
}

export function defaultAccounts(): AccountsState {
    return { accounts: [] };
}
