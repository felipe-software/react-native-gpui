import { Text, View } from "react-native-gpui";
import { useApp } from "../state/AppContext";
import type { DescriptionLink } from "./generalTypes";
import { SETTINGS_FONT_SIZE, SETTINGS_STYLE } from "./settingsStyle";

type Props = {
    text: string;
    links?: DescriptionLink[];
    color?: string;
    linkColor?: string;
    fontSize?: number;
    testID?: string;
    onOpen: (url: string) => void;
};

type Token = { text: string; url?: string };

const QT_LINE_SPACING = 1.2;
const PARAGRAPH_PAD = 3;

function tokenizeLine(line: string, links: DescriptionLink[]): Token[] {
    const tokens: Token[] = [];
    let rest = line;
    while (rest.length > 0) {
        let next: { index: number; link: DescriptionLink } | undefined;
        for (const link of links) {
            const index = rest.indexOf(link.label);
            if (index !== -1 && (!next || index < next.index)) next = { index, link };
        }
        if (!next) {
            tokens.push({ text: rest });
            break;
        }
        if (next.index > 0) tokens.push({ text: rest.slice(0, next.index) });
        tokens.push({ text: next.link.label, url: next.link.url });
        rest = rest.slice(next.index + next.link.label.length);
    }
    return tokens;
}

function words(token: Token): Token[] {
    const pattern = token.url ? /\S+\s*(?=\S)|\S+|\s+/g : /\S+|\s+/g;
    const parts = token.text.match(pattern) ?? [];
    return parts.map((part) => ({ text: part, url: token.url }));
}

export function RichText({ text, links = [], color = SETTINGS_STYLE.description, linkColor = SETTINGS_STYLE.externalLink, fontSize = SETTINGS_FONT_SIZE, testID, onOpen }: Props) {
    const { fonts } = useApp();
    const lineHeight = Math.round(fontSize * QT_LINE_SPACING);
    const base = { fontFamily: fonts.appFamily, fontSize, color, lineHeight };
    if (links.length === 0) {
        return (
            <Text testID={testID} style={{ ...base, paddingVertical: PARAGRAPH_PAD }}>
                {text}
            </Text>
        );
    }
    return (
        <View testID={testID} style={{ paddingVertical: PARAGRAPH_PAD }}>
            {text.split("\n").map((line, lineIndex) => (
                <View key={lineIndex} style={{ flexDirection: "row", flexWrap: "wrap", minHeight: lineHeight }}>
                    {tokenizeLine(line, links)
                        .flatMap(words)
                        .map((token, index) => {
                            const url = token.url;
                            const isSpace = token.text.trim().length === 0;
                            if (!url || isSpace) {
                                return (
                                    <Text key={index} style={{ ...base, color: url ? linkColor : color }}>
                                        {token.text}
                                    </Text>
                                );
                            }
                            return (
                                <View
                                    key={index}
                                    accessibilityRole="link"
                                    accessibilityLabel={token.text}
                                    style={{ borderBottomWidth: 1, marginBottom: -1, borderColor: linkColor, cursor: "pointer" }}
                                    onClick={() => onOpen(url)}
                                >
                                    <Text style={{ ...base, color: linkColor }}>{token.text}</Text>
                                </View>
                            );
                        })}
                </View>
            ))}
        </View>
    );
}
