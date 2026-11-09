import type { ChatListMessage, ChatListPressEvent } from "react-native-gpui";
import type { MenuEntry } from "../state/overlays";

export type ImageLink = { label: string; url: string };

type ScaledPattern = { pattern: RegExp; scales: [string, string, string] };

const SCALED: ScaledPattern[] = [
    { pattern: /^(https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/[^/]+\/[^/]+\/[^/]+\/)1\.0$/, scales: ["1.0", "2.0", "3.0"] },
    { pattern: /^(https:\/\/cdn\.betterttv\.net\/emote\/[^/]+\/)1x(\.webp)?$/, scales: ["1x", "2x", "3x"] },
    { pattern: /^(https:\/\/cdn\.7tv\.app\/emote\/[^/]+\/)1x(\.webp)?$/, scales: ["1x", "2x", "4x"] },
    { pattern: /^(https:\/\/cdn\.frankerfacez\.com\/(?:emote|badge)\/[^/]+\/)1$/, scales: ["1", "2", "4"] },
    { pattern: /^(https:\/\/static-cdn\.jtvnw\.net\/badges\/v1\/[^/]+\/)1$/, scales: ["1", "2", "3"] },
];

const LABELS = ["1x link", "2x link", "4x link"];

export function imageLinks(url: string): ImageLink[] {
    for (const { pattern, scales } of SCALED) {
        const match = pattern.exec(url);
        if (!match) continue;
        const suffix = match[2] ?? "";
        return scales.map((scale, index) => ({ label: LABELS[index], url: `${match[1]}${scale}${suffix}` }));
    }
    return url ? [{ label: LABELS[0], url }] : [];
}

const EXCLUDED_TWITCH_PAGES = new Set([
    "directory",
    "downloads",
    "drops",
    "friends",
    "inventory",
    "jobs",
    "login",
    "messages",
    "payments",
    "profile",
    "security",
    "settings",
    "signup",
    "subscriptions",
    "turbo",
    "videos",
    "wallet",
]);

const TWITCH_CHANNEL_LINK = /^(?:https?:\/\/)?(?:www\.|go\.)?twitch\.tv\/(?:popout\/)?([a-z0-9_]{3,})/i;

export function twitchChannelOfLink(url: string): string | undefined {
    const match = TWITCH_CHANNEL_LINK.exec(url);
    const name = match?.[1]?.toLowerCase();
    if (!name || EXCLUDED_TWITCH_PAGES.has(name)) return undefined;
    return name;
}

export type MessageMenuActions = {
    openUrl: (url: string) => void;
    copy: (text: string) => void;
    reply?: () => void;
    replyToThread?: () => void;
    viewThread?: () => void;
    deleteMessage?: () => void;
    goToMessage?: () => void;
    openChannelInSplit?: (channel: string) => void;
    openChannelInTab?: (channel: string) => void;
    openPlayer: (channel: string) => void;
    openStreamlink?: (channel: string) => void;
    openCustomPlayer?: (channel: string) => void;
    commands?: Array<{ label: string; run: () => void }>;
};

export type MessageMenuContext = {
    event: Pick<ChatListPressEvent, "target" | "url" | "name" | "link">;
    message: ChatListMessage | undefined;
    copyMessage: string;
    copyFullMessage: string;
    shift: boolean;
    canReply: boolean;
    replyable: boolean;
    inThread: boolean;
    messageJson?: string;
};

function imageSubmenus(kind: "emote" | "badge", url: string, homePage: string | undefined, actions: MessageMenuActions): MenuEntry[] {
    const links = imageLinks(url);
    const open: MenuEntry[] = links.map((link) => ({ kind: "item", label: link.label, onSelect: () => actions.openUrl(link.url) }));
    const copy: MenuEntry[] = links.map((link) => ({ kind: "item", label: link.label, onSelect: () => actions.copy(link.url) }));
    if (homePage) {
        open.push({ kind: "separator" }, { kind: "item", label: `Open ${kind} link`, onSelect: () => actions.openUrl(homePage) });
        copy.push({ kind: "separator" }, { kind: "item", label: `Copy ${kind} link`, onSelect: () => actions.copy(homePage) });
    }
    return [
        { kind: "submenu", label: "Open", entries: open },
        { kind: "submenu", label: "Copy", entries: copy },
    ];
}

function replyEntries(context: MessageMenuContext, actions: MessageMenuActions): MenuEntry[] {
    if (!context.canReply) return [];
    const entries: MenuEntry[] = [
        { kind: "item", label: "Reply to message", disabled: !context.replyable || !actions.reply, onSelect: () => actions.reply?.() },
    ];
    if (context.inThread) {
        entries.push({ kind: "item", label: "Reply to original thread", disabled: !actions.replyToThread, onSelect: () => actions.replyToThread?.() });
        entries.push({ kind: "item", label: "View thread", onSelect: () => actions.viewThread?.() });
    }
    return entries;
}

