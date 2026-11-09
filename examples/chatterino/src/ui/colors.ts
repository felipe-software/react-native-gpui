function channels(color: string): [number, number, number] | undefined {
    const hex = color.trim().replace(/^#/, "");
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function withAlpha(color: string, alpha: number): string {
    const rgb = channels(color);
    if (!rgb) return color;
    const clamped = Math.max(0, Math.min(1, alpha));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamped.toFixed(3)})`;
}

export function effectColor(isLight: boolean): string {
    return isLight ? "#000000" : "#ffffff";
}
