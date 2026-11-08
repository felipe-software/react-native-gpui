import { useMemo, useRef, useState } from "react";
import { View, useWindowDimensions, type ChatListHoverEvent, type ChatListPressEvent } from "react-native-gpui";
import { FeedList } from "../common/FeedList";
import { FloatingWindow } from "../common/FloatingWindow";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { useChannel } from "../state/useChannel";
import { NotebookTab } from "../window/NotebookTab";
import { EMOTE_TABS, emoteSections, searchSections, sectionMessages, type EmoteTab } from "./emoteSections";

type Props = { splitId: string; channel: string; onClose: () => void };

const WIDTH = 300;
const HEIGHT = 500;

export function EmotePopup({ splitId, channel, onClose }: Props) {
    const { core, theme, fonts, showTooltip, hideTooltip } = useApp();
    const screen = useWindowDimensions();
    const source = useChannel(core, channel);
    const [tab, setTab] = useState<EmoteTab>("Channel");
    const [query, setQuery] = useState("");
    const tooltipOwner = `emotes:${splitId}`;
    const cursor = useRef<{ x: number; y: number } | undefined>(undefined);

    const emotes = useMemo(() => [...(source?.emotes() ?? []), ...core.globalEmotes()], [source, core]);
    const messages = useMemo(() => {
        const searching = query.trim().length > 0;
        const sections = searching ? searchSections(emotes, query) : emoteSections(tab, emotes, channel);
        return sectionMessages(sections, theme.messages.system);
    }, [emotes, query, tab, channel, theme.messages.system]);

    const insert = (event: ChatListPressEvent) => {
        if (event.target !== "emote" || !event.name || event.button !== "left") return;
        inputRegistry.get(splitId)?.insert(event.name);
    };

    const hover = (event: ChatListHoverEvent | null) => {
        if (!event || event.target !== "emote") {
            hideTooltip(tooltipOwner);
            return;
        }
        showTooltip({
            owner: tooltipOwner,
            text: event.tooltip ?? event.name ?? "",
            image: event.tooltipImage ?? event.url,
            anchor: { x: event.x, y: event.y, width: event.width, height: event.height },
            cursor: cursor.current,
            placement: "cursor",
        });
    };

    return (
        <FloatingWindow
            testID="emote-popup"
            title={`Emotes in #${channel}`}
            width={WIDTH}
            height={HEIGHT}
            x={screen.width - WIDTH - 24}
            y={screen.height - HEIGHT - 48}
            onClose={() => {
                hideTooltip(tooltipOwner);
                onClose();
            }}
        >
            <View style={{ padding: 8 }}>
                <TextField testID="emote-search" value={query} placeholder="Search all emotes..." autoFocus onChange={setQuery} />
            </View>
            <View style={{ flexDirection: "row", paddingLeft: 2, backgroundColor: theme.window.background }}>
                {EMOTE_TABS.map((name) => (
                    <NotebookTab
                        key={name}
                        id={`emotes-${name}`}
                        title={name}
                        state={name === tab ? "selected" : "regular"}
                        live={false}
                        showLive={false}
                        closable={false}
                        theme={theme}
                        fonts={fonts}
                        onSelect={() => {
                            setQuery("");
                            setTab(name);
                        }}
                        onClose={() => undefined}
                        onRename={() => undefined}
                        onMenu={() => undefined}
                        onReorder={() => undefined}
                        onLayout={() => undefined}
                    />
                ))}
            </View>
            <View style={{ height: 2, backgroundColor: theme.tabs.dividerLine }} />
            <View
                style={{ flex: 1 }}
                onMouseMove={(event) => {
                    cursor.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
                }}
                onMouseLeave={() => hideTooltip(tooltipOwner)}
            >
                <FeedList testID="emote-popup-list" messages={messages} showTimestamps={false} onPress={insert} onHover={hover} />
            </View>
        </FloatingWindow>
    );
}
