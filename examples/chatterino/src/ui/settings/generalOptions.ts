import type { ThemeName } from "../../data/api";
import {
    check,
    choice,
    colorButton,
    description,
    intInput,
    inverse,
    lineEdit,
    numberChoice,
    options,
    prefCheck,
    scaleLabel,
    separator,
    subtitle,
    TIMESTAMP_FORMATS,
    title,
    ZOOM_LEVELS,
} from "./generalHelpers";
import type { GeneralItem, SettingsAccess } from "./generalTypes";

const THEMES = options([
    ["white", "White"],
    ["light", "Light"],
    ["dark", "Dark"],
    ["black", "Black"],
]);

const THEME_CHOICES = [...THEMES, { value: "system", label: "System" }];

const KEY_MODIFIERS = options([
    ["none", "None"],
    ["shift", "Shift"],
    ["control", "Control"],
    ["alt", "Alt"],
    ["meta", "Meta"],
]);

const RIGHT_CLICK = options([
    ["reply", "Reply"],
    ["mention", "Mention"],
    ["ignore", "Ignore"],
]);

const NO_CHAT_LIST_SUPPORT = "the native chat list has no such option yet.";
const NO_PAUSED_ANIMATION = "the native chat list and images cannot pause their animations yet.";

function zoomOptions(): Array<[number, string]> {
    return ZOOM_LEVELS.map((value) => [value, scaleLabel(value)]);
}

function themeValue(access: SettingsAccess): string {
    return access.settings.systemTheme ? "system" : access.settings.theme;
}

function setTheme(access: SettingsAccess, value: string): void {
    if (value === "system") {
        access.update({ systemTheme: true });
        return;
    }
    access.update({ systemTheme: false, theme: value as ThemeName });
}

function pauseLabel(value: number): string {
    if (value < -0.5) return "Indefinite";
    if (value < 0.001) return "Disabled";
    return `${value}s`;
}

function interfaceItems(): GeneralItem[] {
    const systemOnly = (access: SettingsAccess) => access.settings.systemTheme;
    return [
        title("Interface"),
        { kind: "dropdown", id: "theme", label: "Theme", options: THEME_CHOICES, get: themeValue, set: setTheme },
        choice("darkSystemTheme", "Dark system theme", THEMES, {
            tooltip: "This theme is selected if your system is in a dark theme and you enabled the adaptive 'System' theme.",
            enabled: systemOnly,
        }),
        choice("lightSystemTheme", "Light system theme", THEMES, {
            tooltip: "This theme is selected if your system is in a light theme and you enabled the adaptive 'System' theme.",
            enabled: systemOnly,
        }),
        numberChoice("uiScale", "Zoom", zoomOptions()),
        choice(
            "tabDirection",
            "Tab layout",
            options([
                ["top", "Top"],
                ["left", "Left"],
                ["right", "Right"],
                ["bottom", "Bottom"],
            ]),
        ),
        {
            kind: "dropdown",
            id: "tabVisibility",
            label: "Tab visibility",
            tooltip: "Choose which tabs are visible in the notebook",
            options: options([
                ["all", "All tabs"],
                ["live", "Only live tabs"],
            ]),
            get: (access) => (access.prefs.tabVisibility === "live" ? "live" : "all"),
            set: (access, value) => access.updatePrefs({ tabVisibility: value === "live" ? "live" : "all" }),
        },
        choice(
            "tabStyle",
            "Tab style",
            options([
                ["normal", "Normal"],
                ["compact", "Compact"],
            ]),
        ),
        { kind: "font", id: "font", label: "Font" },
        inverse("hideReplyContext", "Show message reply context", {
            tooltip: "This setting will only affect how messages are shown. You can reply to a message regardless of this setting.",
        }),
        check("showReplyButton", "Show message reply button", { tooltip: "Show a reply button next to every chat message" }),
        prefCheck("showTabCloseButton", "Show tab close button", {
            tooltip: "When disabled, the x to close a tab will be hidden.\nTabs can still be closed by right-clicking or pressing Ctrl+Shift+W.",
        }),
        check("windowTopMost", "Always on top", {
            tooltip: "Always keep Chatterino as the top window.",
            unsupported: "the runtime has no always-on-top window API.",
        }),
        inverse("hidePreferencesButton", "Show preferences button (Ctrl+P to show)"),
        inverse("hideUserButton", "Show user button"),
        prefCheck("showTabLive", "Mark tabs with live channels", {
            tooltip: "Shows a red dot in the top right corner of a tab to indicate one of the channels in the tab is live.",
        }),
    ];
}

