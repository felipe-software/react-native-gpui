import { View } from "react-native-gpui";
import type { HighlightUser, Settings } from "../../data/api";
import { useApp } from "../state/AppContext";
import { EditableModelView } from "./EditableModelView";
import { fileName, HIGHLIGHT_LABELS, newHighlightUser, USER_BUILTINS, type UserRow } from "./highlightRows";
import { RegexInfoLink } from "./RegexInfoLink";
import { SLabel } from "./SLabel";
import type { TableColumn } from "./tableTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

export function HighlightUsersTab() {
    const { settings } = useApp();
    const { update } = useSettingsUpdate();
    const actions = useSettingsActions();
    const users = settings.highlightUsers;
    const builtin = USER_BUILTINS[0];
    const rows: UserRow[] = [{ kind: "builtin", row: builtin }, ...users.map((user): UserRow => ({ kind: "user", user }))];
    const selfColor = settings.selfHighlightColor || "#7f3f497f";
    const offset = USER_BUILTINS.length;
    const setUser = (index: number, patch: Partial<HighlightUser>) =>
        update({ highlightUsers: users.map((user, position) => (position === index - offset ? { ...user, ...patch } : user)) });

    const userFlag = (title: string, key: "showInMentions" | "alert" | "playSound", width: number, builtinKey?: keyof Settings): TableColumn<UserRow> => ({
        title,
        kind: "check",
        width,
        checked: (row) => (row.kind === "builtin" ? (builtinKey ? (settings[builtinKey] as boolean) : undefined) : row.user[key]),
        enabled: (row) => row.kind === "user" || !!builtinKey,
        toggle: (row, value) => {
            if (row.kind === "builtin") {
                if (builtinKey) update({ [builtinKey]: value } as Partial<Settings>);
                return row;
            }
            return { kind: "user", user: { ...row.user, [key]: value } };
        },
    });

    const columns: TableColumn<UserRow>[] = [
        {
            title: "Username",
            kind: "text",
            text: (row) => (row.kind === "builtin" ? row.row.label : row.user.login),
            enabled: (row) => row.kind === "user",
            textColor: () => "#ffffff",
            leadingCheck: (row) => (row.kind === "builtin" ? settings.enableSelfMessageHighlight : undefined),
            toggleLeading: (row, value) => {
                update({ enableSelfMessageHighlight: value });
                return row;
            },
            edit: (row, value) => (row.kind === "user" ? { kind: "user", user: { ...row.user, login: value.trim() } } : row),
        },
        userFlag("Show in\nMentions", "showInMentions", 76, "showSelfMessageHighlightInMentions"),
        userFlag("Flash\ntaskbar", "alert", 64),
        userFlag("Play\nsound", "playSound", 52),
        {
            title: "Custom\nsound",
            kind: "action",
            width: 64,
            text: (row) => (row.kind === "user" ? fileName(row.user.soundUrl) : ""),
            enabled: (row) => row.kind === "user",
            onActivate: (row, index) => {
                if (row.kind === "user") actions.pickSound((path) => setUser(index, { soundUrl: path }));
            },
        },
        {
            title: "Color",
            kind: "color",
            width: 46,
            color: (row) => (row.kind === "builtin" ? settings.selfMessageHighlightColor || builtin.fallbackColor : row.user.color ?? selfColor),
            onActivate: (row, index) =>
                actions.pickColor(row.kind === "builtin" ? settings.selfMessageHighlightColor || builtin.fallbackColor : row.user.color, (color) => {
                    if (row.kind === "builtin") update({ selfMessageHighlightColor: color });
                    else setUser(index, { color });
                }),
        },
    ];

    const change = (next: UserRow[]) => update({ highlightUsers: next.filter((row): row is Extract<UserRow, { kind: "user" }> => row.kind === "user").map((row) => row.user) });

    return (
        <View style={{ flex: 1, gap: 6 }}>
            <SLabel text={HIGHLIGHT_LABELS.users} greyable={false} />
            <EditableModelView
                testID="highlight-users"
                columns={columns}
                rows={rows}
                fixedRows={offset}
                customButtons={<RegexInfoLink />}
                onAdd={() => update({ highlightUsers: [...users, newHighlightUser(selfColor)] })}
                onChange={change}
            />
        </View>
    );
}
