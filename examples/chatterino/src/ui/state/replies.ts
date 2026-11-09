import { createReplySender, type ReplySender } from "../../data/replies";
import type { Core } from "./AppContext";

const senders = new WeakMap<Core, ReplySender>();

export function replySenderFor(core: Core): ReplySender {
    const existing = senders.get(core);
    if (existing) return existing;
    const sender = createReplySender(core.accounts);
    senders.set(core, sender);
    return sender;
}
