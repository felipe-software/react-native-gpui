import { useEffect, useState } from "react";
import type { Channel } from "../../data/api";
import { hasModRights, watchChannelRights, type ChannelRights } from "../../data/user-state";

const NONE: ChannelRights = { moderator: false, vip: false, staff: false };

export function useModRights(channel: Channel | undefined, login: string | undefined): boolean {
    const [rights, setRights] = useState<ChannelRights>(NONE);
    useEffect(() => {
        if (!channel) {
            setRights(NONE);
            return;
        }
        return watchChannelRights(channel, setRights);
    }, [channel]);
    if (!channel) return false;
    return hasModRights(rights, channel.name, login);
}
