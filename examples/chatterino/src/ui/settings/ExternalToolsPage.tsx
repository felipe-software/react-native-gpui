import { externalToolsItems } from "./externalToolsOptions";
import { GeneralPageView } from "./GeneralPageView";
import { useSettingsUi } from "./SettingsContext";
import { useSettingsAccess } from "./useSettingsAccess";

export function ExternalToolsPage() {
    const access = useSettingsAccess();
    const { query } = useSettingsUi();
    return <GeneralPageView testID="settings-external" items={externalToolsItems(access.canSpawn)} access={access} query={query} navigation={false} />;
}