function chatItems(): GeneralItem[] {
    return [
        title("Chat"),
        {
            kind: "dropdown",
            id: "pauseOnHoverDuration",
            label: "Pause on mouse hover",
            options: [0, 0.5, 1, 2, 5, -1].map((value) => ({ value: String(value), label: pauseLabel(value) })),
            get: (access) => String(access.settings.pauseOnHoverDuration),
            set: (access, value) => access.update({ pauseOnHoverDuration: Number(value), pauseChatOnHover: Number(value) !== 0 }),
            tooltip: "Timed values pause while the pointer is over the chat and resume when it leaves.",
        },
        choice("pauseChatModifier", "Pause while holding a key", KEY_MODIFIERS, { unsupported: NO_CHAT_LIST_SUPPORT }),
        numberChoice(
            "mouseScrollMultiplier",
            "Mousewheel scroll speed",
            [
                [0.5, "0.5x"],
                [0.75, "0.75x"],
                [1, "Default"],
                [1.5, "1.5x"],
                [2, "2x"],
            ],
            { unsupported: NO_CHAT_LIST_SUPPORT },
        ),
        check("enableSmoothScrolling", "Smooth scrolling", { unsupported: NO_CHAT_LIST_SUPPORT }),
        check("enableSmoothScrollingNewMessages", "Smooth scrolling on new messages", { unsupported: NO_CHAT_LIST_SUPPORT }),
        check("showEmptyInput", "Show input when it's empty", { tooltip: "Show the chat box even when there is nothing typed." }),
        prefCheck("showMessageLength", "Show message length while typing", {
            tooltip:
                "Show how many characters are currently in your input box.\nUseful for making sure you don't go past the 500 character Twitch limit, or a lower limit enforced by a moderation bot",
        }),
        check("showSendWaitTimer", "Show countdown on slow mode or when timed out", {
            tooltip:
                "Show how long you may need to wait before being able to send in a Twitch channel again if the channel is in slow mode or if you have been timed out",
            keywords: ["slowmode", "timeout"],
        }),
        check("allowDuplicateMessages", "Allow sending duplicate messages", {
            tooltip: "Allow a single message to be repeatedly sent without any changes.",
        }),
        choice(
            "messageOverflow",
            "Message overflow",
            options([
                ["highlight", "Highlight"],
                ["prevent", "Prevent"],
                ["allow", "Allow"],
            ]),
            { tooltip: "Specify how Chatterino will handle messages that exceed Twitch message limits" },
        ),
        choice("usernameRightClickBehavior", "Username right-click behavior", RIGHT_CLICK, {
            tooltip: "Specify how Chatterino will handle right-clicking a username in chat when not holding the modifier.",
        }),
        choice("usernameRightClickModifierBehavior", "Username right-click with modifier behavior", RIGHT_CLICK, {
            tooltip: "Specify how Chatterino will handle right-clicking a username in chat when holding down the modifier.",
        }),
        choice("usernameRightClickModifier", "Modifier for alternate right-click action", KEY_MODIFIERS.slice(1)),
        check("hideScrollbarThumb", "Hide scrollbar thumb", {
            tooltip: "Hiding the scrollbar thumb (the handle you can drag) will disable all mouse interaction in the scrollbar.",
            keywords: ["scroll bar"],
            unsupported: NO_CHAT_LIST_SUPPORT,
        }),
        check("hideScrollbarHighlights", "Hide scrollbar highlights", { keywords: ["scroll bar"] }),
        check("pulseTextInputOnSelfMessage", "Pulse text input when one of your messages is successfully sent", {
            tooltip: "Pulses the text input in a green color whenever a message of yours is successfully sent in the matching channel.",
        }),
    ];
}

