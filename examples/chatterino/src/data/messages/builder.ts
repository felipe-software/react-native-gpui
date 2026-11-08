import type { Badge, Emote } from "../emotes/types";
import { linkDisplayText, linkTarget, parseLink } from "../links/parse";
import type { ChatMessage, MessageFlags, Piece, Tint } from "./model";

let sequence = 0;

export function nextLocalId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export class PieceBuilder {
    readonly pieces: Piece[] = [];

    text(text: string, tint: Tint, options: { bold?: boolean; italic?: boolean; link?: string } = {}): void {
        if (!text) return;
        const piece: Piece = { kind: "text", text, tint };
        if (options.bold) piece.bold = true;
        if (options.italic) piece.italic = true;
        if (options.link) piece.link = options.link;
        this.pieces.push(piece);
    }

    appendText(word: string, tint: Tint): void {
        if (!word) return;
        const last = this.pieces[this.pieces.length - 1];
        const canMerge =
            last?.kind === "text" && last.tint === tint && !last.link && !last.bold && !last.italic && !last.noSpace;
        if (canMerge) {
            last.text = `${last.text} ${word}`;
            return;
        }
        this.text(word, tint);
    }

    user(text: string, login: string, tint: Tint, bold = false): void {
        const piece: Piece = { kind: "user", text, login, tint };
        if (bold) piece.bold = true;
        this.pieces.push(piece);
    }

    noSpaceAfterLast(): void {
        const last = this.pieces[this.pieces.length - 1];
        if (last && last.kind !== "badge") last.noSpace = true;
    }

    emote(emote: Emote, mergeZeroWidth: boolean): void {
        const last = this.pieces[this.pieces.length - 1];
        if (emote.zeroWidth && mergeZeroWidth && last?.kind === "emote") {
            last.layers = [...(last.layers ?? []), emote];
            return;
        }
        this.pieces.push({ kind: "emote", emote });
    }

    badge(badge: Badge, tooltip = badge.tooltip): void {
        this.pieces.push({ kind: "badge", badge, tooltip });
    }

    link(word: string, tint: Tint = "text"): boolean {
        const parsed = parseLink(word);
        if (!parsed) return false;
        if (parsed.prefix) {
            this.text(parsed.prefix, tint);
            this.noSpaceAfterLast();
        }
        this.text(linkDisplayText(parsed), "link", { link: linkTarget(parsed) });
        if (parsed.suffix) {
            this.noSpaceAfterLast();
            this.text(parsed.suffix, tint);
        }
        return true;
    }

    isEmpty(): boolean {
        return this.pieces.length === 0;
    }
}

export type MessageInit = {
    id?: string;
    channel: string;
    time: number;
    pieces: Piece[];
    flags?: MessageFlags;
    text: string;
    login?: string;
    displayName?: string;
};

export function createMessage(init: MessageInit): ChatMessage {
    return {
        id: init.id ?? nextLocalId("sys"),
        channel: init.channel,
        time: init.time,
        login: init.login ?? "",
        displayName: init.displayName ?? "",
        pieces: init.pieces,
        flags: init.flags ?? {},
        text: init.text,
        searchText: init.text,
        count: 1,
    };
}
