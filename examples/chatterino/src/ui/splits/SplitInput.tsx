import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, TextInput, View, type LayoutChangeEvent, type TextInputHandle } from "react-native-gpui";
import type { Channel } from "../../data/api";
import { themedAsset } from "../assetPaths";
import { IconButton } from "../common/IconButton";
import { caretAfterEdit, caretAfterKey, type CaretKey } from "../input/caret";
import {
    filterEmotes,
    insertAt,
    popupQuery,
    providerLabel,
    replaceRange,
    startTabCycle,
    stepTabCycle,
    tabCycleCursor,
    tabCycleText,
    type TabCycle,
} from "../input/completion";
import { emptyHistory, nextMessage, previousMessage, recordSent } from "../input/history";
import {
    applyOverflowMode,
    keepsReplyPrefix,
    MESSAGE_LIMIT,
    replyBody,
    splitAtLimit,
    textWithReplyPrefix,
    textWithoutReplyPrefix,
    type MessageOverflowMode,
} from "../input/reply";
import { useApp } from "../state/AppContext";
import { inputRegistry, type InputCommand } from "../state/inputs";
import { replySenderFor } from "../state/replies";
import { useStore } from "../state/useStore";
import { CompletionPopup, type CompletionRow } from "./CompletionPopup";
import { mentionText } from "./messageMenu";
import { ReplyBar } from "./ReplyBar";
import type { ReplyTarget } from "./replyTarget";

export type SplitInputHandle = {
    focus(): void;
    insert(text: string): void;
    mention(name: string): void;
    reply(target: ReplyTarget): void;
    command(command: InputCommand): boolean;
};

type Props = {
    splitId: string;
    channel: Channel | undefined;
    channelName: string;
    focusKey?: string;
    fixedReply?: ReplyTarget;
    placeholder?: string;
    onEmotePopup?: () => void;
};

const MIN_HEIGHT = 37;
const MAX_HEIGHT = 150;
const MAX_HEIGHT_WITH_REPLY = 250;
const EMOTE_COLUMN = 24;
const TEXT_LEFT = 5;
const TEXT_TOP = 6;
const OVERFLOW_COLOR = "#ff0000";
const INPUT_WRAP_MARGIN = 10;

function lineHeightFor(fontSize: number): number {
    return Math.round(fontSize * 1.15);
}

