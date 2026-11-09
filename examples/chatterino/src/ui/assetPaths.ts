function sourceRoot(url: string): string {
    const path = decodeURIComponent(url.replace(/^file:\/\//, ""));
    const index = path.lastIndexOf("/src/");
    if (index >= 0) return path.slice(0, index + "/src/".length);
    return path.replace(/[^/]*$/, "");
}

const ROOT = sourceRoot(import.meta.url);

export type AssetName =
    | "reply.svg"
    | "replyThread.svg"
    | "cancel.svg"
    | "cancelDark.svg"
    | "emote.svg"
    | "emoteDark.svg"
    | "moderationEnabled-darkMode.svg"
    | "moderationEnabled-lightMode.svg"
    | "moderationDisabled-darkMode.svg"
    | "moderationDisabled-lightMode.svg"
    | "ban.png"
    | "unban.png"
    | "trashCan.png"
    | "move.png"
    | "left.png"
    | "right.png"
    | "up.png"
    | "down.png"
    | "plus.svg"
    | "popup.svg"
    | "switch.svg";

export function assetPath(name: AssetName): string {
    return `${ROOT}ui/assets/${name}`;
}

export function themedAsset(isLight: boolean, dark: AssetName, light: AssetName): string {
    return assetPath(isLight ? light : dark);
}
