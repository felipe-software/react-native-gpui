export function caretAfterEdit(previous: string, next: string): number {
    const shortest = Math.min(previous.length, next.length);
    let prefix = 0;
    while (prefix < shortest && previous[prefix] === next[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < shortest - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
    return next.length - suffix;
}

function previousWordStart(text: string, caret: number): number {
    let index = caret;
    while (index > 0 && text[index - 1] === " ") index -= 1;
    while (index > 0 && text[index - 1] !== " ") index -= 1;
    return index;
}

function nextWordEnd(text: string, caret: number): number {
    let index = caret;
    while (index < text.length && text[index] === " ") index += 1;
    while (index < text.length && text[index] !== " ") index += 1;
    return index;
}

export type CaretKey = { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };

export function caretAfterKey(text: string, caret: number, event: CaretKey): number | undefined {
    const byWord = !!event.ctrlKey || !!event.altKey;
    const clamp = (value: number) => Math.max(0, Math.min(text.length, value));
    switch (event.key) {
        case "ArrowLeft":
            return byWord ? previousWordStart(text, caret) : clamp(caret - 1);
        case "ArrowRight":
            return byWord ? nextWordEnd(text, caret) : clamp(caret + 1);
        case "Home":
            return 0;
        case "End":
            return text.length;
        default:
            return undefined;
    }
}
