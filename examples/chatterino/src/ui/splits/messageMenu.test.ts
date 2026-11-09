import { describe, expect, test } from "bun:test";
import type { ChatListMessage } from "react-native-gpui";
import type { MenuEntry } from "../state/overlays";
import { NO_MODIFIERS, nextModifierState } from "./modifierState";
import { overlayButtons, overlayPreview } from "./overlayGeometry";
import { bodyText, canReplyTo, displayNameFromLabel, linkNameOf, replyTargetFor } from "./replyTarget";
import {
    collapseSeparators,
    imageLinks,
    mentionText,
    messageMenuEntries,
    twitchChannelOfLink,
    usernameRightClickAction,
    viewerCardUrl,
    type MessageMenuActions,
} from "./messageMenu";

const ID = "0b5e1a6c-1c1d-4a59-9c1e-2f6f3c1d9a11";

const message: ChatListMessage = {
    id: ID,
    timestamp: "17:04",
    elements: [
        { kind: "badge", name: "mod", url: "b", width: 18, height: 18 },
        { kind: "user", text: "Forsen:", login: "forsen" },
        { kind: "text", text: "hello" },
        { kind: "emote", name: "Kappa", url: "e", width: 28, height: 28 },
    ],
};

const actions: MessageMenuActions = { openUrl: () => undefined, copy: () => undefined, openPlayer: () => undefined };

function labels(entries: MenuEntry[]): string[] {
    return entries.map((entry) => (entry.kind === "separator" ? "---" : entry.kind === "submenu" ? `${entry.label} >` : entry.label));
}

const base = { message, copyMessage: "hello Kappa", copyFullMessage: "17:04 Forsen: hello Kappa", shift: false, canReply: true, replyable: true, inThread: false };

describe("message context menu (ChannelView::addContextMenuItems)", () => {
    test("plain text: copy and reply", () => {
        const entries = messageMenuEntries({ ...base, event: { target: "message" } }, { ...actions, reply: () => undefined });
        expect(labels(entries)).toEqual(["Copy message", "Copy full message", "Reply to message"]);
    });

    test("a reply adds thread items, Shift adds the hidden items", () => {
        const entries = messageMenuEntries({ ...base, inThread: true, shift: true, event: { target: "message" } }, { ...actions, reply: () => undefined, replyToThread: () => undefined });
        expect(labels(entries)).toEqual([
            "Copy message",
            "Copy full message",
            "Reply to message",
            "Reply to original thread",
            "View thread",
            "Copy message ID",
            "Copy message JSON",
        ]);
    });

    test("links get open/copy and twitch channel links the channel block", () => {
        const entries = messageMenuEntries({ ...base, canReply: false, event: { target: "link", url: "https://twitch.tv/forsen" } }, actions);
        expect(labels(entries)).toEqual([
            "Open link",
            "Copy link",
            "---",
            "Copy message",
            "Copy full message",
            "---",
            "Open in new split",
            "Open in new tab",
            "---",
            "Open player in browser",
            "Open in streamlink",
        ]);
    });

    test("emotes get Open and Copy submenus with scaled links and the home page", () => {
        const entries = messageMenuEntries(
            { ...base, canReply: false, event: { target: "emote", url: "https://cdn.betterttv.net/emote/abc/1x.webp", link: "https://betterttv.com/emotes/abc" } },
            actions,
        );
        expect(labels(entries).slice(0, 3)).toEqual(["Open >", "Copy >", "---"]);
        const open = entries[0].kind === "submenu" ? entries[0].entries : [];
        expect(labels(open)).toEqual(["1x link", "2x link", "4x link", "---", "Open emote link"]);
    });

    test("not replyable disables the reply item; mods get Moderate", () => {
        const entries = messageMenuEntries({ ...base, replyable: false, event: { target: "message" } }, { ...actions, reply: () => undefined, deleteMessage: () => undefined });
        const reply = entries.find((entry) => entry.kind === "item" && entry.label === "Reply to message");
        expect(reply?.kind === "item" && reply.disabled).toBe(true);
        expect(labels(entries).slice(-2)).toEqual(["---", "Moderate >"]);
    });

    test("separators collapse", () => {
        const sep: MenuEntry = { kind: "separator" };
        const item: MenuEntry = { kind: "item", label: "a", onSelect: () => undefined };
        expect(collapseSeparators([sep, item, sep, sep, item, sep])).toEqual([item, sep, item]);
    });
});

