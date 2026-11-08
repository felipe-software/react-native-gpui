import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Svg, Text, View, type ChatListMessage } from "react-native-gpui";
import type { UserInfo } from "../../data/api";
import { Checkbox } from "../common/Checkbox";
import { CopyButton } from "../common/CopyButton";
import { FeedList } from "../common/FeedList";
import { FloatingWindow } from "../common/FloatingWindow";
import { PushButton } from "../common/PushButton";
import { accountAge, formatDate, localizeNumber } from "../format";
import { ICONS } from "../icons";
import { useApp } from "../state/AppContext";
import { MENTIONS_CHANNEL } from "../state/ids";
import { useChannel } from "../state/useChannel";
import { useStore } from "../state/useStore";
import { chromeColors } from "../theme";

type Props = { login: string; channel: string; x: number; y: number; onClose: () => void };

const WIDTH = 418;
const HEIGHT = 472;
const ID_COLOR = "#aaaaaa";
const PINNED = "#a34532";

type Load = { state: "loading" } | { state: "ready"; info: UserInfo } | { state: "failed" };

function authorLogin(message: ChatListMessage): string | undefined {
    const author = message.elements.find((element) => element.kind === "user");
    return author?.kind === "user" && author.text.endsWith(":") ? author.login : undefined;
}

