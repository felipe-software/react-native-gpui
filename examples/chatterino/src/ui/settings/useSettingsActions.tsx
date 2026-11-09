import { FilePicker } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import { openColorPicker } from "./ColorButton";
import { MessageBoxContent } from "./MessageBoxContent";
import { recentColors } from "./recentColors";
import { useSettingsUi } from "./SettingsContext";

type MessageIcon = "information" | "warning" | "critical" | "question";

export function useSettingsActions() {
    const { settings } = useApp();
    const ui = useSettingsUi();

    const pickPath = (prompt: string, directories: boolean, apply: (path: string) => void) => {
        FilePicker.pickPaths({ files: !directories, directories, multiple: false, prompt })
            .then((paths) => {
                if (paths[0]) apply(paths[0]);
            })
            .catch((error: unknown) => console.warn("file picker failed", error));
    };

    const message = (title: string, icon: MessageIcon, text: string, informative?: string) =>
        ui.openPopup({
            kind: "modal",
            title,
            width: 460,
            height: informative && informative.length > 120 ? 260 : 170,
            render: (close) => <MessageBoxContent icon={icon} text={text} informative={informative} buttons={[{ label: "OK", primary: true, onPress: close }]} />,
        });

    const confirm = (title: string, text: string, onYes: () => void) =>
        ui.openPopup({
            kind: "modal",
            title,
            width: 460,
            height: 160,
            render: (close) => (
                <MessageBoxContent
                    icon="question"
                    text={text}
                    buttons={[
                        {
                            label: "Yes",
                            primary: true,
                            onPress: () => {
                                close();
                                onYes();
                            },
                        },
                        { label: "No", onPress: close },
                    ]}
                />
            ),
        });

    return {
        pickSound: (apply: (path: string) => void) => pickPath("Open Sound", false, apply),
        pickImage: (apply: (path: string) => void) => pickPath("Open Image", false, apply),
        pickDirectory: (apply: (path: string) => void) => pickPath("Select directory", true, apply),
        pickColor: (initial: string | undefined, apply: (color: string) => void) => openColorPicker(ui, initial, recentColors(settings), apply),
        message,
        confirm,
    };
}
