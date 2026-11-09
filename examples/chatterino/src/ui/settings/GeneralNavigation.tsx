import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import type { GeneralGroup } from "./generalFilter";
import { SETTINGS_NAV_SIZE, SETTINGS_STYLE } from "./settingsStyle";

const GROUP_SPACING = 24;

type Props = { groups: GeneralGroup[]; visible: Set<string>; active: string | undefined; onSelect: (titleId: string) => void };

export function GeneralNavigation({ groups, visible, active, onSelect }: Props) {
    const { fonts } = useApp();
    let spacerPending = false;
    let renderedAny = false;
    return (
        <View style={{ width: 150, paddingTop: 6 }}>
            {groups.map((group) => {
                if (group.title.spacingBefore) spacerPending = true;
                if (!visible.has(group.title.id)) return null;
                const spaced = spacerPending && renderedAny;
                spacerPending = false;
                renderedAny = true;
                const isActive = group.title.id === active;
                return (
                    <View
                        key={group.title.id}
                        testID={`settings-nav-${group.title.text}`}
                        accessibilityRole="link"
                        style={{ height: 24, justifyContent: "center", marginTop: spaced ? GROUP_SPACING : 0, cursor: "pointer" }}
                        onClick={() => onSelect(group.title.id)}
                    >
                        <Text
                            style={{
                                color: isActive ? SETTINGS_STYLE.navigationActive : SETTINGS_STYLE.navigation,
                                fontFamily: fonts.appFamily,
                                fontSize: SETTINGS_NAV_SIZE,
                                fontWeight: "300",
                            }}
                        >
                            {group.title.text}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}