export function UserCard({ login, channel, x, y, onClose }: Props) {
    const { core, theme, fonts, settings, openUrl, channelInfos } = useApp();
    const colors = chromeColors(theme);
    const infos = useStore(channelInfos);
    const accounts = useStore(core.accounts);
    const [load, setLoad] = useState<Load>({ state: "loading" });
    const [pinned, setPinned] = useState(false);
    const isTwitchChannel = !!channel && channel !== MENTIONS_CHANNEL;
    const source = useChannel(core, channel);
    const lower = login.toLowerCase();
    const loggedIn = !!accounts.current;

    useEffect(() => {
        let cancelled = false;
        core.userInfo(lower, isTwitchChannel ? channel : undefined).then(
            (info) => !cancelled && setLoad({ state: "ready", info }),
            () => !cancelled && setLoad({ state: "failed" }),
        );
        return () => {
            cancelled = true;
        };
    }, [core, lower, channel, isTwitchChannel]);

    const messages = useMemo(() => source?.userMessages(lower) ?? [], [source, lower]);
    const subscribe = useCallback(
        (append: (messages: ChatListMessage[]) => void) => {
            if (!source) return () => undefined;
            return source.subscribe((event) => {
                if (event.type !== "append") return;
                const mine = event.messages.filter((message) => authorLogin(message) === lower);
                if (mine.length > 0) append(mine);
            });
        },
        [source, lower],
    );

    const info = load.state === "ready" ? load.info : undefined;
    const unavailable = load.state === "failed" ? "(not available)" : "";
    const displayName = info?.displayName ?? login;
    const title = isTwitchChannel ? `${displayName}'s Usercard - #${channel}` : `${displayName}'s Usercard`;
    const live = infos[lower]?.live;
    const blocked = settings.ignoredUsers.includes(lower);
    const textColor = theme.window.text;
    const label = { color: textColor, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize, paddingHorizontal: 8 } as const;
    const created = info?.createdAt;
    const followers = info?.followers;
    const followed = info?.followedAt;
    const followersText = followers === undefined ? unavailable : localizeNumber(followers);
    const createdText = created === undefined ? unavailable : formatDate(created);
    const pinColor = theme.isLight ? "#4d4d4d" : "#b7b7b7";
    const copyColor = theme.isLight ? "#000000" : "#d0d0d0";
    const hasLocalizedName = !!info && info.displayName.toLowerCase() !== info.login;

    const toggleBlock = (next: boolean) =>
        core.settings.set((current) => ({
            ...current,
            ignoredUsers: next ? [...current.ignoredUsers, lower] : current.ignoredUsers.filter((entry) => entry !== lower),
        }));

    const separator = (
        <View style={{ height: 8, justifyContent: "center" }}>
            <View style={{ height: 1, backgroundColor: colors.separator }} />
        </View>
    );

    return (
        <FloatingWindow
            testID="user-card"
            title={title}
            width={WIDTH}
            height={HEIGHT}
            x={Math.round(x - WIDTH / 3)}
            y={Math.round(y - HEIGHT / 5)}
            frameless
            onClose={onClose}
            onBackdropPress={pinned ? undefined : onClose}
        >
            <View style={{ flex: 1, padding: 9, gap: 6 }}>
                <View style={{ height: 112, flexDirection: "row" }}>
                    <View
                        testID="user-card-avatar"
                        accessibilityRole="button"
                        accessibilityLabel="Open profile"
                        style={{ width: 100, height: 100, padding: 6, cursor: "pointer" }}
                        onClick={() => openUrl(`https://www.twitch.tv/${lower}`)}
                    >
                        {info?.avatarUrl ? <Image source={{ uri: info.avatarUrl }} style={{ width: 88, height: 88 }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 4, gap: 3 }}>
                        <View style={{ height: 18, flexDirection: "row", alignItems: "center" }}>
                            <Text
                                testID="user-card-name"
                                style={{ paddingLeft: 8, paddingRight: 1, color: textColor, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize, fontWeight: "bold" }}
                            >
                                {displayName}
                            </Text>
                            <CopyButton testID="user-card-copy-name" label="Copy name" text={displayName} color={copyColor} />
                            {live?.live ? <View style={{ width: 5, height: 5, borderRadius: 3, marginLeft: 4, backgroundColor: theme.tabs.live }} /> : null}
                            {hasLocalizedName ? <Text style={{ ...label, paddingHorizontal: 4 }}>{info?.login}</Text> : null}
                            <View style={{ flex: 1 }} />
                            <Text style={{ color: ID_COLOR, fontFamily: fonts.uiFamily, fontSize: fonts.uiSize }}>
                                {info?.id ? `ID: ${info.id}` : `ID ${unavailable}`}
                            </Text>
                            {info?.id ? <CopyButton testID="user-card-copy-id" label="Copy ID" text={info.id} color={copyColor} /> : null}
                            <View
                                testID="user-card-pin"
                                accessibilityRole="button"
                                accessibilityLabel="Pin Window"
                                accessibilityState={{ selected: pinned }}
                                style={{ width: 18, height: 18, padding: 3 }}
                                onClick={() => setPinned(!pinned)}
                            >
                                <Svg name={ICONS.pin} style={{ width: 12, height: 12, color: pinned ? PINNED : pinColor }} />
                            </View>
                        </View>
                        <Text style={label}>{`Followers: ${followersText}`}</Text>
                        <Text style={label}>{`Created: ${createdText}`}</Text>
                        {created !== undefined ? <Text style={{ ...label, color: ID_COLOR }}>{accountAge(created, Date.now())}</Text> : null}
                        {followed !== undefined ? <Text style={label}>{`❤ Following since ${formatDate(followed)}`}</Text> : null}
                        {live?.live ? <Text style={label}>{`Live with ${localizeNumber(live.viewers ?? 0)} viewers`}</Text> : null}
                    </View>
                </View>
                {separator}
                <View style={{ height: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Checkbox testID="user-card-block" label="Block" checked={blocked} onChange={toggleBlock} />
                    <Checkbox testID="user-card-ignore-highlights" label="Ignore highlights" checked={false} disabled={!loggedIn} onChange={() => undefined} />
                    <PushButton
                        testID="user-card-usercard"
                        label="Usercard"
                        disabled={!isTwitchChannel}
                        onPress={() => openUrl(`https://www.twitch.tv/popout/${channel}/viewercard/${lower}`)}
                    />
                </View>
                {separator}
                <View style={{ flex: 1, minHeight: 275 }}>
                    {source ? <FeedList testID="user-card-messages" messages={messages} subscribe={subscribe} /> : null}
                    {messages.length === 0 ? (
                        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
                            <Text style={{ color: textColor, fontFamily: fonts.appFamily, fontSize: fonts.appSize }}>No recent messages</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </FloatingWindow>
    );
}
