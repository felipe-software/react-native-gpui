import { useState } from "react";
import { Linking, View } from "react-native-gpui";
import { LOGIN_URL, parseLoginInfo } from "../../data/accounts";
import type { LoginCredentials } from "../../data/api";
import { RichText } from "../settings/RichText";
import { SETTINGS_STYLE } from "../settings/settingsStyle";
import { SLineEdit } from "../settings/SLineEdit";
import { SPushButton } from "../settings/SPushButton";
import { useApp } from "../state/AppContext";

type Props = { onCredentials: (credentials: LoginCredentials) => void };

const BROWSER_ERROR = `An error occurred while attempting to open the log in link (${LOGIN_URL}) - open it manually in your browser and proceed from there.`;

export function LoginBasicTab({ onCredentials }: Props) {
    const { core, openUrl } = useApp();
    const [browserFailed, setBrowserFailed] = useState(false);
    const [manual, setManual] = useState(false);
    const [pasted, setPasted] = useState("");

    const openLogin = () => {
        Linking.openURL(LOGIN_URL).catch(() => setBrowserFailed(true));
    };

    const paste = () => {
        const reading = core.readClipboard();
        if (!reading) {
            setManual(true);
            return;
        }
        reading.then(
            (text) => {
                core.clearClipboard();
                onCredentials(parseLoginInfo(text));
            },
            () => setManual(true),
        );
    };

    const submitPasted = () => {
        const credentials = parseLoginInfo(pasted.trim());
        setPasted("");
        onCredentials(credentials);
    };

    return (
        <View testID="login-basic" style={{ flex: 1, justifyContent: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
                <SPushButton testID="login-browser" label="Log in (Opens in browser)" primary onPress={openLogin} />
                <SPushButton testID="login-paste" label="Paste login info" onPress={paste} />
            </View>
            {manual ? (
                <View style={{ gap: 4 }}>
                    <SLineEdit
                        testID="login-paste-field"
                        value={pasted}
                        placeholder="Paste the login info here"
                        secure
                        autoFocus
                        onChange={setPasted}
                        onSubmit={submitPasted}
                    />
                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        <SPushButton testID="login-paste-submit" label="Add user" disabled={!pasted.trim()} onPress={submitPasted} />
                    </View>
                </View>
            ) : null}
            {browserFailed ? (
                <RichText
                    testID="login-browser-error"
                    text={BROWSER_ERROR}
                    links={[{ label: `the log in link (${LOGIN_URL})`, url: LOGIN_URL }]}
                    color={SETTINGS_STYLE.text}
                    onOpen={openUrl}
                />
            ) : null}
        </View>
    );
}
