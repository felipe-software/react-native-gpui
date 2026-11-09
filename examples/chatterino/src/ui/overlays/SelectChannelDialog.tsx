import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { WindowLayout } from "../../data/api";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { RadioOption } from "../common/RadioOption";
import { TextField } from "../common/TextField";
import { tabOfSplit } from "../layout/tabs";
import { findNode } from "../layout/tree";
import { useApp } from "../state/AppContext";
import { SPECIAL_CHANNELS, specialKindOf, supportsSpecial, type SpecialKind } from "../state/specialChannels";
import { chromeColors } from "../theme";

type Props = { splitId: string; isNew: boolean; onClose: () => void };

type Choice = "channel" | SpecialKind;

type Option = { choice: Choice; label: string; description: string };

const OPTIONS: Option[] = [
    { choice: "channel", label: "Channel", description: "Join a Twitch channel by its channel name" },
    { choice: "whispers", label: "Whispers", description: "Shows the whispers that you receive while Chatterino is running" },
    { choice: "mentions", label: "Mentions", description: "Shows all the messages that highlight you from any channel" },
    { choice: "watching", label: "Watching", description: "Requires the Chatterino browser extension" },
    { choice: "live", label: "Live", description: "Shows when channels go live" },
    { choice: "automod", label: "AutoMod", description: "Shows when AutoMod catches a message in any channel you moderate." },
];

const WIDTH = 300;
const HEIGHT = 259;
const TITLE_BAR = 28;

function currentChannel(layout: WindowLayout, splitId: string): string {
    const tab = tabOfSplit(layout, splitId);
    const node = tab ? findNode(tab.root, splitId) : undefined;
    return node?.type === "split" ? node.channel : "";
}

export function SelectChannelDialog({ splitId, isNew, onClose }: Props) {
    const { core, theme, fonts, actions } = useApp();
    const colors = chromeColors(theme);
    const existing = currentChannel(core.layout.get(), splitId);
    const existingKind = specialKindOf(existing);
    const [choice, setChoice] = useState<Choice>(existingKind ?? "channel");
    const [name, setName] = useState(existingKind ? "" : existing);
    const supported = (option: Choice) => option === "channel" || option === "mentions" || supportsSpecial(core, option);

    const cancel = () => {
        onClose();
        if (isNew) actions.discardSplit(splitId);
    };

    const accept = () => {
        const channel = choice === "channel" ? name.trim().replace(/^#/, "").toLowerCase() : SPECIAL_CHANNELS[choice];
        if (!channel) return;
        onClose();
        actions.changeChannel(splitId, channel);
    };

    return (
        <FloatingWindow
            testID="select-channel-dialog"
            title={isNew ? "Open channel" : "Change channel"}
            width={WIDTH}
            height={HEIGHT + TITLE_BAR}
            modal
            onClose={cancel}
        >
            <View style={{ flex: 1, padding: 11, gap: 6 }}>
                <View style={{ flex: 1 }}>
                    {OPTIONS.map((option) => (
                        <View key={option.choice}>
                            <RadioOption
                                testID={`select-channel-${option.choice}`}
                                label={option.label}
                                selected={choice === option.choice}
                                disabled={!supported(option.choice)}
                                onSelect={() => setChoice(option.choice)}
                            />
                            {choice === option.choice ? (
                                <View style={{ paddingLeft: 20, paddingBottom: 4, gap: 6 }}>
                                    <Text style={{ color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>{option.description}</Text>
                                    {option.choice === "channel" ? (
                                        <TextField testID="select-channel-name" value={name} autoFocus onChange={setName} onSubmit={accept} />
                                    ) : null}
                                </View>
                            ) : null}
                        </View>
                    ))}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                    <PushButton testID="select-channel-cancel" label="Cancel" onPress={cancel} />
                    <PushButton testID="select-channel-ok" label="OK" primary onPress={accept} />
                </View>
            </View>
        </FloatingWindow>
    );
}
