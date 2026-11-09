import type { ChatListElement } from "react-native-gpui";
import type { ModerationAction } from "../api";
import { assetPath } from "../assets";

export type ModerationButton =
    | { kind: "image"; url: string; label: string }
    | { kind: "text"; line1: string; line2: string };

const TIMEOUT_RE = /^[./]timeout.* (\d+)([mhdw]?)/;
const UNIT_SECONDS: Record<string, number> = { "": 1, m: 60, h: 3600, d: 86400, w: 604800 };

export const MODERATION_LINK_PREFIX = "chatterino://modaction/";

function timeoutLines(seconds: number): [string, string] {
    if (seconds < 60) return [String(seconds), "s"];
    if (seconds < 3600) return [String(Math.trunc(seconds / 60)), "m"];
    if (seconds < 86400) return [String(Math.trunc(seconds / 3600)), "h"];
    if (seconds < 604800) return [String(Math.trunc(seconds / 86400)), "d"];
    if (seconds > 1209600) return [">2", "w"];
    return [String(Math.trunc(seconds / 604800)), "w"];
}

export function parseModerationAction(action: ModerationAction): ModerationButton {
    if (action.iconPath) return { kind: "image", url: action.iconPath.replace(/^file:\/\//, ""), label: action.action };
    const timeout = TIMEOUT_RE.exec(action.action);
    if (timeout) {
        const seconds = Number(timeout[1]) * UNIT_SECONDS[timeout[2]];
        const [line1, line2] = timeoutLines(seconds);
        return { kind: "text", line1, line2 };
    }
    if (action.action.startsWith("/ban ")) return { kind: "image", url: assetPath("buttons/ban.png"), label: action.action };
    if (action.action.startsWith("/delete ")) return { kind: "image", url: assetPath("buttons/trashCan.png"), label: action.action };
    const stripped = action.action.replace(/[!/.]/g, "");
    return { kind: "text", line1: stripped.slice(0, 2), line2: stripped.slice(2, 4) };
}

export function moderationLink(index: number, messageId: string): string {
    return `${MODERATION_LINK_PREFIX}${index}/${encodeURIComponent(messageId)}`;
}

export function parseModerationLink(link: string): { index: number; messageId: string } | undefined {
    if (!link.startsWith(MODERATION_LINK_PREFIX)) return undefined;
    const rest = link.slice(MODERATION_LINK_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return undefined;
    const index = Number(rest.slice(0, slash));
    if (!Number.isInteger(index)) return undefined;
    return { index, messageId: decodeURIComponent(rest.slice(slash + 1)) };
}

export function moderationElements(actions: ModerationAction[], messageId: string, systemColor: string): ChatListElement[] {
    return actions.map((action, index): ChatListElement => {
        const button = parseModerationAction(action);
        const link = moderationLink(index, messageId);
        if (button.kind === "image") {
            return { kind: "emote", name: action.action, url: button.url, width: 16, height: 16, tooltip: action.action, link };
        }
        return { kind: "text", text: `${button.line1}${button.line2}`, color: systemColor, link };
    });
}
