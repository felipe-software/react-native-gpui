import { useCallback } from "react";
import type { Settings } from "../../data/api";
import { useApp } from "../state/AppContext";
import type { UiPrefs } from "../state/prefs";

export function useSettingsUpdate() {
    const { core, prefsStore } = useApp();
    const update = useCallback((patch: Partial<Settings>) => core.settings.set((current) => ({ ...current, ...patch })), [core]);
    const updatePrefs = useCallback((patch: Partial<UiPrefs>) => prefsStore.set((current) => ({ ...current, ...patch })), [prefsStore]);
    return { update, updatePrefs };
}
