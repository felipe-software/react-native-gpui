import { Text, View } from "../../src/index";
import { COLORS, log } from "./shared";

export function PressDragRow({ testID, optOut }: { testID: string; optOut: boolean }) {
    return (
        <View
            testID={testID}
            nativePressDrag={optOut ? false : undefined}
            onMouseUp={() => log("headerUp", { testID })}
            style={{ flexDirection: "row", height: 26, width: 220, backgroundColor: "#262a33", alignItems: "center", marginBottom: 6 }}
        >
            <Text style={{ color: COLORS.text, fontSize: 12, width: 160, paddingLeft: 6 }}>{testID}</Text>
            <View testID={`${testID}-plus`} onClick={() => log("plusClick", { testID })} style={{ width: 40, height: 22, backgroundColor: "#3d4452" }}>
                <Text style={{ color: COLORS.text, fontSize: 12, textAlign: "center" }}>+</Text>
            </View>
        </View>
    );
}
