import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { PushButton } from "../common/PushButton";
import { useApp } from "../state/AppContext";
import { useStore } from "../state/useStore";
import { SETTINGS_COLORS, chromeColors } from "../theme";
import { SettingsTitle } from "./SettingsTitle";

const TABLE_BACKGROUND = "#333333";

export function AccountsPage() {
    const { core, theme, fonts, openOverlay } = useApp();
    const colors = chromeColors(theme);
    const accounts = useStore(core.accounts);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const text = { color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize };

    const remove = () => {
        if (!selected) return;
        core.removeAccount(selected);
        setSelected(undefined);
    };

    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Accounts" />
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                <PushButton testID="account-open-add" label="Add" onPress={() => openOverlay({ kind: "addAccount" })} />
                <PushButton testID="account-remove" label="Remove" disabled={!selected} onPress={remove} />
            </View>
            <View testID="account-table" style={{ backgroundColor: TABLE_BACKGROUND, minHeight: 240, paddingVertical: 4 }}>
                <Text style={{ ...text, fontSize: 16, fontWeight: "300", paddingHorizontal: 6, paddingVertical: 2 }}>Twitch</Text>
                {accounts.accounts.map((account) => {
                    const isSelected = selected === account.login;
                    const isCurrent = accounts.current === account.login;
                    return (
                        <View
                            key={account.login}
                            testID={`account-${account.login}`}
                            accessibilityState={{ selected: isSelected }}
                            style={{
                                height: 24,
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 18,
                                backgroundColor: isSelected ? colors.highlight : undefined,
                            }}
                            onClick={() => setSelected(account.login)}
                        >
                            <Text style={{ ...text, flex: 1 }}>{account.login}</Text>
                            {isCurrent ? <Text style={{ ...text, color: SETTINGS_COLORS.description }}>current</Text> : null}
                        </View>
                    );
                })}
            </View>
            <Text style={{ ...text, color: SETTINGS_COLORS.description, marginTop: 8 }}>
                Switch between accounts with the account button left of the tabs.
            </Text>
        </View>
    );
}