function messageItems(): GeneralItem[] {
    return [
        title("Messages"),
        check("showMessageSeparators", "Separate with lines", { tooltip: "Adds a line between each message to help better tell them apart." }),
        check("alternateMessageBackground", "Alternate background color", {
            tooltip: "Slightly change the background behind every other message to help better tell them apart.",
        }),
        prefCheck("fadeMessageHistory", "Reduce opacity of message history", {
            tooltip: "Reduce opacity of messages that were posted before Chatterino was started or while re-connection.",
        }),
        inverse("showDeletedMessages", "Hide deleted messages", { tooltip: "When enabled, messages deleted by moderators will be hidden." }),
        {
            kind: "dropdown",
            id: "timestampFormat",
            label: "Message timestamp format",
            tooltip: "a = am/pm, zzz = milliseconds",
            options: [{ value: "Disable", label: "Disable" }, ...TIMESTAMP_FORMATS.map((format) => ({ value: format, label: format }))],
            get: (access) => (access.settings.showTimestamps ? access.settings.timestampFormat : "Disable"),
            set: (access, value) =>
                value === "Disable" ? access.update({ showTimestamps: false }) : access.update({ showTimestamps: true, timestampFormat: value }),
        },
        numberChoice(
            "collapseMessagesMinLines",
            "Limit message height",
            [
                [0, "Never"],
                [2, "2 lines"],
                [3, "3 lines"],
                [4, "4 lines"],
                [5, "5 lines"],
            ],
            { unsupported: NO_CHAT_LIST_SUPPORT },
        ),
        numberChoice(
            "deletedMessageLengthLimit",
            "Limit length of deleted messages",
            [
                [0, "No limit"],
                [50, "50 characters"],
                [100, "100 characters"],
                [200, "200 characters"],
                [300, "300 characters"],
                [400, "400 characters"],
            ],
            { tooltip: "Limits the amount of characters displayed in deleted messages when announced via system message." },
        ),
        separator("messages"),
        check("showLastMessageIndicator", "Draw a line below the most recent message before switching applications.", {
            tooltip: "Adds an underline below the most recent message sent before you tabbed out of Chatterino.",
            unsupported: NO_CHAT_LIST_SUPPORT,
        }),
        choice(
            "lastMessagePattern",
            "Line style",
            options([
                ["solid", "Solid"],
                ["dotted", "Dotted"],
            ]),
            { unsupported: NO_CHAT_LIST_SUPPORT },
        ),
        colorButton("lastMessageColor", "Line color", { unsupported: NO_CHAT_LIST_SUPPORT }),
    ];
}

function emoteItems(): GeneralItem[] {
    const liveUpdates = "live emote updates need BetterTTV/7TV websockets, which this app does not open yet.";
    const activity = "this app does not report chat activity to emote providers.";
    return [
        title("Emotes"),
        check("enableEmoteImages", "Enable"),
        check("animateEmotes", "Animate"),
        check("animationsWhenFocused", "Animate only when Chatterino is focused", { unsupported: NO_PAUSED_ANIMATION }),
        check("enableZeroWidthEmotes", "Enable zero-width emotes", {
            tooltip: "When disabled, emotes that overlap other emotes, such as BTTV's cvMask and 7TV's RainTime, will appear as normal emotes.",
        }),
        check("emoteCompletionWithColon", "Enable emote completion by typing :", {
            tooltip:
                "With this setting enabled, typing the colon character opens the colon-completion popup which gives you an updating list of emotes matching the text after the colon.",
        }),
        check("useSmartEmoteCompletion", "Use experimental smarter emote completion."),
        numberChoice(
            "emoteScale",
            "Size",
            [
                [0.5, "0.5x"],
                [0.75, "0.75x"],
                [1, "Default"],
                [1.25, "1.25x"],
                [1.5, "1.5x"],
                [2, "2x"],
            ],
        ),
        check("removeSpacesBetweenEmotes", "Remove spaces between emotes", {
            tooltip: "When enabled, adjacent emotes will no longer have an added space separating them.",
        }),
        check("showUnlistedSevenTVEmotes", "Show unlisted 7TV emotes", { keywords: ["seventv"] }),
        choice(
            "emotesTooltipPreview",
            "Show emote & badge thumbnail on hover",
            options([
                ["dontShow", "Don't show"],
                ["alwaysShow", "Always show"],
                ["showOnShift", "Hold shift"],
            ]),
        ),
        choice(
            "emoteTooltipScale",
            "Emote & badge thumbnail size on hover",
            options([
                ["small", "Small"],
                ["medium", "Medium (default)"],
                ["large", "Large"],
                ["huge", "Huge"],
            ]),
        ),
        choice(
            "emojiSet",
            "Emoji style",
            options([
                ["twitter", "Twitter"],
                ["facebook", "Facebook"],
                ["apple", "Apple"],
                ["google", "Google"],
            ]),
        ),
        check("enableBTTVGlobalEmotes", "Show BetterTTV global emotes", { keywords: ["bttv"] }),
        check("enableBTTVChannelEmotes", "Show BetterTTV channel emotes", { keywords: ["bttv"] }),
        check("enableBTTVLiveUpdates", "Enable BetterTTV live emote updates (requires restart)", { keywords: ["bttv"], unsupported: liveUpdates }),
        check("sendBTTVActivity", "Send activity to BetterTTV", {
            tooltip:
                "When enabled, Chatterino will signal an activity to BetterTTV when you send a chat message. This is used for badges,  and personal emotes. When disabled, no activity is sent and others won't see your cosmetics.",
            keywords: ["bttv"],
            unsupported: activity,
        }),
        check("enableFFZGlobalEmotes", "Show FrankerFaceZ global emotes", { keywords: ["ffz"] }),
        check("enableFFZChannelEmotes", "Show FrankerFaceZ channel emotes", { keywords: ["ffz"] }),
        check("enableSevenTVGlobalEmotes", "Show 7TV global emotes", { keywords: ["seventv"] }),
        check("enableSevenTVChannelEmotes", "Show 7TV channel emotes", { keywords: ["seventv"] }),
        check("enableSevenTVEventAPI", "Enable 7TV live emote updates (requires restart)", { keywords: ["seventv"], unsupported: liveUpdates }),
        check("sendSevenTVActivity", "Send activity to 7TV", {
            tooltip:
                "When enabled, Chatterino will signal an activity to 7TV when you send a chat message. This is used for badges, paints, and personal emotes. When disabled, no activity is sent and others won't see your cosmetics.",
            keywords: ["seventv"],
            unsupported: activity,
        }),
    ];
}

