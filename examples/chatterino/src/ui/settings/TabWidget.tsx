import type { ReactNode } from "react";
import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = {
    testID: string;
    tabs: string[];
    selected: string;
    onSelect: (tab: string) => void;
    children: ReactNode;
};

const SELECTED_TAB = "#5a5a5a";
const TAB = "#484848";
const TAB_BORDER = "#2e2e2e";

export function TabWidget({ testID, tabs, selected, onSelect, children }: Props) {
    const { fonts } = useApp();
    return (
        <View testID={testID} style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", paddingLeft: 1, height: 27 }}>
                {tabs.map((tab) => {
                    const isSelected = tab === selected;
                    return (
                        <View
                            key={tab}
                            testID={`${testID}-tab-${tab}`}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isSelected }}
                            style={{
                                height: isSelected ? 27 : 24,
                                paddingHorizontal: 10,
                                marginRight: 1,
                                justifyContent: "center",
                                backgroundColor: isSelected ? SELECTED_TAB : TAB,
                                borderWidth: 1,
                                borderBottomWidth: 0,
                                borderColor: TAB_BORDER,
                                borderTopLeftRadius: 2,
                                borderTopRightRadius: 2,
                            }}
                            onClick={() => onSelect(tab)}
                        >
                            <Text style={{ color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE }}>{tab}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={{ flex: 1, backgroundColor: SETTINGS_STYLE.tablePane, borderWidth: 1, borderColor: TAB_BORDER, padding: 9 }}>{children}</View>
        </View>
    );
}
