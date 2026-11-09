import type { ReplyTarget } from "../splits/replyTarget";

export type InputCommand = "complete" | "completeBack" | "previous" | "next" | "newline" | "sendKeep" | "escape";

export type InputController = {
    focus(): void;
    insert(text: string): void;
    mention(name: string, asReply: boolean): void;
    reply(target: ReplyTarget): void;
    command(command: InputCommand): boolean;
    scrollToBottom(): void;
};

const controllers = new Map<string, InputController>();
let focusedKey: string | undefined;

export const inputRegistry = {
    register(key: string, controller: InputController): () => void {
        controllers.set(key, controller);
        return () => {
            if (controllers.get(key) === controller) controllers.delete(key);
        };
    },
    get(key: string): InputController | undefined {
        return controllers.get(key);
    },
    setFocused(key: string | undefined): void {
        focusedKey = key;
    },
    blurred(key: string): void {
        if (focusedKey === key) focusedKey = undefined;
    },
    focused(): string | undefined {
        return focusedKey;
    },
};
