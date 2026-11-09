import { useEffect, useMemo, useRef, useState } from "react";
import { View, type TextInputHandle } from "react-native-gpui";
import type { EmoteInfo } from "../../data/api";
import { emojiShortCodes } from "../../data/emotes/emoji";
import { providerLabel } from "../input/completion";
import { FloatingWindow } from "../common/FloatingWindow";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { popupKeys } from "../state/popupKeys";
import { useChannel } from "../state/useChannel";
import { NotebookTab } from "../window/NotebookTab";
import { EmoteGrid } from "./EmoteGrid";
import { EMOTE_TABS, emoteSections, searchSections, type EmoteTab } from "./emoteSections";

type Props = { splitId: string; channel: string; onClose: () => void };

const WIDTH = 300;
const HEIGHT = 500;
const TITLE_BAR = 28;
const SEARCH_KEY = "field:emote-search";
const REFRESH_MS = 1000;

export function EmotePopup({ splitId, channel, onClose }: Props) {
    const { core, theme, fonts, hideTooltip } = useApp();
    const source = useChannel(core, channel);
    const [tab, setTab] = useState<EmoteTab>("Subs");
    const [query, setQuery] = useState("");
    const [version, setVersion] = useState(0);
    const search = useRef<TextInputHandle>(null);
    const tooltipOwner = `emotes:${splitId}`;
    const isTwitchChannel = !!channel && !channel.startsWith("/");
    const searching = query.trim().length > 0;

    useEffect(() => {
        if (!source) return;
        let pending: ReturnType<typeof setTimeout> | undefined;
        const unsubscribe = source.subscribe(() => {
            if (pending) return;
            pending = setTimeout(() => {
                pending = undefined;
                setVersion((current) => current + 1);
            }, REFRESH_MS);
        });
        return () => {
            unsubscribe();
            if (pending) clearTimeout(pending);
        };
    }, [source]);

    const emotes = useMemo(() => [...(source?.emotes() ?? []), ...core.globalEmotes()], [source, core, version]);
    const shortCodes = useMemo(() => {
        const codes = new Map<string, string>();
        for (const [code, emoji] of emojiShortCodes()) if (!codes.has(emoji.name)) codes.set(emoji.name, code);
        return codes;
    }, []);
    const shortCodeOf = (emote: EmoteInfo) => (emote.provider === "emoji" ? (shortCodes.get(emote.name) ?? emote.name) : emote.name);
    const sections = useMemo(
        () => (searching ? searchSections(emotes, query, channel, shortCodeOf) : emoteSections(tab, emotes, channel, isTwitchChannel)),
        [searching, emotes, query, channel, tab, isTwitchChannel, shortCodes],
    );
    const tooltipText = (emote: EmoteInfo) => (emote.provider === "emoji" ? `:${shortCodeOf(emote)}:\nEmoji` : `${emote.name}\n${providerLabel(emote)}`);

    useEffect(
        () =>
            popupKeys.register(SEARCH_KEY, {
                selectTab: (index) => {
                    const target = index === "last" ? EMOTE_TABS[EMOTE_TABS.length - 1] : EMOTE_TABS[index];
                    if (target) setTab(target);
                },
                stepTab: (step) => setTab((current) => EMOTE_TABS[(EMOTE_TABS.indexOf(current) + step + EMOTE_TABS.length) % EMOTE_TABS.length]),
                focusSearch: () => search.current?.focus(),
            }),
        [],
    );

    const insert = (emote: EmoteInfo) => {
        const text = emote.provider === "emoji" ? `:${shortCodeOf(emote)}:` : emote.name;
        inputRegistry.get(splitId)?.insert(text);
    };

    const close = () => {
        hideTooltip(tooltipOwner);
        onClose();
    };

    return (
        <FloatingWindow testID="emote-popup" title={`Emotes in #${channel}`} width={WIDTH} height={HEIGHT + TITLE_BAR} x={0} y={0} onClose={close}>
            <View style={{ padding: 8 }}>
                <TextField ref={search} testID="emote-search" value={query} placeholder="Search all emotes..." autoFocus onChange={(value) => setQuery(value.replace(/\s/g, ""))} />
            </View>
            {searching ? null : (
                <>
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
                                onSelect={() => setTab(name)}
                                onClose={() => undefined}
                                onRename={() => undefined}
                                onMenu={() => undefined}
                                onReorder={() => undefined}
                                onLayout={() => undefined}
                            />
                        ))}
                    </View>
                    <View style={{ height: 2, backgroundColor: theme.tabs.dividerLine }} />
                </>
            )}
            <View style={{ flex: 1 }} onMouseLeave={() => hideTooltip(tooltipOwner)}>
                <EmoteGrid
                    key={searching ? "search" : tab}
                    testID="emote-popup-list"
                    sections={sections}
                    tooltipOwner={tooltipOwner}
                    tooltipText={tooltipText}
                    onPick={insert}
                />
            </View>
        </FloatingWindow>
    );
}
