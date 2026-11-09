import { useRef, useState } from "react";
import { ScrollView, View, type ScrollViewHandle } from "react-native-gpui";
import { filterGeneral, groupItems } from "./generalFilter";
import { GeneralItemView } from "./GeneralItemView";
import { GeneralNavigation } from "./GeneralNavigation";
import type { GeneralItem, SettingsAccess } from "./generalTypes";
import { SETTINGS_STYLE } from "./settingsStyle";
import { TitleLabel } from "./TitleLabel";

type Props = { testID: string; items: GeneralItem[]; access: SettingsAccess; query: string; navigation: boolean };

type ScrollEvent = { nativeEvent?: { contentOffset?: { y?: number } } };

export function GeneralPageView({ testID, items, access, query, navigation }: Props) {
    const scroll = useRef<ScrollViewHandle>(null);
    const titleOffsets = useRef(new Map<string, number>());
    const [scrollY, setScrollY] = useState(0);
    const groups = groupItems(items);
    const result = filterGeneral(items, query.trim());
    const visibleGroups = groups.filter((group) => result.groups.has(group.title.id));
    const active = visibleGroups.find((group, index) => {
        const offset = titleOffsets.current.get(group.title.id) ?? 0;
        const isLast = index === visibleGroups.length - 1;
        return offset + 40 > scrollY || isLast;
    })?.title.id;

    const jump = (titleId: string) => {
        const offset = titleOffsets.current.get(titleId);
        if (offset !== undefined) scroll.current?.scrollTo({ y: offset, animated: false });
    };

    return (
        <View testID={testID} style={{ flex: 1, flexDirection: "row", padding: 18, paddingTop: 18 }}>
            <View style={{ flex: 1, backgroundColor: SETTINGS_STYLE.generalBackground }}>
                <ScrollView
                    ref={scroll}
                    testID={`${testID}-scroll`}
                    style={{ flex: 1 }}
                    onScroll={(event: unknown) => setScrollY((event as ScrollEvent).nativeEvent?.contentOffset?.y ?? 0)}
                >
                    <View style={{ paddingHorizontal: 9, paddingTop: 9, paddingBottom: 24 }}>
                        {visibleGroups.map((group, groupIndex) => (
                            <View
                                key={group.title.id}
                                onLayout={(event) => titleOffsets.current.set(group.title.id, event.nativeEvent.layout.y + (groupIndex > 0 ? 20 : 0))}
                            >
                                <TitleLabel testID={`settings-group-${group.title.text}`} text={group.title.text} spaced={groupIndex > 0} />
                                {group.items.map((item) =>
                                    item.kind === "title" || !result.visible.has(item.id) ? null : (
                                        <GeneralItemView key={item.id} item={item} access={access} />
                                    ),
                                )}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </View>
            {navigation ? (
                <View style={{ marginLeft: 16 }}>
                    <GeneralNavigation groups={groups} visible={result.groups} active={active} onSelect={jump} />
                </View>
            ) : null}
        </View>
    );
}