function twitchLinkEntries(channel: string, actions: MessageMenuActions): MenuEntry[] {
    const entries: MenuEntry[] = [
        { kind: "separator" },
        { kind: "item", label: "Open in new split", onSelect: () => actions.openChannelInSplit?.(channel) },
        { kind: "item", label: "Open in new tab", onSelect: () => actions.openChannelInTab?.(channel) },
        { kind: "separator" },
        { kind: "item", label: "Open player in browser", onSelect: () => actions.openPlayer(channel) },
        { kind: "item", label: "Open in streamlink", disabled: !actions.openStreamlink, onSelect: () => actions.openStreamlink?.(channel) },
    ];
    if (actions.openCustomPlayer) entries.push({ kind: "item", label: "Open in custom player", onSelect: () => actions.openCustomPlayer?.(channel) });
    return entries;
}

export function collapseSeparators(entries: MenuEntry[]): MenuEntry[] {
    const out: MenuEntry[] = [];
    for (const entry of entries) {
        const previous = out[out.length - 1];
        const isSeparator = entry.kind === "separator";
        if (isSeparator && (!previous || previous.kind === "separator")) continue;
        out.push(entry);
    }
    while (out.length > 0 && out[out.length - 1].kind === "separator") out.pop();
    return out;
}

export function messageMenuEntries(context: MessageMenuContext, actions: MessageMenuActions): MenuEntry[] {
    const { event, message } = context;
    const entries: MenuEntry[] = [];
    const isImage = event.target === "emote" || event.target === "badge";
    if (isImage && event.url) {
        entries.push(...imageSubmenus(event.target as "emote" | "badge", event.url, event.link, actions), { kind: "separator" });
    }
    const linkUrl = event.target === "link" ? event.url : undefined;
    if (linkUrl) {
        entries.push(
            { kind: "item", label: "Open link", onSelect: () => actions.openUrl(linkUrl) },
            { kind: "item", label: "Copy link", onSelect: () => actions.copy(linkUrl) },
            { kind: "separator" },
        );
    }
    if (message) {
        entries.push(
            { kind: "item", label: "Copy message", onSelect: () => actions.copy(context.copyMessage) },
            { kind: "item", label: "Copy full message", onSelect: () => actions.copy(context.copyFullMessage) },
        );
        entries.push(...replyEntries(context, actions));
        if (actions.deleteMessage) {
            entries.push({ kind: "separator" }, { kind: "submenu", label: "Moderate", entries: [{ kind: "item", label: "Delete message", onSelect: actions.deleteMessage }] });
        }
        if (actions.goToMessage) entries.push({ kind: "item", label: "Go to message", onSelect: actions.goToMessage });
    }
    const twitchChannel = linkUrl ? twitchChannelOfLink(linkUrl) : undefined;
    if (twitchChannel) entries.push(...twitchLinkEntries(twitchChannel, actions));
    if (context.shift && message) {
        entries.push({ kind: "item", label: "Copy message ID", onSelect: () => actions.copy(message.id) });
        entries.push({ kind: "item", label: "Copy message JSON", onSelect: () => actions.copy(context.messageJson ?? JSON.stringify(message, null, 4)) });
    }
    const commands = message ? actions.commands ?? [] : [];
    if (commands.length > 0) {
        const commandEntries: MenuEntry[] = commands.map((command) => ({ kind: "item", label: command.label, onSelect: command.run }));
        entries.push({ kind: "separator" }, { kind: "submenu", label: "Execute command", entries: commandEntries });
    }
    return collapseSeparators(entries);
}

export type RightClickBehavior = "reply" | "mention" | "ignore";
export type RightClickModifier = "shift" | "control" | "alt" | "meta";
export type Modifiers = { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };

function exactlyModifier(modifiers: Modifiers, modifier: RightClickModifier): boolean {
    const held = { shift: !!modifiers.shiftKey, control: !!modifiers.ctrlKey, alt: !!modifiers.altKey, meta: !!modifiers.metaKey };
    return Object.entries(held).every(([name, down]) => down === (name === modifier));
}

export function usernameRightClickAction(
    isAuthor: boolean,
    modifiers: Modifiers,
    settings: { usernameRightClickBehavior?: RightClickBehavior; usernameRightClickModifierBehavior?: RightClickBehavior; usernameRightClickModifier?: RightClickModifier },
): RightClickBehavior {
    if (!isAuthor) return "mention";
    const modifier = settings.usernameRightClickModifier ?? "shift";
    if (exactlyModifier(modifiers, modifier)) return settings.usernameRightClickModifierBehavior ?? "reply";
    return settings.usernameRightClickBehavior ?? "mention";
}

export function mentionText(name: string, textBeforeCursor: string, withComma: boolean): string {
    const isFirstWord = !textBeforeCursor.includes(" ");
    const comma = isFirstWord && withComma ? "," : "";
    return `@${name}${comma} `;
}

export function viewerCardUrl(channel: string, name: string): string {
    return `https://www.twitch.tv/popout/${channel}/viewercard/${name.toLowerCase()}`;
}
