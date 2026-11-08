import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { IgnoredPhrase } from "../../data/api";
import { PushButton } from "../common/PushButton";
import { TextField } from "../common/TextField";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { NotebookTab } from "../window/NotebookTab";
import { EditableRow } from "./EditableRow";
import { SettingsTitle } from "./SettingsTitle";
import { TableHeader } from "./TableHeader";
import { useSettingsUpdate } from "./useSettingsUpdate";

type Section = "Messages" | "Users";

const COLUMN = 64;

function replaceAt<T>(list: T[], index: number, next: T): T[] {
    return list.map((entry, position) => (position === index ? next : entry));
}

export function IgnoresPage() {
    const { settings, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const { update } = useSettingsUpdate();
    const [section, setSection] = useState<Section>("Users");
    const [login, setLogin] = useState("");
    const phrases = settings.ignoredPhrases;
    const text = { color: colors.text, fontFamily: fonts.appFamily, fontSize: fonts.appSize };
    const description = { color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1, marginVertical: 6 };

    const addUser = () => {
        const clean = login.trim().replace(/^@/, "").toLowerCase();
        if (!clean || settings.ignoredUsers.includes(clean)) return;
        update({ ignoredUsers: [...settings.ignoredUsers, clean] });
        setLogin("");
    };
    const setPhrase = (index: number, patch: Partial<IgnoredPhrase>) =>
        update({ ignoredPhrases: replaceAt(phrases, index, { ...phrases[index], ...patch }) });

    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Ignores" />
            <View style={{ flexDirection: "row", paddingLeft: 2 }}>
                {(["Messages", "Users"] as Section[]).map((name) => (
                    <NotebookTab
                        key={name}
                        id={`ignores-${name}`}
                        title={name}
                        state={name === section ? "selected" : "regular"}
                        live={false}
                        showLive={false}
                        closable={false}
                        theme={theme}
                        fonts={fonts}
                        onSelect={() => setSection(name)}
                        onClose={() => undefined}
                        onRename={() => undefined}
                        onMenu={() => undefined}
                        onReorder={() => undefined}
                        onLayout={() => undefined}
                    />
                ))}
            </View>
            <View style={{ height: 2, backgroundColor: theme.tabs.dividerLine, marginBottom: 6 }} />
            {section === "Users" ? (
                <View>
                    <Text style={description}>Messages from these users are hidden.</Text>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <TextField grow testID="ignore-user-input" value={login} placeholder="Username" onChange={setLogin} onSubmit={addUser} />
                        <PushButton testID="ignore-user-add" label="Ignore user" onPress={addUser} />
                    </View>
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.field, minHeight: 80 }}>
                        {settings.ignoredUsers.map((user) => (
                            <View key={user} style={{ height: 26, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
                                <Text style={{ ...text, flex: 1 }}>{user}</Text>
                                <PushButton
                                    testID={`ignore-user-remove-${user}`}
                                    label="Unignore"
                                    onPress={() => update({ ignoredUsers: settings.ignoredUsers.filter((entry) => entry !== user) })}
                                />
                            </View>
                        ))}
                    </View>
                </View>
            ) : (
                <View>
                    <Text style={description}>Ignore messages based certain patterns.</Text>
                    <TableHeader first="Pattern" columns={["Regex", "Case-\nsensitive"]} columnWidth={COLUMN} extra="Replacement" />
                    {phrases.map((phrase, index) => (
                        <EditableRow
                            key={index}
                            testID={`ignore-phrase-${index}`}
                            text={phrase.pattern}
                            placeholder="Pattern"
                            columnWidth={COLUMN}
                            flags={[
                                { key: "regex", value: phrase.isRegex },
                                { key: "case", value: phrase.caseSensitive },
                            ]}
                            extra={phrase.replaceWith}
                            extraPlaceholder="(block)"
                            onText={(value) => setPhrase(index, { pattern: value })}
                            onFlag={(key, value) => setPhrase(index, key === "regex" ? { isRegex: value } : { caseSensitive: value })}
                            onExtra={(value) => setPhrase(index, { replaceWith: value || undefined })}
                            onRemove={() => update({ ignoredPhrases: phrases.filter((_, position) => position !== index) })}
                        />
                    ))}
                    <View style={{ flexDirection: "row", marginTop: 6 }}>
                        <PushButton
                            testID="ignore-phrase-add"
                            label="Add"
                            onPress={() => update({ ignoredPhrases: [...phrases, { pattern: "", isRegex: false, caseSensitive: false }] })}
                        />
                    </View>
                </View>
            )}
        </View>
    );
}