function streamerItems(): GeneralItem[] {
    return [
        title("Streamer Mode"),
        description(
            "streamer",
            "Chatterino can automatically change behavior if it detects that any streaming software is running.\nSelect which things you want to change while streaming",
        ),
        choice(
            "streamerMode",
            "Enable Streamer Mode",
            options([
                ["off", "Disabled"],
                ["on", "Enabled"],
                ["auto", "Automatic (Detect streaming software)"],
            ]),
        ),
        check("streamerModeHideUsercardAvatars", "Hide usercard avatars", { tooltip: "Prevent potentially explicit avatars from showing." }),
        check("streamerModeHideLinkThumbnails", "Hide link thumbnails", {
            tooltip: "Prevent potentially explicit thumbnails from showing when hovering links.",
        }),
        check("streamerModeHideViewerCountAndDuration", "Hide viewer count and stream length while hovering over split header"),
        check("streamerModeHideModActions", "Hide moderation actions", {
            tooltip: "Hide bans, timeouts, and automod messages from appearing in chat.",
        }),
        check("streamerModeHideRestrictedUsers", "Hide messages from restricted users", {
            tooltip: "Restricted users can be marked by you, your moderators, or Twitch's AutoMod",
            unsupported: "restricted users are only reported over EventSub, which this app does not use.",
        }),
        check("streamerModeHideBlockedTermText", "Hide blocked terms", {
            tooltip:
                "Hide blocked terms from showing up in places like AutoMod messages. This can be useful in case you have some blocked terms that you don't want to show on stream.",
            unsupported: "AutoMod messages are only delivered over EventSub, which this app does not use.",
        }),
        check("streamerModeMuteMentions", "Mute mention sounds", { tooltip: "Mute your ping sound from playing." }),
        check("streamerModeSuppressLiveNotifications", "Suppress Live Notifications", {
            tooltip: "Hide Live notification popups from appearing. (Windows Only)",
        }),
        check("streamerModeSuppressInlineWhispers", "Suppress Inline Whispers", { tooltip: "Hide whispers sent to you from appearing in chat." }),
    ];
}

function linkPreviewItems(): GeneralItem[] {
    const resolver = "link previews need Chatterino's link resolver, which this app does not query.";
    const sizes: Array<[number, string]> = [
        [0, "Off"],
        [100, "Small"],
        [200, "Medium"],
        [300, "Large"],
    ];
    const streamSizes: Array<[number, string]> = [
        [0, "Off"],
        [1, "Small"],
        [2, "Medium"],
        [3, "Large"],
    ];
    return [
        title("Link Previews"),
        description(
            "links",
            'Extra information like "youtube video stats" or title of webpages can be loaded for all links if enabled. Optionally you can also show thumbnails for emotes, videos and more. The information is pulled from our servers. The Link Previews are loaded through an API hosted by the Chatterino developers. These are the API Terms of Services and Privacy Policy.',
            [
                { label: "an API", url: "https://github.com/Chatterino/api" },
                { label: "Terms of Services", url: "https://braize.pajlada.com/chatterino/legal/terms-of-service" },
                { label: "Privacy Policy", url: "https://braize.pajlada.com/chatterino/legal/privacy-policy" },
            ],
        ),
        check("showLinkPreviews", "Enable", { unsupported: resolver }),
        numberChoice("thumbnailSize", "Also show thumbnails if available", sizes, { unsupported: resolver }),
        numberChoice("thumbnailSizeStream", "Show thumbnails of streams", streamSizes),
    ];
}

