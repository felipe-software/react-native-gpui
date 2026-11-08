import { useEffect, useState } from "react";
import type { Channel, ChannelInfo } from "../../data/api";
import type { Core } from "./AppContext";
import { MENTIONS_CHANNEL } from "./ids";
import type { Store } from "../../data/api";

export function useChannel(core: Core, name: string): Channel | undefined {
    const [channel, setChannel] = useState<Channel | undefined>(undefined);
    useEffect(() => {
        if (!name) {
            setChannel(undefined);
            return;
        }
        if (name === MENTIONS_CHANNEL) {
            setChannel(core.mentions);
            return;
        }
        setChannel(core.join(name));
        return () => core.leave(name);
    }, [core, name]);
    return channel;
}

export function useChannelInfo(channel: Channel | undefined, registry: Store<Record<string, ChannelInfo>>): ChannelInfo | undefined {
    const [info, setInfo] = useState<ChannelInfo | undefined>(() => channel?.info());
    useEffect(() => {
        if (!channel) {
            setInfo(undefined);
            return;
        }
        const publish = (next: ChannelInfo) => {
            setInfo(next);
            registry.set((current) => (current[channel.name] === next ? current : { ...current, [channel.name]: next }));
        };
        publish(channel.info());
        return channel.subscribe((event) => {
            if (event.type === "info") publish(event.info);
        });
    }, [channel, registry]);
    return info;
}
