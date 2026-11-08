import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EMOJI_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource@15.1.2/emoji.json";
const TLDS_URL = "https://raw.githubusercontent.com/Chatterino/chatterino2/v2.5.5/resources/tlds.txt";
const TONE_NAMES = { "1F3FB": "tone1", "1F3FC": "tone2", "1F3FD": "tone3", "1F3FE": "tone4", "1F3FF": "tone5" };

const dataRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
}

function toneSuffix(key) {
    return key
        .split("-")
        .map((part) => TONE_NAMES[part])
        .join("-");
}

function emojiLine(unified, nonQualified, shortCode) {
    return [unified.toLowerCase(), (nonQualified ?? "").toLowerCase(), shortCode].join("|");
}

function buildEmojiLines(emojis) {
    const lines = [];
    const sorted = [...emojis].sort((a, b) => a.sort_order - b.sort_order);
    for (const emoji of sorted) {
        if (!emoji.has_img_twitter) continue;
        lines.push(emojiLine(emoji.unified, emoji.non_qualified, emoji.short_name));
        for (const [key, variation] of Object.entries(emoji.skin_variations ?? {})) {
            if (!variation.has_img_twitter) continue;
            const shortCode = `${emoji.short_name}_${toneSuffix(key)}`;
            lines.push(emojiLine(variation.unified, variation.non_qualified, shortCode));
        }
    }
    return lines;
}

const emojis = JSON.parse(await download(EMOJI_URL));
const emojiLines = buildEmojiLines(emojis);
writeFileSync(
    join(dataRoot, "emotes", "emoji-data.ts"),
    `export const EMOJI_SOURCE = "emoji-datasource@15.1.2";\n\nexport const EMOJI_DATA = \`${emojiLines.join("\n")}\`;\n`,
);

const tlds = (await download(TLDS_URL))
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
writeFileSync(join(dataRoot, "links", "tlds.ts"), `export const TLDS = "${tlds.join(" ")}";\n`);

console.log(`emoji: ${emojiLines.length} entries, tlds: ${tlds.length}`);
