import { useEffect, useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native-gpui";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { inputRegistry } from "../state/inputs";
import { isSpecialChannel } from "../state/specialChannels";
import { useStore } from "../state/useStore";
import { stepSelection, switcherItems, type SwitcherItem } from "./switcherItems";
import { SwitcherRow } from "./SwitcherRow";

type Props = { onClose: () => void };

const WIDTH = 500;
const MIN_HEIGHT = 300;
const PADDING = 11;
const FIELD_KEY = "field:quick-switcher";
const OUTLINE = "#999999";

export function QuickSwitcher({ onClose }: Props) {
    const services = useApp();
    const { core, theme, actions } = services;
    const screen = useWindowDimensions();
    const layout = useStore(core.layout);
    const infos = useStore(services.channelInfos);
    const [text, setText] = useState("");
    const [typed, setTyped] = useState(false);
    const [selected, setSelected] = useState(0);
    const displayName = (channel: string) => (isSpecialChannel(channel) ? channel : (infos[channel]?.displayName ?? channel));
    const items = useMemo(() => (typed ? switcherItems(layout, text, displayName) : []), [typed, layout, text, infos]);
    const current = Math.min(selected, Math.max(0, items.length - 1));

    const activate = (item: SwitcherItem | undefined) => {
        if (!item) return;
        onClose();
        switch (item.kind) {
            case "split":
                actions.focusSplit(item.splitId);
                return;
            case "tab":
                actions.selectTab(item.tabId);
                return;
            case "newTab":
                actions.openChannelInNewTab(item.channel);
                return;
            case "newPopup":
                services.openOverlay({ kind: "splitPopup", channel: item.channel });
                return;
        }
    };

    useEffect(
        () =>
            inputRegistry.register(FIELD_KEY, {
                focus: () => undefined,
                insert: () => undefined,
                mention: () => undefined,
                reply: () => undefined,
                scrollToBottom: () => undefined,
                command: (command) => {
                    const count = items.length;
                    if (command === "previous" || command === "completeBack") setSelected((index) => stepSelection(Math.min(index, count - 1), count, -1));
                    else if (command === "next" || command === "complete") setSelected((index) => stepSelection(Math.min(index, count - 1), count, 1));
                    else if (command === "escape") onClose();
                    else return false;
                    return true;
                },
            }),
        [items.length, onClose],
    );

    const height = Math.max(MIN_HEIGHT, PADDING * 2 + 24 + 6 + items.length * 32);
    const left = Math.round((screen.width - WIDTH) / 2);
    const top = Math.round((screen.height - height) / 2);

    return (
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <View testID="quick-switcher-backdrop" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onMouseDown={onClose} />
            <View
                testID="quick-switcher"
                style={{
                    position: "absolute",
                    left,
                    top,
                    width: WIDTH,
                    height,
                    padding: PADDING,
                    gap: 6,
                    backgroundColor: theme.window.background,
                    borderWidth: 1,
                    borderColor: OUTLINE,
                }}
            >
                <TextField
                    testID="quick-switcher"
                    value={text}
                    placeholder="Jump to a channel or open a new one"
                    autoFocus
                    onChange={(value) => {
                        setText(value);
                        setTyped(true);
                        setSelected(0);
                    }}
                    onSubmit={() => activate(items[current])}
                />
                <View>
                    {items.map((item, index) => (
                        <SwitcherRow key={item.key} item={item} selected={index === current} onHover={() => setSelected(index)} onPress={() => activate(item)} />
                    ))}
                </View>
            </View>
        </View>
    );
}
