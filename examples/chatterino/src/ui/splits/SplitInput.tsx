import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Svg, Text, TextInput, View, type TextInputHandle } from "react-native-gpui";
import type { Channel } from "../../data/api";
import { ICONS } from "../icons";
import {
    filterEmotes,
    insertWithSpacing,
    popupQuery,
    providerLabel,
    startTabCycle,
    stepTabCycle,
    tabCycleText,
    type TabCycle,
} from "../input/completion";
import { emptyHistory, nextMessage, previousMessage, recordSent } from "../input/history";
import { useApp } from "../state/AppContext";
import { inputRegistry, type InputCommand } from "../state/inputs";
import { useStore } from "../state/useStore";
import { CompletionPopup, type CompletionRow } from "./CompletionPopup";

export type SplitInputHandle = {
    focus(): void;
    insert(text: string): void;
    mention(name: string): void;
    command(command: InputCommand): boolean;
};

type Props = { splitId: string; channel: Channel | undefined; channelName: string };

const MESSAGE_LIMIT = 500;
const INPUT_HEIGHT = 37;

export const SplitInput = forwardRef<SplitInputHandle, Props>(function SplitInput({ splitId, channel, channelName }, ref) {
    const services = useApp();
    const { theme, fonts, prefs, core } = services;
    const accounts = useStore(core.accounts);
    const [text, setText] = useState("");
    const [popupIndex, setPopupIndex] = useState(0);
    const [dismissedAt, setDismissedAt] = useState<string | null>(null);
    const input = useRef<TextInputHandle>(null);
    const history = useRef(emptyHistory());
    const cycle = useRef<TabCycle | undefined>(undefined);
    const programmatic = useRef<string | null>(null);
    const textRef = useRef(text);
    textRef.current = text;

    const placeholder = accounts.current ? `Send message as ${accounts.current}...` : "Log in to send messages...";

    const replaceText = (next: string) => {
        programmatic.current = next;
        textRef.current = next;
        setText(next);
    };

    const query = popupQuery(text);
    const popupRows = useMemo<CompletionRow[]>(() => {
        if (!query || !channel || dismissedAt === text) return [];
        if (query.kind === "emote") {
            const emotes = filterEmotes([...channel.emotes(), ...core.globalEmotes()], query.query);
            return emotes.map((emote) => ({
                key: `${emote.provider}:${emote.name}`,
                label: `${emote.name} - ${providerLabel(emote)}`,
                image: emote.url,
                insert: `${emote.name} `,
            }));
        }
        const atStart = text.slice(0, query.start).trim().length === 0;
        return channel
            .complete(`@${query.query}`, atStart)
            .filter((completion) => completion.kind === "user")
            .map((completion) => ({ key: completion.text, label: completion.display, insert: completion.text }));
    }, [query?.kind, query?.query, channel, dismissedAt, text]);
    const popupOpen = popupRows.length > 0;
    const selectedRow = Math.min(popupIndex, Math.max(0, popupRows.length - 1));

    const acceptRow = (row: CompletionRow) => {
        if (!query) return;
        replaceText(text.slice(0, query.start) + row.insert);
        setPopupIndex(0);
    };

    const send = (keepInput: boolean) => {
        const message = textRef.current.replace(/\n/g, " ");
        if (!channel || message.trim().length === 0) return;
        history.current = recordSent(history.current, message);
        cycle.current = undefined;
        if (!keepInput) replaceText("");
        void channel.send(message);
    };

    const complete = (backwards: boolean) => {
        if (popupOpen) {
            acceptRow(popupRows[selectedRow]);
            return;
        }
        if (!channel) return;
        if (cycle.current) {
            cycle.current = stepTabCycle(cycle.current, backwards ? -1 : 1);
        } else {
            cycle.current = startTabCycle(textRef.current, (word, atStart) => channel.complete(word, atStart), backwards);
        }
        if (cycle.current) replaceText(tabCycleText(cycle.current));
    };

    const recall = (direction: "previous" | "next") => {
        if (popupOpen) {
            const step = direction === "previous" ? -1 : 1;
            setPopupIndex((index) => (index + step + popupRows.length) % popupRows.length);
            return;
        }
        const step = direction === "previous" ? previousMessage(history.current, textRef.current) : nextMessage(history.current, textRef.current);
        history.current = step.history;
        cycle.current = undefined;
        replaceText(step.text);
    };

    const runCommand = (command: InputCommand): boolean => {
        switch (command) {
            case "complete":
                complete(false);
                return true;
            case "completeBack":
                complete(true);
                return true;
            case "previous":
                recall("previous");
                return true;
            case "next":
                recall("next");
                return true;
            case "sendKeep":
                send(true);
                return true;
            case "escape":
                if (!popupOpen) return false;
                setDismissedAt(textRef.current);
                return true;
        }
    };

    useImperativeHandle(ref, () => ({
        focus: () => input.current?.focus(),
        insert: (insertion: string) => {
            replaceText(insertWithSpacing(textRef.current, insertion));
            input.current?.focus();
        },
        mention: (name: string) => {
            const isEmpty = textRef.current.trim().length === 0;
            const mention = isEmpty ? `@${name},` : `@${name}`;
            replaceText(insertWithSpacing(textRef.current, mention));
            input.current?.focus();
        },
        command: runCommand,
    }));

    const handleChange = (next: string) => {
        if (programmatic.current === next) {
            programmatic.current = null;
            return;
        }
        programmatic.current = null;
        cycle.current = undefined;
        textRef.current = next;
        setText(next);
        setPopupIndex(0);
    };

    const handleSubmit = () => {
        if (popupOpen) {
            acceptRow(popupRows[selectedRow]);
            return;
        }
        send(false);
    };

    const length = text.length;
    const overLimit = length > MESSAGE_LIMIT;
    const counterColor = overLimit ? "#ff0000" : theme.messages.system;
    const emoteColor = theme.isLight ? "#333333" : "#d0d0d0";

    return (
        <View testID={`split-input-${splitId}`} style={{ height: INPUT_HEIGHT }}>
            {popupOpen ? <CompletionPopup rows={popupRows} selected={selectedRow} theme={theme} fonts={fonts} onPick={acceptRow} /> : null}
            <View
                style={{
                    flex: 1,
                    flexDirection: "row",
                    borderWidth: 1,
                    borderColor: theme.input.border,
                    backgroundColor: theme.input.background,
                }}
            >
                <TextInput
                    ref={input}
                    testID={`input-${splitId}`}
                    accessibilityLabel={`Message ${channelName}`}
                    value={text}
                    placeholder={placeholder}
                    placeholderTextColor={theme.messages.placeholder}
                    onChangeText={handleChange}
                    onSubmitEditing={handleSubmit}
                    onFocus={() => {
                        inputRegistry.setFocused(splitId);
                        services.actions.focusSplit(splitId, false);
                    }}
                    onBlur={() => inputRegistry.blurred(splitId)}
                    style={{
                        flex: 1,
                        marginLeft: 5,
                        marginTop: -3,
                        height: 32,
                        color: theme.input.text,
                        fontFamily: fonts.chatFamily,
                        fontSize: fonts.chatSize,
                    }}
                />
                <View style={{ width: 24, justifyContent: "flex-end", alignItems: "center" }}>
                    {prefs.showMessageLength && length > 0 ? (
                        <Text testID={`input-length-${splitId}`} style={{ color: counterColor, fontFamily: fonts.uiFamily, fontSize: 10 }}>
                            {String(length)}
                        </Text>
                    ) : null}
                    <View
                        testID={`emote-button-${splitId}`}
                        accessibilityLabel="Emotes"
                        style={{ width: 24, height: 18, alignItems: "center", justifyContent: "center" }}
                        onClick={() => services.openOverlay({ kind: "emotes", splitId, channel: channelName })}
                    >
                        <Svg name={ICONS.emote} style={{ width: 12, height: 12, color: emoteColor }} />
                    </View>
                </View>
            </View>
        </View>
    );
});
