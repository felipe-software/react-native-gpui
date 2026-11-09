import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { LoginCredentials } from "../../data/api";
import { SETTINGS_FONT_SIZE, SETTINGS_LINE_HEIGHT, SETTINGS_STYLE } from "../settings/settingsStyle";
import { SLineEdit } from "../settings/SLineEdit";
import { SPushButton } from "../settings/SPushButton";
import { useApp } from "../state/AppContext";

type Props = { onCredentials: (credentials: LoginCredentials) => void };

const EMPTY: LoginCredentials = { username: "", userId: "", clientId: "", oauthToken: "" };

const INSTRUCTIONS = "1. Fill in your username\n2. Fill in your user ID\n3. Fill in your client ID\n4. Fill in your OAuth token\n5. Press Add user";

const FIELDS: Array<{ key: keyof LoginCredentials; label: string; secure?: boolean }> = [
    { key: "username", label: "Username" },
    { key: "userId", label: "User ID" },
    { key: "clientId", label: "Client ID" },
    { key: "oauthToken", label: "OAuth token", secure: true },
];

export function LoginAdvancedTab({ onCredentials }: Props) {
    const { fonts } = useApp();
    const [values, setValues] = useState<LoginCredentials>(EMPTY);
    const complete = FIELDS.every((field) => values[field.key].length > 0);
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };
    return (
        <View testID="login-advanced" style={{ flex: 1, gap: 6 }}>
            <Text style={{ ...text, lineHeight: SETTINGS_LINE_HEIGHT, marginBottom: 2 }}>{INSTRUCTIONS}</Text>
            {FIELDS.map((field) => (
                <View key={field.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ ...text, width: 88 }}>{field.label}</Text>
                    <SLineEdit
                        testID={`login-${field.key}`}
                        value={values[field.key]}
                        secure={field.secure}
                        grow
                        onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                    />
                </View>
            ))}
            <View style={{ flexDirection: "row", gap: 6 }}>
                <SPushButton testID="login-add-user" label="Add user" grow disabled={!complete} onPress={() => onCredentials(values)} />
                <SPushButton testID="login-clear" label="Clear fields" grow onPress={() => setValues(EMPTY)} />
            </View>
        </View>
    );
}