export const SplitInput = forwardRef<SplitInputHandle, Props>(function SplitInput(
    { splitId, channel, channelName, focusKey, fixedReply, placeholder: placeholderOverride, onEmotePopup },
    ref,
) {
    const services = useApp();
    const { theme, fonts, prefs, core, settings } = services;
    const accounts = useStore(core.accounts);
    const [text, setText] = useState("");
    const [replyTarget, setReplyTarget] = useState<ReplyTarget | undefined>(undefined);
    const [popupIndex, setPopupIndex] = useState(0);
    const [dismissedAt, setDismissedAt] = useState<string | null>(null);
    const [textWidth, setTextWidth] = useState(0);
    const [measuredHeight, setMeasuredHeight] = useState(0);
    const [replyBarHeight, setReplyBarHeight] = useState(0);
    const input = useRef<TextInputHandle>(null);
    const history = useRef(emptyHistory());
    const cycle = useRef<TabCycle | undefined>(undefined);
    const programmatic = useRef<string | null>(null);
    const textRef = useRef(text);
    const caret = useRef<number | undefined>(undefined);
    const replyRef = useRef(replyTarget);
    textRef.current = text;
    replyRef.current = replyTarget;
    const registryKey = focusKey ?? splitId;
    const overflowMode = (settings.messageOverflow ?? "highlight") as MessageOverflowMode;
    const lineHeight = lineHeightFor(fonts.chatSize);

    const loggedInPlaceholder = accounts.current ? `Send message as ${accounts.current}...` : "Log in to send messages...";
    const placeholder = placeholderOverride ?? loggedInPlaceholder;

    const caretPosition = () => Math.min(caret.current ?? textRef.current.length, textRef.current.length);

    const replaceText = (next: string) => {
        const bounded = applyOverflowMode(next, overflowMode);
        programmatic.current = bounded;
        textRef.current = bounded;
        caret.current = bounded.length;
        setText(bounded);
        const target = replyRef.current;
        if (target && !keepsReplyPrefix(bounded, target.displayName)) setReplyTarget(undefined);
    };

    const query = popupQuery(text, Math.min(caret.current ?? text.length, text.length));
    const showEmotes = settings.emoteCompletionWithColon ?? true;
    const showUsers = settings.showUsernameCompletionMenu ?? true;
    const popupRows = useMemo<CompletionRow[]>(() => {
        if (!query || !channel || dismissedAt === text) return [];
        if (query.kind === "emote") {
            if (!showEmotes) return [];
            const emotes = filterEmotes([...channel.emotes(), ...core.globalEmotes()], query.query);
            return emotes.map((emote) => ({
                key: `${emote.provider}:${emote.name}`,
                label: `${emote.name} - ${providerLabel(emote)}`,
                image: emote.url,
                insert: `${emote.name} `,
            }));
        }
        if (!showUsers) return [];
        const atStart = text.slice(0, query.start).trim().length === 0;
        return channel
            .complete(`@${query.query}`, atStart)
            .filter((completion) => completion.kind === "user")
            .map((completion) => ({ key: completion.text, label: completion.display, insert: completion.text }));
    }, [query?.kind, query?.query, query?.start, channel, dismissedAt, text, showEmotes, showUsers]);
    const popupOpen = popupRows.length > 0;
    const selectedRow = Math.min(popupIndex, Math.max(0, popupRows.length - 1));

    const acceptRow = (row: CompletionRow) => {
        if (!query) return;
        const replaced = replaceRange(textRef.current, query.start, query.end, row.insert);
        replaceText(replaced.text);
        setPopupIndex(0);
    };

    const startReply = (target: ReplyTarget) => {
        const previous = replyRef.current;
        const base = previous ? textWithoutReplyPrefix(textRef.current, previous.displayName) : textRef.current;
        replyRef.current = target;
        setReplyTarget(target);
        replaceText(textWithReplyPrefix(base, target.displayName));
        cycle.current = undefined;
        input.current?.focus();
    };

    const cancelReply = () => {
        const target = replyRef.current;
        if (!target) return;
        replyRef.current = undefined;
        setReplyTarget(undefined);
        replaceText(textWithoutReplyPrefix(textRef.current, target.displayName));
        input.current?.focus();
    };

    const send = (keepInput: boolean) => {
        const raw = textRef.current;
        if (!channel) return;
        const target = replyRef.current;
        const inlineReply = target && keepsReplyPrefix(raw, target.displayName);
        const message = inlineReply ? replyBody(raw, target.displayName) : raw.replace(/\n/g, " ");
        const replyId = inlineReply ? target.messageId : fixedReply?.messageId;
        if (message.trim().length === 0) return;
        history.current = recordSent(history.current, message);
        cycle.current = undefined;
        if (!keepInput) {
            replyRef.current = undefined;
            setReplyTarget(undefined);
            replaceText("");
        }
        if (replyId) void replySenderFor(core).send(channel, replyId, message);
        else void channel.send(message);
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
            const completeWord = (word: string, atStart: boolean) => channel.complete(word, atStart);
            cycle.current = startTabCycle(textRef.current, completeWord, backwards, caretPosition());
        }
        if (!cycle.current) return;
        const next = tabCycleText(cycle.current);
        const active = cycle.current;
        replaceText(next);
        caret.current = tabCycleCursor(active);
        cycle.current = active;
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
            case "newline": {
                const at = caretPosition();
                const inserted = replaceRange(textRef.current, at, at, "\n");
                replaceText(inserted.text);
                caret.current = inserted.cursor;
                return true;
            }
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
            const inserted = insertAt(textRef.current, caretPosition(), insertion);
            replaceText(inserted.text);
            input.current?.focus();
        },
        mention: (name: string) => {
            const at = caretPosition();
            const current = textRef.current;
            const mention = mentionText(name, current.slice(0, at), settings.mentionUsersWithComma ?? true);
            replaceText(replaceRange(current, at, at, mention).text);
            input.current?.focus();
        },
        reply: startReply,
        command: runCommand,
    }));

    const handleChange = (next: string) => {
        if (programmatic.current === next) {
            programmatic.current = null;
            return;
        }
        programmatic.current = null;
        caret.current = caretAfterEdit(textRef.current, next);
        cycle.current = undefined;
        const bounded = applyOverflowMode(next, overflowMode);
        textRef.current = bounded;
        if (bounded !== next) {
            programmatic.current = bounded;
            caret.current = bounded.length;
        }
        setText(bounded);
        setPopupIndex(0);
        const target = replyRef.current;
        if (target && !keepsReplyPrefix(bounded, target.displayName)) setReplyTarget(undefined);
    };

    const handleKey = (event: { nativeEvent: CaretKey }) => {
        const moved = caretAfterKey(textRef.current, caretPosition(), event.nativeEvent);
        if (moved === undefined) return;
        caret.current = moved;
        cycle.current = undefined;
    };

    const handleSubmit = () => {
        if (popupOpen) {
            acceptRow(popupRows[selectedRow]);
            return;
        }
        send(false);
    };

    const handleTextLayout = (event: LayoutChangeEvent) => {
        const width = Math.round(event.nativeEvent.layout.width);
        if (width !== textWidth) setTextWidth(width);
    };

    const handleMeasure = (event: LayoutChangeEvent) => {
        const height = Math.round(event.nativeEvent.layout.height);
        if (height !== measuredHeight) setMeasuredHeight(height);
    };

    const inlineReply = replyTarget && !fixedReply ? replyTarget : undefined;
    const maxTotal = inlineReply ? MAX_HEIGHT_WITH_REPLY : MAX_HEIGHT;
    const replySpace = inlineReply ? replyBarHeight + (theme.isLight ? 3 : 1) : 0;
    const lines = Math.max(1, Math.round(measuredHeight / lineHeight));
    const wanted = MIN_HEIGHT + (lines - 1) * lineHeight;
    const boxHeight = Math.max(MIN_HEIGHT, Math.min(wanted, maxTotal - replySpace));
    const length = text.length;
    const overLimit = length > MESSAGE_LIMIT;
    const counterColor = overLimit ? OVERFLOW_COLOR : theme.input.text;
    const highlightOverflow = overLimit && overflowMode === "highlight";
    const overflow = splitAtLimit(text);
    const margin = theme.isLight ? 2 : 0;
    const textStyle = { fontFamily: fonts.chatFamily, fontSize: fonts.chatSize, lineHeight };
    const textHeight = boxHeight - TEXT_TOP - 2;
    const wrapWidth = Math.max(0, textWidth - INPUT_WRAP_MARGIN);

    return (
        <View testID={`split-input-${splitId}`} style={{ padding: margin }}>
            {popupOpen ? (
                <CompletionPopup rows={popupRows} selected={selectedRow} bottom={boxHeight + replySpace + margin} theme={theme} fonts={fonts} onPick={acceptRow} />
            ) : null}
            {inlineReply ? (
                <View
                    style={{ marginBottom: theme.isLight ? 3 : 1 }}
                    onLayout={(event) => setReplyBarHeight(Math.round(event.nativeEvent.layout.height))}
                >
                    <ReplyBar splitId={splitId} target={inlineReply} onCancel={cancelReply} />
                </View>
            ) : null}
            <View
                testID={`input-box-${splitId}`}
                style={{
                    height: boxHeight,
                    flexDirection: "row",
                    borderWidth: 1,
                    borderColor: theme.input.border,
                    backgroundColor: theme.input.background,
                    overflow: "hidden",
                }}
            >
                <View style={{ flex: 1, marginLeft: TEXT_LEFT, marginTop: TEXT_TOP }}>
                    <TextInput
                        ref={input}
                        testID={`input-${splitId}`}
                        accessibilityLabel={`Message ${channelName}`}
                        multiline
                        value={text}
                        placeholder={placeholder}
                        placeholderTextColor={theme.messages.placeholder}
                        onChangeText={handleChange}
                        onSubmitEditing={handleSubmit}
                        onKeyPress={handleKey}
                        onMouseDown={() => {
                            caret.current = undefined;
                        }}
                        onLayout={handleTextLayout}
                        onFocus={() => {
                            inputRegistry.setFocused(registryKey);
                            if (!fixedReply) services.actions.focusSplit(splitId, false);
                        }}
                        onBlur={() => inputRegistry.blurred(registryKey)}
                        style={{ height: textHeight, color: theme.input.text, ...textStyle }}
                    />
                    {highlightOverflow ? (
                        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: wrapWidth }}>
                            <Text testID={`input-overflow-${splitId}`} style={{ width: wrapWidth, color: "rgba(0, 0, 0, 0)", ...textStyle }}>
                                {overflow.allowed}
                                <Text style={{ color: OVERFLOW_COLOR }}>{overflow.overflow}</Text>
                            </Text>
                        </View>
                    ) : null}
                    {textWidth > 0 ? (
                        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: wrapWidth, opacity: 0 }}>
                            <Text onLayout={handleMeasure} style={{ width: wrapWidth, ...textStyle }}>
                                {`${text}\u200b`}
                            </Text>
                        </View>
                    ) : null}
                </View>
                <View style={{ minWidth: EMOTE_COLUMN, justifyContent: "flex-end", alignItems: "flex-end" }}>
                    {prefs.showMessageLength && length > 0 ? (
                        <Text testID={`input-length-${splitId}`} style={{ color: counterColor, fontFamily: fonts.chatFamily, fontSize: fonts.chatSize }}>
                            {String(length)}
                        </Text>
                    ) : null}
                    <IconButton
                        testID={`emote-button-${splitId}`}
                        label="Emotes"
                        icon={themedAsset(theme.isLight, "emote.svg", "emoteDark.svg")}
                        width={24}
                        height={18}
                        iconWidth={12}
                        iconHeight={12}
                        onPress={() => (onEmotePopup ? onEmotePopup() : services.openOverlay({ kind: "emotes", splitId, channel: channelName }))}
                    />
                </View>
            </View>
        </View>
    );
});