function betaItems(): GeneralItem[] {
    return [
        title("Beta", true),
        description("beta", "You can receive updates earlier by ticking the box below. Report issues here.", [
            { label: "here", url: "https://chatterino.com/link/issues" },
        ]),
        check("betaUpdates", "Receive beta updates", { unsupported: "this app has no updater." }),
    ];
}

function browserItems(): GeneralItem[] {
    return [
        title("Browser Integration"),
        description("browser", "The browser extension updates the /watching split on Chatterino when Twitch.tv is open."),
        description("chrome", "Download for Google Chrome and similar browsers.", [
            {
                label: "Download for Google Chrome and similar browsers.",
                url: "https://chrome.google.com/webstore/detail/chatterino-native-host/glknmaideaikkmemifbfkhnomoknepka",
            },
        ]),
        description("firefox", "Download for Firefox", [
            { label: "Download for Firefox", url: "https://addons.mozilla.org/en-US/firefox/addon/chatterino-native-host/" },
        ]),
        description(
            "extension-ids",
            "A semicolon-separated list of Chrome or Firefox extension IDs allowed to interact with Chatterino's browser integration (requires restart).\nUsing multiple extension IDs from different browsers may cause issues.",
            undefined,
            "#bbbbbb",
        ),
        lineEdit("additionalExtensionIDs", "Extra extension IDs", {
            placeholder: "Extension;IDs;separated;by;semicolons",
            unsupported: "this app has no native messaging host for the browser extension.",
        }),
    ];
}

function cacheItems(): GeneralItem[] {
    return [
        title("AppData & Cache"),
        subtitle("Application Data"),
        description("appdata", "All local files like settings and cache files are store in this directory."),
        {
            kind: "buttons",
            id: "appdata-buttons",
            unsupported: "the runtime can only open web links, not folders.",
            buttons: [{ id: "open-appdata", label: "Open AppData directory", onPress: () => undefined }],
        },
        subtitle("Temporary files (Cache)"),
        description("cache", "Files that are used often (such as emotes) are saved to disk to reduce bandwidth usage and to speed up loading."),
        {
            kind: "buttons",
            id: "cache-buttons",
            unsupported: "images are cached by the runtime, so this app has no cache folder of its own.",
            buttons: [
                {
                    id: "cache-choose",
                    label: "Choose cache path",
                    onPress: (access) => access.pickDirectory((path) => access.update({ cachePath: path })),
                },
                { id: "cache-reset", label: "Reset", onPress: (access) => access.update({ cachePath: "" }) },
                {
                    id: "cache-clear",
                    label: "Clear Cache",
                    onPress: (access) =>
                        access.confirm(
                            "Clear cache",
                            "Are you sure that you want to clear your cache? Emotes may take longer to load next time Chatterino is started.",
                            () => undefined,
                        ),
                },
            ],
        },
    ];
}

function soundItems(): GeneralItem[] {
    return [
        title("Sound"),
        choice(
            "soundBackend",
            "Sound backend (requires restart)",
            options([
                ["miniaudio", "Miniaudio"],
                ["null", "Null"],
            ]),
            { tooltip: "Change this only if you're noticing issues with sound playback on your system" },
        ),
        check("soundMiniaudioKeepEngineAlive", "Keep sound backend alive (requires restart)", {
            tooltip:
                "This setting makes Chatterino output silence to your sound device, even if no ping is being played. Try this setting if you have issues with wireless devices not playing the first sound. Note that this can prevent your monitor or computer from sleeping.",
            unsupported: "the runtime opens an output stream per sound.",
        }),
    ];
}

