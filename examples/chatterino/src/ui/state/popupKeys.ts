export type PopupKeyHandlers = {
    selectTab(index: number | "last"): void;
    stepTab(step: 1 | -1): void;
    focusSearch(): void;
};

const handlers = new Map<string, PopupKeyHandlers>();

export const popupKeys = {
    register(focusKey: string, popup: PopupKeyHandlers): () => void {
        handlers.set(focusKey, popup);
        return () => {
            if (handlers.get(focusKey) === popup) handlers.delete(focusKey);
        };
    },
    get(focusKey: string | undefined): PopupKeyHandlers | undefined {
        return focusKey ? handlers.get(focusKey) : undefined;
    },
};
