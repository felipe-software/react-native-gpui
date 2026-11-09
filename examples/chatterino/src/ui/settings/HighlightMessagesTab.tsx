import { View } from "react-native-gpui";
import type { HighlightPhrase, Settings } from "../../data/api";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { fileName, HIGHLIGHT_LABELS, MESSAGE_BUILTINS, newPhrase, type BuiltinRow, type MessageRow } from "./highlightRows";
import { RegexInfoLink } from "./RegexInfoLink";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

function builtinFlag(settings: Settings, row: BuiltinRow, key: keyof BuiltinRow): boolean | undefined {
    const settingKey = row[key];
    if (!settingKey || key === "label" || key === "fallbackColor") return undefined;
    return settings[settingKey as keyof Settings] as boolean;
}

export function HighlightMessagesTab() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const phrases = settings.highlightPhrases;
    const rows: MessageRow[] = [...MESSAGE_BUILTINS.map((row): MessageRow => ({ kind: "builtin", row })), ...phrases.map((phrase): MessageRow => ({ kind: "phrase", phrase }))];
    const selfColor = settings.selfHighlightColor || "#7f3f497f";

    const setBuiltin = (row: BuiltinRow, key: keyof BuiltinRow, value: boolean | string) => {
        const settingKey = row[key];
        if (settingKey) update({ [settingKey as keyof Settings]: value } as Partial<Settings>);
    };
    const flagColumn = (title: string, builtinKey: keyof BuiltinRow, phraseKey: keyof HighlightPhrase, width: number, phraseOnly = false): TableColumn<MessageRow> => ({
        title,
        kind: "check",
        width,
        checked: (row) => (row.kind === "builtin" ? builtinFlag(settings, row.row, builtinKey) : (row.phrase[phraseKey] as boolean)),
        enabled: (row) => (row.kind === "builtin" ? !phraseOnly && !!row.row[builtinKey] : true),
        toggle: (row, value) => {
            if (row.kind === "builtin") {
                setBuiltin(row.row, builtinKey, value);
                return row;
            }
            return { kind: "phrase", phrase: { ...row.phrase, [phraseKey]: value } };
        },
    });

    const columns: TableColumn<MessageRow>[] = [
        {
            title: "Pattern",
            kind: "text",
            text: (row) => (row.kind === "builtin" ? row.row.label : row.phrase.pattern),
            enabled: (row) => row.kind === "phrase",
            textColor: () => "#ffffff",
            leadingCheck: (row) => (row.kind === "builtin" ? (settings[row.row.enabled] as boolean) : undefined),
            toggleLeading: (row, value) => {
                if (row.kind === "builtin") update({ [row.row.enabled]: value } as Partial<Settings>);
                return row;
            },
            edit: (row, value) => (row.kind === "phrase" ? { kind: "phrase", phrase: { ...row.phrase, pattern: value } } : row),
        },
        flagColumn("Show in\nMentions", "mentions", "showInMentions", 76),
        flagColumn("Flash\ntaskbar", "taskbar", "alert", 64),
        flagColumn("Enable\nregex", "label", "isRegex", 60, true),
        flagColumn("Case-\nsensitive", "label", "caseSensitive", 74, true),
        flagColumn("Play\nsound", "sound", "playSound", 52),
        {
            title: "Custom\nsound",
            kind: "action",
            width: 64,
            text: (row) => fileName(row.kind === "builtin" ? (row.row.soundUrl ? (settings[row.row.soundUrl] as string) : "") : row.phrase.soundUrl),
            enabled: (row) => row.kind === "phrase" || !!row.row.soundUrl,
            onActivate: (row, index) =>
                actions.pickSound((path) => {
                    if (row.kind === "builtin") setBuiltin(row.row, "soundUrl", path);
                    else update({ highlightPhrases: phrases.map((phrase, position) => (position === index - MESSAGE_BUILTINS.length ? { ...phrase, soundUrl: path } : phrase)) });
                }),
        },
        {
            title: "Color",
            kind: "color",
            width: 46,
            color: (row) => (row.kind === "builtin" ? (settings[row.row.color] as string) || row.row.fallbackColor : row.phrase.color ?? selfColor),
            onActivate: (row, index) =>
                actions.pickColor(row.kind === "builtin" ? (settings[row.row.color] as string) || row.row.fallbackColor : row.phrase.color, (color) => {
                    if (row.kind === "builtin") update({ [row.row.color]: color } as Partial<Settings>);
                    else update({ highlightPhrases: phrases.map((phrase, position) => (position === index - MESSAGE_BUILTINS.length ? { ...phrase, color } : phrase)) });
                }),
        },
    ];

    const change = (next: MessageRow[]) =>
        update({ highlightPhrases: next.filter((row): row is Extract<MessageRow, { kind: "phrase" }> => row.kind === "phrase").map((row) => row.phrase) });

    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text={HIGHLIGHT_LABELS.messages} greyable={false} />
            <EditableModelView
                testID="highlight-phrases"
                columns={columns}
                rows={rows}
                fixedRows={MESSAGE_BUILTINS.length}
                customButtons={<RegexInfoLink />}
                onAdd={() => update({ highlightPhrases: [...phrases, newPhrase(selfColor)] })}
                onChange={change}
            />
        </View>
    );
}