function advancedItems(): GeneralItem[] {
    const overlay = "overlay windows are not available in this app yet.";
    return [
        title("Advanced"),
        subtitle("Chat title"),
        description("chat-title", "In live channels show:"),
        check("headerUptime", "Uptime", { tooltip: "Show how long the channel has been live" }),
        check("headerViewerCount", "Viewer count", { tooltip: "Show how many users are watching" }),
        check("headerGame", "Category", { tooltip: "Show what Category the stream is listed under" }),
        check("headerStreamTitle", "Title", { tooltip: "Show the stream title" }),
        subtitle("R9K"),
        description("r9k", "Hide similar messages to those previously seen. Toggle hidden messages by pressing Ctrl+H."),
        check("similarityEnabled", "Enable similarity checks"),
        check("hideSimilarBySameUser", "Only if by the same user", {
            tooltip: "When checked, messages that are very similar to each other can still be shown as long as they're sent by different users.",
        }),
        check("hideSimilarMyself", "Hide my own messages"),
        check("shownSimilarTriggerHighlights", "Receive notification sounds from hidden messages"),
        numberChoice(
            "similarityPercentage",
            "Similarity threshold",
            [
                [0.5, "0.5"],
                [0.75, "0.75"],
                [0.9, "0.9"],
            ],
            { tooltip: "A value of 0.9 means the messages need to be 90% similar to be marked as similar." },
        ),
        numberChoice(
            "hideSimilarMaxDelay",
            "Maximum delay between messages",
            [5, 10, 15, 30, 60, 120].map((value) => [value, `${value}s`] as [number, string]),
            { tooltip: "A value of 5s means if there's a 5s break between messages, we will stop looking further through the messages for similarities." },
        ),
        numberChoice(
            "hideSimilarMaxMessagesToCheck",
            "Amount of previous messages to check",
            [1, 2, 3, 4, 5].map((value) => [value, String(value)] as [number, string]),
            {
                tooltip:
                    "How many messages in the history should be compared to a new one to establish its similarity rating. Messages in the history will be compared to only if they are new enough.",
            },
        ),
        subtitle("Visible badges"),
        check("showBadgesGlobalAuthority", "Authority", { tooltip: "e.g. staff, admin" }),
        check("showBadgesPredictions", "Predictions"),
        check("showBadgesChannelAuthority", "Channel", { tooltip: "e.g. broadcaster, moderator" }),
        check("showBadgesSubscription", "Subscriber "),
        check("showBadgesVanity", "Vanity", { tooltip: "e.g. prime, bits, sub gifter" }),
        check("showBadgesChatterino", "Chatterino", { tooltip: "e.g. Chatterino Supporter/Contributor/Developer" }),
        check("showBadgesFfz", "FrankerFaceZ", { tooltip: "e.g. Bot, FrankerFaceZ supporter, FrankerFaceZ developer", keywords: ["ffz"] }),
        check("showBadgesSevenTV", "7TV", { tooltip: "Badges for 7TV admins, developers, and supporters", keywords: ["seventv"] }),
        check("showBadgesBttv", "BetterTTV", { keywords: ["bttv"] }),
        separator("badges"),
        check("useCustomFfzModeratorBadges", "Use custom FrankerFaceZ moderator badges", { keywords: ["ffz"] }),
        check("useCustomFfzVipBadges", "Use custom FrankerFaceZ VIP badges", { keywords: ["ffz"] }),
        subtitle("Overlay"),
        numberChoice("overlayScaleFactor", "Zoom factor", zoomOptions(), {
            tooltip: "The final scale of the messages in the overlay is computed by multiplying this zoom factor with the global zoom level.",
            unsupported: overlay,
        }),
        intInput("overlayBackgroundOpacity", "Background opacity (0-255)", 0, 255, 1, {
            tooltip:
                "Controls the opacity of the (possibly alternating) background behind messages. The color is set through the current theme. 255 corresponds to a fully opaque background.",
            unsupported: overlay,
        }),
        check("enableOverlayShadow", "Enable Shadow", {
            tooltip: "Enables a drop shadow on the overlay. This will use more processing power.",
            unsupported: overlay,
        }),
        intInput("overlayShadowOpacity", "Shadow opacity (0-255)", 0, 255, 1, {
            tooltip: "Controls the opacity of the added drop shadow. 255 corresponds to a fully opaque shadow.",
            unsupported: overlay,
        }),
        colorButton("overlayShadowColor", "Shadow color", { unsupported: overlay }),
        intInput("overlayShadowRadius", "Shadow radius", 0, 40, 1, {
            suffix: "dp",
            tooltip: "Controls how far the shadow is spread (the blur radius) in device-independent pixels.",
            unsupported: overlay,
        }),
        intInput("overlayShadowOffsetX", "Shadow offset x", -20, 20, 1, {
            suffix: "dp",
            tooltip:
                "Controls how far the shadow is offset on the x axis in device-independent pixels. A negative value offsets to the left and a positive to the right.",
            unsupported: overlay,
        }),
        intInput("overlayShadowOffsetY", "Shadow offset y", -20, 20, 1, {
            suffix: "dp",
            tooltip:
                "Controls how far the shadow is offset on the y axis in device-independent pixels. A negative value offsets to the top and a positive to the bottom.",
            unsupported: overlay,
        }),
        ...searchItems(),
        ...miscItems(),
    ];
}

const SEARCH_PRESETS: Record<string, { url: string; name: string }> = {
    DuckDuckGo: { url: "https://duckduckgo.com/?q=", name: "DuckDuckGo" },
    Bing: { url: "https://www.bing.com/search?q=", name: "Bing" },
    Google: { url: "https://www.google.com/search?q=", name: "Google" },
};

