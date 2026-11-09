import { View } from "react-native-gpui";
import type { Account } from "../../data/api";
import { useApp } from "../state/AppContext";
import { useStore } from "../state/useStore";
import { EditableModelView } from "./EditableModelView";
import type { TableColumn } from "./tableTypes";

type Row = { kind: "category"; label: string } | { kind: "account"; account: Account };

const COLUMNS: TableColumn<Row>[] = [
    {
        title: "",
        kind: "action",
        text: (row) => (row.kind === "category" ? row.label : row.account.login),
        textColor: (row) => (row.kind === "category" ? "#ffffff" : undefined),
    },
];

export function AccountsPage() {
    const { core, openOverlay } = useApp();
    const state = useStore(core.accounts);
    const rows: Row[] = state.accounts.length > 0 ? [{ kind: "category", label: "Twitch" }, ...state.accounts.map((account): Row => ({ kind: "account", account }))] : [];

    const change = (next: Row[]) => {
        const kept = new Set(next.filter((row): row is Extract<Row, { kind: "account" }> => row.kind === "account").map((row) => row.account.login));
        for (const account of state.accounts) if (!kept.has(account.login)) core.removeAccount(account.login);
    };

    return (
        <View testID="settings-accounts" style={{ flex: 1, padding: 10, paddingRight: 9 }}>
            <EditableModelView
                testID="accounts"
                columns={COLUMNS}
                rows={rows}
                movable={false}
                showHeader={false}
                fixedRows={rows.length > 0 ? 1 : 0}
                onAdd={() => openOverlay({ kind: "addAccount" })}
                onChange={change}
            />
        </View>
    );
}
