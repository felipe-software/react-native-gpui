import type { Settings } from "../api";
import type { ChatMessage } from "./model";

export function relativeSimilarity(first: string, second: string): number {
    if (first.length === 0 || second.length === 0) return 0;
    let previous = new Array<number>(second.length).fill(0);
    let longest = 0;
    for (let i = 0; i < first.length; i++) {
        const current = new Array<number>(second.length).fill(0);
        for (let j = 0; j < second.length; j++) {
            if (first[i] !== second[j]) continue;
            current[j] = i === 0 || j === 0 ? 1 : previous[j - 1] + 1;
            if (current[j] > longest) longest = current[j];
        }
        previous = current;
    }
    if (longest === 0) return 0;
    return longest / Math.max(1, first.length, second.length);
}

function similarityTo(message: ChatMessage, history: readonly ChatMessage[], settings: Settings, now: number): number {
    let best = 0;
    const oldest = Math.max(0, history.length - settings.hideSimilarMaxMessagesToCheck);
    for (let i = history.length - 1; i >= oldest; i--) {
        const previous = history[i];
        if ((now - previous.time) / 1000 >= settings.hideSimilarMaxDelay) break;
        if (settings.hideSimilarBySameUser && message.login !== previous.login) continue;
        best = Math.max(best, relativeSimilarity(message.text, previous.text));
    }
    return best;
}

export function markSimilar(
    message: ChatMessage,
    history: readonly ChatMessage[],
    settings: Settings | undefined,
    selfLogin: string | undefined,
    now: number,
): void {
    if (!settings?.similarityEnabled || message.flags.system) return;
    const isMyself = !!selfLogin && message.login === selfLogin.toLowerCase();
    if (isMyself && !settings.hideSimilarMyself) return;
    if (similarityTo(message, history, settings, now) > settings.similarityPercentage) message.flags.similar = true;
}
