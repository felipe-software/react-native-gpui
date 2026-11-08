import { useState } from "react";
import { Text, View } from "react-native-gpui";
import type { HighlightPhrase, HighlightUser } from "../../data/api";
import { Checkbox } from "../common/Checkbox";
import { PushButton } from "../common/PushButton";
import { useApp } from "../state/AppContext";
import { chromeColors } from "../theme";
import { NotebookTab } from "../window/NotebookTab";
import { EditableRow } from "./EditableRow";
import { SettingsTitle } from "./SettingsTitle";
import { TableHeader } from "./TableHeader";
import { useSettingsUpdate } from "./useSettingsUpdate";

type Section = "Messages" | "Users";

const COLUMN = 64;
const PHRASE_COLUMNS = ["Show in\nMentions", "Flash\ntaskbar", "Enable\nregex", "Case-\nsensitive", "Play\nsound"];
const USER_COLUMNS = ["Show in\nMentions", "Flash\ntaskbar", "Play\nsound"];

function newPhrase(): HighlightPhrase {
    return { pattern: "", isRegex: false, caseSensitive: false, playSound: false, alert: false, showInMentions: true };
}

function newUser(): HighlightUser {
    return { login: "", playSound: false, alert: false, showInMentions: false };
}

function replaceAt<T>(list: T[], index: number, next: T): T[] {
    return list.map((entry, position) => (position === index ? next : entry));
}

export function HighlightsPage() {
    const { settings, theme, fonts } = useApp();
    const colors = chromeColors(theme);
    const { update } = useSettingsUpdate();
    const [section, setSection] = useState<Section>("Messages");
    const phrases = settings.highlightPhrases;
    const users = settings.highlightUsers;
    const description = { color: colors.muted, fontFamily: fonts.appFamily, fontSize: fonts.appSize - 1, marginVertical: 6 };

    const setPhrase = (index: number, patch: Partial<HighlightPhrase>) =>
        update({ highlightPhrases: replaceAt(phrases, index, { ...phrases[index], ...patch }) });
    const setUser = (index: number, patch: Partial<HighlightUser>) => update({ highlightUsers: replaceAt(users, index, { ...users[index], ...patch }) });

    const phraseFlag = (index: number, key: string, value: boolean) => {
        const map: Record<string, keyof HighlightPhrase> = {
            mentions: "showInMentions",
            alert: "alert",
            regex: "isRegex",
            case: "caseSensitive",
            sound: "playSound",
        };
        setPhrase(index, { [map[key]]: value });
    };
    const userFlag = (index: number, key: string, value: boolean) => {
        const map: Record<string, keyof HighlightUser> = { mentions: "showInMentions", alert: "alert", sound: "playSound" };
        setUser(index, { [map[key]]: value });
    };

    return (
        <View style={{ paddingBottom: 24 }}>
            <SettingsTitle text="Highlights" />
            <View style={{ flexDirection: "row", paddingLeft: 2 }}>
                {(["Messages", "Users"] as Section[]).map((name) => (
                    <NotebookTab
                        key={name}
                        id={`highlights-${name}`}
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
            {section === "Messages" ? (
                <View>
                    <Text style={description}>Play notification sounds and highlight messages based on certain patterns.</Text>
                    <TableHeader first="Pattern" columns={PHRASE_COLUMNS} columnWidth={COLUMN} extra="Color" />
                    {phrases.map((phrase, index) => (
                        <EditableRow
                            key={index}
                            testID={`phrase-${index}`}
                            text={phrase.pattern}
                            placeholder="Pattern"
                            columnWidth={COLUMN}
                            flags={[
                                { key: "mentions", value: phrase.showInMentions },
                                { key: "alert", value: phrase.alert },
                                { key: "regex", value: phrase.isRegex },
                                { key: "case", value: phrase.caseSensitive },
                                { key: "sound", value: phrase.playSound },
                            ]}
                            extra={phrase.color}
                            extraPlaceholder="#7f3f49"
                            onText={(value) => setPhrase(index, { pattern: value })}
                            onFlag={(key, value) => phraseFlag(index, key, value)}
                            onExtra={(value) => setPhrase(index, { color: value || undefined })}
                            onRemove={() => update({ highlightPhrases: phrases.filter((_, position) => position !== index) })}
                        />
                    ))}
                    <View style={{ flexDirection: "row", marginTop: 6 }}>
                        <PushButton testID="phrase-add" label="Add" onPress={() => update({ highlightPhrases: [...phrases, newPhrase()] })} />
                    </View>
                </View>
            ) : (
                <View>
                    <Text style={description}>Play notification sounds and highlight messages from certain users.</Text>
                    <TableHeader first="Username" columns={USER_COLUMNS} columnWidth={COLUMN} extra="Color" />
                    {users.map((user, index) => (
                        <EditableRow
                            key={index}
                            testID={`highlight-user-${index}`}
                            text={user.login}
                            placeholder="Username"
                            columnWidth={COLUMN}
                            flags={[
                                { key: "mentions", value: user.showInMentions },
                                { key: "alert", value: user.alert },
                                { key: "sound", value: user.playSound },
                            ]}
                            extra={user.color}
                            extraPlaceholder="#7f3f49"
                            onText={(value) => setUser(index, { login: value.toLowerCase() })}
                            onFlag={(key, value) => userFlag(index, key, value)}
                            onExtra={(value) => setUser(index, { color: value || undefined })}
                            onRemove={() => update({ highlightUsers: users.filter((_, position) => position !== index) })}
                        />
                    ))}
                    <View style={{ flexDirection: "row", marginTop: 6 }}>
                        <PushButton testID="highlight-user-add" label="Add" onPress={() => update({ highlightUsers: [...users, newUser()] })} />
                    </View>
                </View>
            )}
            <SettingsTitle text="Your name" subtitle />
            <Checkbox
                testID="setting-self-highlight"
                label="Highlight messages that mention you"
                checked={settings.highlightSelfMentions}
                onChange={(value) => update({ highlightSelfMentions: value })}
            />
            <Checkbox
                testID="setting-mention-sound"
                label="Play a sound when you are mentioned"
                checked={settings.mentionSound}
                onChange={(value) => update({ mentionSound: value })}
            />
            <Checkbox
                testID="setting-mention-notification"
                label="Show a notification when you are mentioned"
                checked={settings.mentionNotification}
                onChange={(value) => update({ mentionNotification: value })}
            />
        </View>
    );
}
