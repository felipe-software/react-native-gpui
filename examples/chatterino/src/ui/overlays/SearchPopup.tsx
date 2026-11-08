import { useEffect, useState } from "react";
import { Text, View, type ChatListMessage } from "react-native-gpui";
import type { Channel } from "../../data/api";
import { FeedList } from "../common/FeedList";
import { FloatingWindow } from "../common/FloatingWindow";
import { TextField } from "../common/TextField";
import { useApp, type Core } from "../state/AppContext";
import { MENTIONS_CHANNEL } from "../state/ids";
import { chromeColors } from "../theme";

type Props = { channels: string[]; onClose: () => void };

const DEBOUNCE_MS = 150;

function titleFor(channels: string[]): string {
    if (channels.length > 1) return "Searching in multiple channels' history";
    const [channel] = channels;
    if (channel === MENTIONS_CHANNEL) return "Searching in Mentions";
    return `Searching in ${channel}'s history`;
}

function lookup(core: Core, name: string): { channel: Channel; joined: boolean } | undefined {
    if (!name) return undefined;
    if (name === MENTIONS_CHANNEL) return { channel: core.mentions, joined: false };
    return { channel: core.join(name), joined: true };
}

export function SearchPopup({ channels, onClose }: Props) {
    const { core, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ChatListMessage[]>([]);
    const [sources, setSources] = useState<Channel[]>([]);

    useEffect(() => {
        const unique = [...new Set(channels.filter(Boolean))];
        const entries = unique.map((name) => lookup(core, name)).filter((entry): entry is { channel: Channel; joined: boolean } => !!entry);
        setSources(entries.map((entry) => entry.channel));
        return () => {
            for (const entry of entries) if (entry.joined) core.leave(entry.channel.name);
        };
    }, [core, channels.join(",")]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const searching = query.trim().length > 0;
            const found = sources.flatMap((channel) => (searching ? channel.search(query) : channel.snapshot()));
            setResults(found);
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query, sources]);

    const hasQuery = query.trim().length > 0;
    return (
        <FloatingWindow testID="search-popup" title={titleFor(channels)} width={400} height={600} onClose={onClose}>
            <View style={{ padding: 8 }}>
                <TextField testID="search-input" value={query} placeholder="Type to search" autoFocus onChange={setQuery} />
            </View>
            <View style={{ flex: 1 }}>
                <FeedList testID="search-results" messages={results} />
                {hasQuery && results.length === 0 ? (
                    <View style={{ position: "absolute", left: 0, right: 0, top: 16, alignItems: "center" }} pointerEvents="none">
                        <Text style={{ color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>No messages found</Text>
                    </View>
                ) : null}
            </View>
        </FloatingWindow>
    );
}
