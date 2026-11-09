function exampleRoot(): string {
    const url = import.meta.url ?? "";
    const path = decodeURIComponent(url.replace(/^file:\/\//, ""));
    const sourceIndex = path.lastIndexOf("/src/");
    return sourceIndex === -1 ? "." : path.slice(0, sourceIndex);
}

const ROOT = exampleRoot();

export function assetPath(relative: string): string {
    return `${ROOT}/assets/${relative}`;
}

export const DEFAULT_PING_SOUND = assetPath("sounds/ping2.wav");
