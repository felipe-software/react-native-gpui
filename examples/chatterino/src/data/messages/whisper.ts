import type { Emote } from "../emotes/types";
import type { IrcMessage } from "../irc/message";
import { messageTime, parseTwitchEmotes } from "../twitch/tags";
import { normalizeHexColor, randomUserColor } from "../twitch/usercolor";
import { nextLocalId, PieceBuilder } from "./builder";
import type { GlobalContext } from "./context";
import type { ChatMessage, Tint } from "./model";
import { stylizeUsername } from "./privmsg";
import { addWords } from "./words";

export type WhisperDeps = {
    lookupEmote(name: string): Emote | undefined;
    userColor(login: string): string | undefined;
    selfColor(): string | undefined;
};

function wordContext(deps: WhisperDeps, global: GlobalContext) {
    const settings = global.settings;
    return {
        textTint: "text" as Tint,
        lookupEmote: (name: string) => deps.lookupEmote(name),
        userColor: (name: string) => deps.userColor(name),
        cheermotes: [],
        bits: 0,
        lowercaseDomains: settings?.lowercaseDomains,
        zeroWidthEmotes: settings?.enableZeroWidthEmotes,
    };
}

export function buildReceivedWhisper(irc: IrcMessage, deps: WhisperDeps, global: GlobalContext): ChatMessage | undefined {
    const { tags } = irc;
    const login = (irc.nick || tags.login || "").toLowerCase();
    const content = irc.params[1] ?? "";
    if (global.ignores.isIgnoredUser(login) || global.ignores.isBlocked(content)) return undefined;
    const tagged = normalizeHexColor(tags.color);
    const userId = tags["user-id"];
    const colorizeOff = global.settings?.colorizeNicknames === false;
    const fallback = colorizeOff ? "#999999" : userId ? randomUserColor(userId) : undefined;
    const color = tagged ?? fallback;
    const display = (tags["display-name"] ?? "").trim();
    const sameName = !display || display.toLowerCase() === login;
    const displayName = sameName ? display || login : login;
    const localizedName = sameName ? undefined : display;
    const builder = new PieceBuilder();
    builder.user(stylizeUsername(displayName, localizedName, global), login, (color as Tint | undefined) ?? "text", true);
    builder.text("->", "system");
    const self = global.selfLogin ?? "";
    builder.user(`${self}:`, self, (deps.selfColor() as Tint | undefined) ?? "system", true);
    const occurrences = parseTwitchEmotes(tags, content, 0);
    const replaced = global.ignores.replace(content, occurrences);
    addWords(builder, replaced.content, replaced.emotes, wordContext(deps, global));
    const message: ChatMessage = {
        id: tags["message-id"] || nextLocalId("whisper"),
        channel: "/whispers",
        time: messageTime(tags, global.now()),
        login,
        displayName,
        localizedName,
        userId,
        userColor: color,
        pieces: builder.pieces,
        flags: { whisper: true, receivedWhisper: true },
        text: replaced.content,
        searchText: `${displayName} -> ${self}: ${replaced.content}`,
        count: 1,
    };
    const highlight = global.highlights.check({
        senderLogin: login,
        content,
        isSubscription: false,
        isSubscribedThread: false,
        isReceivedWhisper: true,
    });
    if (highlight) {
        message.flags.highlighted = true;
        message.highlightColor = highlight.color;
        if (highlight.showInMentions) message.flags.showInMentions = true;
        message.alert = { playSound: highlight.playSound, windowAlert: highlight.alert };
        if (highlight.soundUrl) message.alert.soundUrl = highlight.soundUrl;
    }
    return message;
}

export function buildSentWhisper(target: string, text: string, deps: WhisperDeps, global: GlobalContext): ChatMessage {
    const self = global.selfLogin ?? "";
    const builder = new PieceBuilder();
    builder.user(self, self, "text", true);
    builder.text("->", "system");
    builder.user(`${target}:`, target.toLowerCase(), "text", true);
    addWords(builder, text, [], wordContext(deps, global));
    return {
        id: nextLocalId("whisper"),
        channel: "/whispers",
        time: global.now(),
        login: self,
        displayName: self,
        pieces: builder.pieces,
        flags: { whisper: true, doNotNotify: true },
        text,
        searchText: `${self} -> ${target}: ${text}`,
        count: 1,
    };
}