describe("image links and channel links", () => {
    test("provider scale urls", () => {
        expect(imageLinks("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0").map((link) => link.url.slice(-3))).toEqual(["1.0", "2.0", "3.0"]);
        expect(imageLinks("https://cdn.frankerfacez.com/emote/1/1").map((link) => link.url)).toEqual([
            "https://cdn.frankerfacez.com/emote/1/1",
            "https://cdn.frankerfacez.com/emote/1/2",
            "https://cdn.frankerfacez.com/emote/1/4",
        ]);
        expect(imageLinks("https://pajbot.com/static/emoji-v2/img/twitter/64/1f602.png")).toHaveLength(1);
    });

    test("twitch channel links skip site pages", () => {
        expect(twitchChannelOfLink("https://www.twitch.tv/Forsen")).toBe("forsen");
        expect(twitchChannelOfLink("twitch.tv/popout/xqc/chat")).toBe("xqc");
        expect(twitchChannelOfLink("https://twitch.tv/directory")).toBeUndefined();
        expect(twitchChannelOfLink("https://example.com/forsen")).toBeUndefined();
    });
});

describe("username right-click (ChannelView::handleMouseClick)", () => {
    test("Shift on the author replies, otherwise mention", () => {
        expect(usernameRightClickAction(true, { shiftKey: true }, {})).toBe("reply");
        expect(usernameRightClickAction(true, {}, {})).toBe("mention");
        expect(usernameRightClickAction(true, { shiftKey: true, ctrlKey: true }, {})).toBe("mention");
        expect(usernameRightClickAction(false, { shiftKey: true }, {})).toBe("mention");
        expect(usernameRightClickAction(true, { ctrlKey: true }, { usernameRightClickModifier: "control", usernameRightClickModifierBehavior: "ignore" })).toBe("ignore");
    });

    test("mention text follows formatUserMention", () => {
        expect(mentionText("Forsen", "", true)).toBe("@Forsen, ");
        expect(mentionText("Forsen", "hello", true)).toBe("@Forsen, ");
        expect(mentionText("Forsen", "hello ", true)).toBe("@Forsen ");
        expect(mentionText("Forsen", "", false)).toBe("@Forsen ");
    });

    test("viewer card url", () => {
        expect(viewerCardUrl("forsen", "Pajlada")).toBe("https://www.twitch.tv/popout/forsen/viewercard/pajlada");
    });
});

describe("reply targets", () => {
    test("author name follows the link value rule", () => {
        expect(linkNameOf({ kind: "user", text: "Forsen:", login: "forsen" })).toBe("Forsen");
        expect(linkNameOf({ kind: "user", text: "extrahu3(エクストラーフさん):", login: "extrahu3" })).toBe("extrahu3");
        expect(displayNameFromLabel("a(b):")).toBe("b");
    });

    test("target text skips badges and the author", () => {
        expect(bodyText(message)).toBe("hello Kappa");
        expect(canReplyTo(message)).toBe(true);
        expect(canReplyTo({ ...message, id: "msg-1" })).toBe(false);
        const target = replyTargetFor(undefined, message);
        expect(target).toEqual({ messageId: ID, login: "forsen", displayName: "Forsen", text: "hello Kappa" });
    });
});

describe("Ctrl+Alt overlay geometry (SplitOverlay.cpp)", () => {
    test("five buttons 1 px inside the edges, arrows only above 150 px", () => {
        const boxes = overlayButtons(400, 300);
        expect(boxes.map((box) => box.kind)).toEqual(["move", "left", "right", "above", "below"]);
        expect(boxes.find((box) => box.kind === "left")?.rect).toEqual({ x: 1, y: 138, width: 34, height: 24 });
        expect(boxes.find((box) => box.kind === "below")?.rect).toEqual({ x: 183, y: 275, width: 34, height: 24 });
        expect(overlayButtons(150, 400).map((box) => box.kind)).toEqual(["move", "above", "below"]);
    });

    test("hovering an arrow previews that half", () => {
        expect(overlayPreview("left", 401, 300)).toEqual({ x: 0, y: 0, width: 200, height: 300 });
        expect(overlayPreview("below", 400, 301)).toEqual({ x: 0, y: 150, width: 400, height: 150 });
        expect(overlayPreview("move", 400, 300)).toBeUndefined();
    });
});

describe("Ctrl/Ctrl+Alt tracking from pointer events (Split::handleModifiers)", () => {
    const splits = [
        { id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
        { id: "b", rect: { x: 100, y: 0, width: 100, height: 100 } },
    ];

    test("Ctrl+Alt picks the split under the pointer, Ctrl alone does not", () => {
        const held = nextModifierState(NO_MODIFIERS, { ctrlKey: true, altKey: true, x: 150, y: 10 }, splits);
        expect(held).toEqual({ ctrl: true, alt: true, splitId: "b" });
        expect(nextModifierState(held, { ctrlKey: true, altKey: true, x: 150, y: 20 }, splits)).toBe(held);
        expect(nextModifierState(held, { ctrlKey: true, x: 150, y: 20 }, splits)).toEqual({ ctrl: true, alt: false });
        expect(nextModifierState(held, { x: 5, y: 5 }, splits)).toEqual(NO_MODIFIERS);
    });
});
