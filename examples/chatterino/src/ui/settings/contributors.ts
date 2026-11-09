import { assetPath } from "../../data/assets";
import contributorsText from "../../../assets/contributors.txt";

export type ContributorSection = { title: string; people: Array<{ name: string; url: string; avatar: string }> };

export function parseContributors(text: string): ContributorSection[] {
    const sections: ContributorSection[] = [];
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        if (line.startsWith("@header")) {
            sections.push({ title: line.slice(8).trim(), people: [] });
            continue;
        }
        const parts = line.split("|");
        if (parts.length !== 3) continue;
        const [name, url, avatar] = parts.map((part) => part.trim());
        const avatarFile = avatar.startsWith(":/avatars/") ? avatar.slice(":/avatars/".length) : "anon.png";
        if (sections.length === 0) sections.push({ title: "", people: [] });
        sections[sections.length - 1].people.push({ name, url, avatar: assetPath(`avatars/${avatarFile}`) });
    }
    return sections;
}

export const CONTRIBUTORS = parseContributors(contributorsText);