function searchItems(): GeneralItem[] {
    const searchOn = (access: SettingsAccess) => access.settings.searchEnabled;
    return [
        subtitle("Search"),
        description(
            "search",
            "Search engine which appears when you select text and right-click a message. Select a search engine preset from the dropdown below, or fill in your custom search engine URL and name.",
        ),
        check("searchEnabled", "Enable search in right-click context menu", {
            tooltip: "Allow searching selected text using a search engine from the right-click context menu.",
        }),
        {
            kind: "dropdown",
            id: "searchPreset",
            label: "Search engine preset",
            tooltip: "Select a search engine preset",
            placeholder: "Select...",
            options: Object.keys(SEARCH_PRESETS).map((name) => ({ value: name, label: name })),
            get: () => "",
            set: (access, value) => {
                const preset = SEARCH_PRESETS[value];
                if (preset) access.update({ searchEngineUrl: preset.url, searchEngineName: preset.name });
            },
            enabled: searchOn,
        },
        lineEdit("searchEngineUrl", "Search engine URL", { enabled: searchOn }),
        lineEdit("searchEngineName", "Search engine name", { enabled: searchOn }),
    ];
}

function miscItems(): GeneralItem[] {
    return [
        subtitle("Miscellaneous"),
        check("restartOnCrash", "Restart on crash (requires restart)", {
            tooltip: "When possible, restart Chatterino if the program crashes",
            unsupported: "the runtime has no crash handler.",
        }),
        check("useKeyring", "Use libsecret/KWallet/Gnome keychain to secure passwords", {
            unsupported: "accounts are stored in the app's local storage file; the runtime has no keychain API.",
        }),
        inverse("hideModerationActions", "Show moderation messages", {
            tooltip: "Show messages for timeouts, bans, and other moderator actions.",
        }),
        inverse("hideDeletionActions", "Show deletions of single messages", {
            tooltip: "Show when a single message is deleted.\ne.g. A message from TreuKS was deleted: abc",
        }),
        check("colorizeNicknames", "Colorize users without color set (gray names)", {
            tooltip: "Grant a random color to users who never set a color for themselves",
        }),
        check("mentionUsersWithComma", "Mention users with a comma", {
            tooltip: "When using tab-completon, if the username is at the start of the message, include a comma at the end of the name.\ne.g. pajl -> pajlada,",
        }),
        check("showJoins", "Show joined users (< 1000 chatters)", {
            tooltip:
                "Show a Twitch system message stating what users have joined the chat, only available when the chat has less than 1000 users",
        }),
        check("showParts", "Show parted users (< 1000 chatters)", {
            tooltip: "Show a Twitch system message stating what users have left the chat, only available when chat has less than 1000 users",
        }),
        check("autoCloseUserPopup", "Automatically close user popup when it loses focus"),
        check("autoCloseThreadPopup", "Automatically close reply thread popup when it loses focus"),
        check("lowercaseDomains", "Lowercase domains (anti-phishing)", {
            tooltip: "Make all clickable links lowercase to deter phishing attempts.",
        }),
        check("showPronouns", "Show user's pronouns in user card", {
            description: "Pronouns are retrieved from pr.alejo.io when a user card is opened.",
        }),
        check("showTitleInLiveMessage", "Show stream title in live message", {
            tooltip:
                "The title in the message will be the title the streamer set when they went live, and will not update as the streamer updates their title.",
        }),
        check("boldUsernames", "Bold @usernames", { tooltip: "Bold @mentions to make them more noticeable." }),
        check("colorUsernames", "Color @usernames", {
            tooltip: "If Chatterino has seen a user, highlight @mention's of them with their Twitch color.",
        }),
        check("findAllUsernames", "Try to find usernames without @ prefix", {
            tooltip: "Find mentions of users in chat without the @ prefix.",
        }),
        check("showUsernameCompletionMenu", "Show username autocompletion popup menu"),
        check("alwaysIncludeBroadcasterInUserCompletions", "Always include broadcaster in user completions", {
            tooltip: "This will ensure a broadcaster is always easy to ping, even if they don't have chat open or have typed recently.",
        }),
        choice(
            "usernameDisplayMode",
            "Username style",
            options([
                ["username", "Username"],
                ["localizedName", "Localized name"],
                ["usernameAndLocalizedName", "Username and localized name"],
            ]),
            {
                tooltip:
                    'Customizes how you see Asian Language names.\nUsing an option that includes "localized" will display the username in it\'s respective Asian language.\ne.g. Username and localized: testaccount_420(테스트계정420)\nUsername: testaccount_420\nLocalized name: 테스트계정420',
            },
        ),
        numberChoice(
            "boldScale",
            "Username font weight",
            [
                [50, "50"],
                [63, "Default"],
                [75, "75"],
                [100, "100"],
            ],
            { unsupported: "the native chat list draws usernames in one bold weight." },
        ),
        check("linksDoubleClickOnly", "Double click to open links and other elements in chat", {
            tooltip:
                "When enabled, opening links/usercards requires double-clicking.\nUseful making sure you don't accidentally click on suspicious links.",
        }),
        check("unshortLinks", "Unshorten links", {
            tooltip: 'When enabled, "right-click + copy link" will copy the unshortened version of the link.\ne.g. https://bit.ly/mrfors -> https://forsen.tv/',
            unsupported: "unshortening needs Chatterino's link resolver, which this app does not query.",
        }),
        check("prefixOnlyEmoteCompletion", "Only search for emote autocompletion at the start of emote names", {
            tooltip: "When disabled, emote tab-completion will complete based on any part of the name.\ne.g. sheffy -> DatSheffy",
        }),
        check("userCompletionOnlyWithAt", "Only search for username autocompletion with an @", {
            tooltip: "When enabled, username tab-completion will only complete when using @\ne.g. pajl -> pajl | @pajl -> @pajlada",
        }),
        check("inlineWhispers", "Show Twitch whispers inline", { tooltip: "Show whispers as messages in all splits instead of just /whispers." }),
        check("highlightInlineWhispers", "Highlight received inline whispers", {
            tooltip: 'Highlight the whispers shown in all splits.\nIf "Show Twitch whispers inline" is disabled, this setting will do nothing.',
        }),
        check("autoSubToParticipatedThreads", "Automatically subscribe to participated reply threads", {
            tooltip:
                'When enabled, you will automatically subscribe to reply threads you participate in.\nThis means reply threads you participate in will use your "Subscribed Reply Threads" highlight settings.',
        }),
        check("loadHistoryOnJoin", "Load message history on connect"),
        intInput("historyLimit", "Max number of history messages to load on connect", 10, 800, 10),
        intInput("messageLimit", "Split message scrollback limit (requires restart)", 100, 100000, 100),
        intInput("scrollbackUsercardLimit", "Usercard scrollback limit (requires restart)", 100, 100000, 100),
        choice(
            "showBlockedTermAutomodMessages",
            "Show blocked term automod messages",
            options([
                ["always", "Always"],
                ["never", "Never"],
            ]),
            {
                tooltip: "Show messages that are blocked by AutoMod for containing a public blocked term in the current channel.",
                unsupported: "AutoMod messages are only delivered over EventSub, which this app does not use.",
            },
        ),
        choice(
            "timeoutStackStyle",
            "Stack timeouts",
            options([
                ["stack", "Stack"],
                ["stackUntilTimeout", "Stack until timeout"],
                ["dontStack", "Don't stack"],
            ]),
            { tooltip: "Combine consecutive timeout messages into a single message." },
        ),
        check("stackBits", "Combine multiple bit tips into one", {
            tooltip: "Combine consecutive cheermotes (sent in a single message) into one cheermote.",
        }),
        check("highlightMentions", "Messages in /mentions highlights tab", {
            tooltip: "When disabled, the /mentions tab will not highlight in red when you are mentioned.",
        }),
        check("stripReplyMention", "Strip leading mention in replies", {
            tooltip:
                "When disabled, messages sent in reply threads will include the @mention for the related thread. If the reply context is hidden, these mentions will never be stripped.",
        }),
        choice(
            "chatSendProtocol",
            "Chat send protocol",
            options([
                ["default", "Default"],
                ["irc", "IRC"],
                ["helix", "Helix"],
            ]),
            { tooltip: "'Helix' will use Twitch's Helix API to send message. 'IRC' will use IRC to send messages." },
        ),
        check("showSendButton", "Show send message button", {
            tooltip: "Show a Send button next to each split input that can be clicked to send the message",
        }),
        check("enableExperimentalEventSub", "Enable experimental Twitch EventSub support (requires restart)", {
            unsupported: "this app does not connect to Twitch EventSub.",
        }),
        check("disableTabRenamingOnClick", "Disable renaming of tabs on double-click", {
            tooltip: "Prevents the rename dialog from opening when a tab is double-clicked",
        }),
    ];
}

export function generalItems(): GeneralItem[] {
    return [
        ...interfaceItems(),
        ...chatItems(),
        ...messageItems(),
        ...emoteItems(),
        ...streamerItems(),
        ...linkPreviewItems(),
        ...betaItems(),
        ...browserItems(),
        ...cacheItems(),
        ...soundItems(),
        ...advancedItems(),
    ];
}
