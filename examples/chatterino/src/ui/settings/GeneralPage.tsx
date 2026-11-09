import { useMemo } from "react";
import { generalItems } from "./generalOptions";
import { GeneralPageView } from "./GeneralPageView";
import { useSettingsUi } from "./SettingsContext";
import { useSettingsAccess } from "./useSettingsAccess";

export function GeneralPage() {
    const access = useSettingsAccess();
    const { query } = useSettingsUi();
    const items = useMemo(() => generalItems(), []);
    return <GeneralPageView testID="settings-general" items={items} access={access} query={query} navigation />;
}
