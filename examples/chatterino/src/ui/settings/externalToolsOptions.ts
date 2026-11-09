import { check, choice, description, intInput, lineEdit, options, title } from "./generalHelpers";
import type { GeneralItem, SettingsAccess } from "./generalTypes";

const NO_SPAWN = "this runtime cannot start other programs yet.";
const NO_UPLOAD = "the chat input cannot paste images, so there is nothing to upload.";
const NO_SPELLCHECK = "the chat input has no spell checker in this runtime.";
const STREAMLINK_LABEL_WIDTH = 176;
const UPLOADER_LABEL_WIDTH = 108;
const SPELLCHECK_DESCRIPTION =
    "Check the spelling of words in the input box of splits. Chatterino does not include dictionaries - they have to be downloaded or created manually. Chatterino expects Hunspell dictionaries in the Dictionaries folder of its app data directory. Dictionaries are pairs of .aff (affixes) and .dic (dictionary) files.";

function exportUploader(access: SettingsAccess): string {
    const settings = access.settings;
    return JSON.stringify(
        {
            RequestURL: settings.imageUploaderUrl,
            FileFormName: settings.imageUploaderFormField,
            Headers: settings.imageUploaderHeaders,
            URL: settings.imageUploaderLink,
            DeletionURL: settings.imageUploaderDeletionLink,
        },
        null,
        4,
    );
}

export function externalToolsItems(spawnAvailable: boolean): GeneralItem[] {
    const streamlinkNote = spawnAvailable ? undefined : NO_SPAWN;
    const customPath = (access: SettingsAccess) => access.settings.streamlinkUseCustomPath;
    return [
        title("Streamlink"),
        description(
            "streamlink",
            "Streamlink is a command-line utility that pipes video streams from various services into a video player, such as VLC. Make sure to edit the configuration file before you use it!",
        ),
        description("streamlink-links", "Website Download Documentation", [
            { label: "Website", url: "https://streamlink.github.io/" },
            { label: "Download", url: "https://github.com/streamlink/streamlink/releases/latest" },
            { label: "Documentation", url: "https://streamlink.github.io/cli.html#twitch" },
        ]),
        check("streamlinkUseCustomPath", "Use custom path (Enable if using non-standard streamlink installation path)", { unsupported: streamlinkNote }),
        description("streamlink-binary", 'Chatterino expects the executable to be called "streamlink".'),
        lineEdit("streamlinkPath", "Custom streamlink path", {
            placeholder: "Path to folder where Streamlink executable can be found",
            labelWidth: STREAMLINK_LABEL_WIDTH,
            enabled: customPath,
            unsupported: streamlinkNote,
        }),
        choice(
            "streamlinkQuality",
            "Preferred quality",
            options([
                ["choose", "Choose"],
                ["source", "Source"],
                ["high", "High"],
                ["medium", "Medium"],
                ["low", "Low"],
                ["audioOnly", "Audio only"],
            ]),
            { labelWidth: STREAMLINK_LABEL_WIDTH, unsupported: streamlinkNote },
        ),
        lineEdit("streamlinkOptions", "Additional options", { labelWidth: STREAMLINK_LABEL_WIDTH, unsupported: streamlinkNote }),
        title("Custom stream player"),
        description(
            "custom-player",
            'You can open Twitch streams directly in any video player that has built-in Twitch support and has own URI Scheme.\nE.g.: IINA for macOS and Potplayer (with extension) for Windows.\n\nWith this value set, you will get the option to "Open in custom player" when right-clicking a channel header.',
        ),
        lineEdit("customURIScheme", "Custom stream player URI Scheme", {
            placeholder: "custom-player-scheme://",
            unsupported: "the runtime only opens http, https and mailto links, so custom URI schemes cannot be launched.",
        }),
        title("Image Uploader"),
        description("uploader", "You can set custom host for uploading images, like imgur.com or s-ul.eu.\nCheck this guide for help.", [
            { label: "this guide", url: "https://chatterino.com/help/image-uploader" },
        ]),
        check("imageUploaderEnabled", "Enable image uploader", { unsupported: NO_UPLOAD }),
        check("askOnImageUpload", "Ask for confirmation when uploading an image", { unsupported: NO_UPLOAD }),
        lineEdit("imageUploaderUrl", "Request URL", { labelWidth: UPLOADER_LABEL_WIDTH }),
        lineEdit("imageUploaderFormField", "Form field", { labelWidth: UPLOADER_LABEL_WIDTH }),
        lineEdit("imageUploaderHeaders", "Extra Headers", { labelWidth: UPLOADER_LABEL_WIDTH }),
        lineEdit("imageUploaderLink", "Image link", { labelWidth: UPLOADER_LABEL_WIDTH }),
        lineEdit("imageUploaderDeletionLink", "Deletion link", { labelWidth: UPLOADER_LABEL_WIDTH }),
        description(
            "uploader-share",
            "Export your current image uploader settings as JSON to share with others, or import settings from clipboard (compatible with ShareX .sxcu format).",
        ),
        {
            kind: "buttons",
            id: "uploader-buttons",
            buttons: [
                { id: "uploader-import", label: "Import Settings from Clipboard", onPress: (access) => access.importUploader?.() },
                { id: "uploader-export", label: "Export Settings to Clipboard", onPress: (access) => access.copyText?.(exportUploader(access)) },
            ],
        },
        title("Spell checker (experimental)"),
        description("spellcheck", SPELLCHECK_DESCRIPTION),
        check("enableSpellChecking", "Check spelling by default", {
            tooltip: "Check the spelling of words in the input box of all splits by default.",
            unsupported: NO_SPELLCHECK,
        }),
        intInput("nSpellCheckingSuggestions", "Number of suggestions in context menu", -1, 2147483647, 1, {
            tooltip: "When right clicking any word, show this many suggestions. If this is 0, no suggestions will be shown and if it's -1, no limit is set.",
            unsupported: NO_SPELLCHECK,
        }),
    ];
}
