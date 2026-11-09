import { useEffect, useState } from "react";
import { Image, Platform, Renderer, ScrollView, Text, View } from "react-native-gpui";
import { assetPath } from "../../data/assets";
import chatterinoLicense from "../../../assets/CHATTERINO-LICENSE.txt";
import { useApp } from "../state/AppContext";
import { CONTRIBUTORS } from "./contributors";
import { GroupBox } from "./GroupBox";
import { RichText } from "./RichText";
import { useSettingsUi } from "./SettingsContext";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

const LOGO_WIDTH = 500;
const SHORT_REVISION = 9;
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 264) / 1261);

const LICENSES: Array<{ name: string; url: string; license?: string; licenseUrl?: string }> = [
    { name: "Chatterino 2", url: "https://github.com/Chatterino/chatterino2", license: chatterinoLicense },
    { name: "react-native-gpui", url: "https://github.com/natew/react-native-gpui", licenseUrl: "https://github.com/natew/react-native-gpui" },
    { name: "GPUI", url: "https://www.gpui.rs/", licenseUrl: "https://github.com/zed-industries/zed/blob/main/LICENSE-APACHE" },
    { name: "gpui-component", url: "https://github.com/longbridge/gpui-component", licenseUrl: "https://github.com/longbridge/gpui-component/blob/main/LICENSE-APACHE" },
    { name: "React", url: "https://react.dev/", licenseUrl: "https://github.com/facebook/react/blob/main/LICENSE" },
    { name: "JavaScriptCore", url: "https://webkit.org/", licenseUrl: "https://webkit.org/licensing-webkit/" },
    { name: "Fluent icons", url: "https://github.com/microsoft/fluentui-system-icons", licenseUrl: "https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE" },
    { name: "Unicode", url: "https://www.unicode.org/copyright.html", licenseUrl: "https://www.unicode.org/license.txt" },
];

const ATTRIBUTIONS: Array<{ text: string; links: Array<{ label: string; url: string }> }> = [
    { text: "Twemoji emojis provided by Twitter's Twemoji", links: [{ label: "Twitter's Twemoji", url: "https://github.com/twitter/twemoji" }] },
    { text: "Facebook emojis provided by Facebook", links: [{ label: "Facebook", url: "https://facebook.com" }] },
    { text: "Apple emojis provided by Apple", links: [{ label: "Apple", url: "https://apple.com" }] },
    { text: "Google emojis provided by Google", links: [{ label: "Google", url: "https://google.com" }] },
    {
        text: "Emoji datasource provided by Cal Henderson (show license)",
        links: [
            { label: "Cal Henderson", url: "https://www.iamcal.com/" },
            { label: "show license", url: "https://github.com/iamcal/emoji-data/blob/master/LICENSE" },
        ],
    },
    {
        text: "Settings icons, button images, sounds, avatars and the logo come from Chatterino 2.5.5 (MIT License)",
        links: [{ label: "Chatterino 2.5.5", url: "https://github.com/Chatterino/chatterino2/tree/v2.5.5" }],
    },
];

type Provenance = { build: string; running: string };

export function AboutPage() {
    const { fonts, openUrl } = useApp();
    const ui = useSettingsUi();
    const [provenance, setProvenance] = useState<Provenance>({
        build: "Chatterino 2.5.5 (example)",
        running: `Running on ${Platform.OS}`,
    });
    const text = { color: SETTINGS_STYLE.text, fontFamily: fonts.appFamily, fontSize: SETTINGS_FONT_SIZE };

    useEffect(() => {
        let cancelled = false;
        Renderer.getProvenance().then(
            (info) => {
                if (cancelled) return;
                const revision = info.gpuiRevision.slice(0, SHORT_REVISION);
                const engine = info.jsEngineVersion === "system" ? `system ${info.jsEngine}` : `${info.jsEngine} ${info.jsEngineVersion}`;
                setProvenance({
                    build: `Chatterino 2.5.5 (example) built with ${info.renderer} ${info.rendererVersion} (gpui ${revision})`,
                    running: `Running on ${Platform.OS}, ${engine}`,
                });
            },
            () => undefined,
        );
        return () => {
            cancelled = true;
        };
    }, []);

    const showLicense = (name: string, license: string) =>
        ui.openPopup({
            kind: "modal",
            title: `Chatterino - License for ${name}`,
            width: 560,
            height: 400,
            render: () => (
                <ScrollView style={{ flex: 1, margin: 8, backgroundColor: SETTINGS_STYLE.tableBackground }}>
                    <Text style={{ ...text, padding: 6 }}>{license}</Text>
                </ScrollView>
            ),
        });

    return (
        <ScrollView testID="settings-about" style={{ flex: 1, marginLeft: 10, marginTop: 10, marginRight: 9 }}>
            <View style={{ paddingRight: 12, paddingBottom: 20 }}>
                <Image source={{ uri: assetPath("settings/aboutlogo.png") }} style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }} />
                <GroupBox title="Version" testID="about-version">
                    <RichText text={`${provenance.build}\n${provenance.running}`} color={SETTINGS_STYLE.text} onOpen={openUrl} />
                </GroupBox>
                <GroupBox title="About Chatterino...">
                    <RichText text="Chatterino Wiki can be found here" links={[{ label: "here", url: "https://wiki.chatterino.com" }]} color={SETTINGS_STYLE.text} onOpen={openUrl} />
                    <RichText text="All about Chatterino's features" links={[{ label: "features", url: "https://chatterino.com/#features" }]} color={SETTINGS_STYLE.text} onOpen={openUrl} />
                    <RichText text="Join the official Chatterino Discord" links={[{ label: "Discord", url: "https://discord.gg/7Y5AYhAK4z" }]} color={SETTINGS_STYLE.text} onOpen={openUrl} />
                </GroupBox>
                <GroupBox title="Open source software used...">
                    {LICENSES.map((entry) => (
                        <View key={entry.name} style={{ flexDirection: "row", gap: 24 }}>
                            <View style={{ width: 160 }}>
                                <RichText text={entry.name} links={[{ label: entry.name, url: entry.url }]} onOpen={openUrl} />
                            </View>
                            <RichText
                                testID={`about-license-${entry.name}`}
                                text="show license"
                                links={[{ label: "show license", url: entry.licenseUrl ?? "license" }]}
                                onOpen={(url) => (entry.license ? showLicense(entry.name, entry.license) : openUrl(url))}
                            />
                        </View>
                    ))}
                </GroupBox>
                <GroupBox title="Attributions...">
                    {ATTRIBUTIONS.map((entry) => (
                        <RichText key={entry.text} text={entry.text} links={entry.links} color={SETTINGS_STYLE.text} onOpen={openUrl} />
                    ))}
                </GroupBox>
                <GroupBox title="People">
                    {CONTRIBUTORS.map((section) => (
                        <View key={section.title} style={{ gap: 8, marginBottom: 20, marginTop: 4 }}>
                            <Text style={{ ...text, fontSize: 28, fontWeight: "bold" }}>{section.title}</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                                {section.people.map((person) => (
                                    <View key={`${section.title}-${person.name}`} style={{ width: 120, alignItems: "center", gap: 4 }} onClick={() => openUrl(person.url)}>
                                        <Image source={{ uri: person.avatar }} style={{ width: 64, height: 64 }} />
                                        <RichText text={person.name} links={[{ label: person.name, url: person.url }]} onOpen={openUrl} />
                                    </View>
                                ))}
                            </View>
                        </View>
                    ))}
                </GroupBox>
            </View>
        </ScrollView>
    );
}
