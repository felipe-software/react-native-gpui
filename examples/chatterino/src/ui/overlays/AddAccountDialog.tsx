import { useMemo, useState } from "react";
import { View } from "react-native-gpui";
import type { LoginCredentials } from "../../data/api";
import { FloatingWindow } from "../common/FloatingWindow";
import { SETTINGS_STYLE } from "../settings/settingsStyle";
import { SPushButton } from "../settings/SPushButton";
import { TabWidget } from "../settings/TabWidget";
import { AppContext, useApp } from "../state/AppContext";
import { themeFor } from "../theme";
import { LoginAdvancedTab } from "./LoginAdvancedTab";
import { LoginBasicTab } from "./LoginBasicTab";
import { LoginErrorBox } from "./LoginErrorBox";

const TABS = ["Basic", "Advanced"];

export function AddAccountDialog({ onClose }: { onClose: () => void }) {
    const services = useApp();
    const darkServices = useMemo(() => ({ ...services, theme: themeFor("dark") }), [services]);
    const [tab, setTab] = useState(TABS[0]);
    const [errors, setErrors] = useState<string[] | null>(null);

    const submit = (credentials: LoginCredentials, closeOnSuccess: boolean) => {
        const result = services.core.addAccountWithCredentials(credentials);
        if (!result.ok) {
            setErrors(result.errors);
            return;
        }
        if (closeOnSuccess) onClose();
    };

    return (
        <AppContext.Provider value={darkServices}>
            <FloatingWindow testID="add-account-dialog" title="Add new account" width={365} height={367} modal onClose={onClose}>
                <View style={{ flex: 1, backgroundColor: SETTINGS_STYLE.window, padding: 11, gap: 8 }}>
                    <TabWidget testID="login-tabs" tabs={TABS} selected={tab} onSelect={setTab}>
                        {tab === "Basic" ? (
                            <LoginBasicTab onCredentials={(credentials) => submit(credentials, true)} />
                        ) : (
                            <LoginAdvancedTab onCredentials={(credentials) => submit(credentials, false)} />
                        )}
                    </TabWidget>
                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        <SPushButton testID="account-dialog-close" label="Close" onPress={onClose} />
                    </View>
                    {errors ? <LoginErrorBox errors={errors} onClose={() => setErrors(null)} /> : null}
                </View>
            </FloatingWindow>
        </AppContext.Provider>
    );
}
