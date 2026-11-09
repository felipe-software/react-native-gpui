import { LocalStorage, NativeClipboard } from "react-native-gpui";
import type { Settings } from "../../data/api";
import { useApp } from "../state/AppContext";
import type { SettingsAccess } from "./generalTypes";
import { useSettingsActions } from "./useSettingsActions";
import { useSettingsUpdate } from "./useSettingsUpdate";

type ShareXConfig = { RequestURL?: string; FileFormName?: string; Headers?: Record<string, string> | string; URL?: string; DeletionURL?: string };

function headersText(headers: ShareXConfig["Headers"]): string {
    if (!headers) return "";
    if (typeof headers === "string") return headers;
    return Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join(";");
}

export function parseUploaderJson(text: string): Partial<Settings> | undefined {
    let parsed: ShareXConfig;
    try {
        parsed = JSON.parse(text) as ShareXConfig;
    } catch {
        return undefined;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.RequestURL) return undefined;
    return {
        imageUploaderUrl: parsed.RequestURL ?? "",
        imageUploaderFormField: parsed.FileFormName ?? "",
        imageUploaderHeaders: headersText(parsed.Headers),
        imageUploaderLink: parsed.URL ?? "",
        imageUploaderDeletionLink: parsed.DeletionURL ?? "",
    };
}

export function useSettingsAccess(): SettingsAccess {
    const { core, settings, prefs, openUrl } = useApp();
    const { update, updatePrefs } = useSettingsUpdate();
    const actions = useSettingsActions();
    return {
        settings,
        prefs,
        update,
        updatePrefs,
        openUrl,
        pickDirectory: actions.pickDirectory,
        confirm: actions.confirm,
        storagePath: LocalStorage.getPath(),
        canOpenCustomScheme: core.canOpenCustomScheme(),
        canSpawn: core.canSpawnProcesses(),
        copyText: (text) => {
            NativeClipboard.setString(text);
            actions.message("Settings Exported", "information", "Image uploader settings have been copied to clipboard as JSON.");
        },
        importUploader: () => {
            const reading = core.readClipboard();
            if (!reading) {
                actions.message("Import Failed", "warning", "Error validating image uploader import: the clipboard cannot be read in this runtime yet.");
                return;
            }
            reading.then(
                (text) => {
                    const patch = parseUploaderJson(text.trim());
                    if (!patch) {
                        actions.message("Import Failed", "warning", "No valid image uploader settings found in the JSON.");
                        return;
                    }
                    actions.confirm("Import Settings", "This will overwrite your current image uploader settings. Continue?", () => {
                        update(patch);
                        actions.message("Import Successful", "information", "Image uploader settings have been imported successfully!");
                    });
                },
                () => actions.message("Import Failed", "warning", "Error validating image uploader import: the clipboard could not be read."),
            );
        },
    };
}
