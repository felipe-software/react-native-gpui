export type SendHistory = { entries: string[]; index: number; draft: string };

export function emptyHistory(): SendHistory {
    return { entries: [], index: 0, draft: "" };
}

export function recordSent(history: SendHistory, message: string): SendHistory {
    const last = history.entries[history.entries.length - 1];
    const isDuplicate = last !== undefined && last.endsWith(message);
    const isBlank = message.trim().length === 0;
    const entries = isDuplicate || isBlank ? history.entries : [...history.entries, message];
    return { ...history, entries, index: entries.length };
}

export type HistoryStep = { history: SendHistory; text: string };

export function previousMessage(history: SendHistory, current: string): HistoryStep {
    if (history.entries.length === 0 || history.index === 0) return { history, text: current };
    const atEnd = history.index === history.entries.length;
    const draft = atEnd ? current : history.draft;
    const index = history.index - 1;
    return { history: { ...history, index, draft }, text: history.entries[index] };
}

export function nextMessage(history: SendHistory, current: string): HistoryStep {
    const { entries } = history;
    if (entries.length === 0) return { history, text: current };
    const inMiddle = history.index !== entries.length - 1 && history.index !== entries.length;
    if (inMiddle) {
        const index = history.index + 1;
        return { history: { ...history, index }, text: entries[index] };
    }
    const index = entries.length;
    const cameFromHistory = current === entries[index - 1];
    if (cameFromHistory) return { history: { ...history, index }, text: history.draft };
    return { history: { ...history, index, draft: current }, text: current };
}
