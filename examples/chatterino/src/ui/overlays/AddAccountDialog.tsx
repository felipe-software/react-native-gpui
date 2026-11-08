import { useState } from "react";
import { Text, View } from "react-native-gpui";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";

type Status = { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string } | { kind: "added"; login: string };

const STEPS = [
    "1. Create a user access token for your own Twitch account with the chat:read and chat:edit scopes.",
    "   Use Twitch's developer tools: register an application at dev.twitch.tv/console, or run the Twitch CLI:",
    "   twitch token -u -s \"chat:read chat:edit\"",
    "2. Paste the token below (the oauth: prefix is optional) and press Add user.",
];

const NOTE = "The token is checked with id.twitch.tv and stored only on this computer. Never paste a token someone else gave you.";

function statusText(status: Status): string {
    if (status.kind === "checking") return "Checking the token...";
    if (status.kind === "error") return status.message;
    if (status.kind === "added") return `Added ${status.login}.`;
    return "";
}

export function AddAccountDialog({ onClose }: { onClose: () => void }) {
    const { core, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const [token, setToken] = useState("");
    const [status, setStatus] = useState<Status>({ kind: "idle" });
    const text = { color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize };
    const muted = { ...text, color: colors.muted };
    const checking = status.kind === "checking";
    const canAdd = token.trim().length > 0 && !checking;
    const message = statusText(status);
    const messageColor = status.kind === "error" ? "#ff6b6b" : colors.muted;

    const add = () => {
        if (!canAdd) return;
        setStatus({ kind: "checking" });
        core.addAccount(token).then(
            (account) => {
                setToken("");
                setStatus({ kind: "added", login: account.login });
            },
            (error: unknown) => setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) }),
        );
    };

    return (
        <FloatingWindow testID="add-account-dialog" title="Add new account" width={520} height={300} modal onClose={onClose}>
            <View style={{ flex: 1, padding: 11, gap: 8 }}>
                <View style={{ gap: 2 }}>
                    {STEPS.map((line) => (
                        <Text key={line} style={text}>
                            {line}
                        </Text>
                    ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={text}>OAuth token</Text>
                    <TextField grow testID="account-token" value={token} placeholder="oauth:..." secure autoFocus onChange={setToken} onSubmit={add} />
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                    <PushButton testID="account-add" label="Add user" primary disabled={!canAdd} onPress={add} />
                    <PushButton testID="account-clear" label="Clear fields" onPress={() => setToken("")} />
                </View>
                {message ? <Text testID="account-status" style={{ ...text, color: messageColor }}>{message}</Text> : null}
                <Text style={muted}>{NOTE}</Text>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <PushButton testID="account-dialog-close" label="Close" onPress={onClose} />
                </View>
            </View>
        </FloatingWindow>
    );
}
