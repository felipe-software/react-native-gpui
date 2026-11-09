import { useEffect, useMemo } from "react";
import type { Channel, SplitViewOptions } from "../../data/api";
import type { Core } from "./AppContext";

type SplitViewFactory = (channel: Channel, options: SplitViewOptions) => Channel & { dispose?: () => void };

export function useSplitChannel(core: Core, channel: Channel | undefined, options: SplitViewOptions): Channel | undefined {
    const factory = (core as { splitView?: SplitViewFactory }).splitView;
    const filtersKey = (options.filters ?? []).join(",");
    const moderationMode = !!options.moderationMode;
    const view = useMemo(() => {
        if (!channel || typeof factory !== "function") return channel;
        const filters = filtersKey ? filtersKey.split(",") : [];
        return factory.call(core, channel, { filters, moderationMode });
    }, [core, channel, factory, filtersKey, moderationMode]);
    useEffect(() => {
        if (view === channel) return;
        return () => (view as { dispose?: () => void } | undefined)?.dispose?.();
    }, [view, channel]);
    return view;
}
