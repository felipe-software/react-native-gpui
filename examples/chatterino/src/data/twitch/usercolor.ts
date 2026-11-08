const TWITCH_USERNAME_COLORS = [
    "#ff0000",
    "#0000ff",
    "#00ff00",
    "#b22222",
    "#ff7f50",
    "#9acd32",
    "#ff4500",
    "#2e8b57",
    "#daa520",
    "#d2691e",
    "#5f9ea0",
    "#1e90ff",
    "#ff69b4",
    "#8a2be2",
    "#00ff7f",
];

export function randomUserColor(userId: string): string {
    let seed = Number.parseInt(userId, 10);
    const fitsInt32 = Number.isFinite(seed) && String(seed) === userId && seed <= 2147483647;
    if (!fitsInt32) {
        seed = 0;
        for (const char of userId) {
            const digit = Number.parseInt(char, 10);
            seed += Number.isNaN(digit) ? -1 : digit;
        }
    }
    const index = ((seed % TWITCH_USERNAME_COLORS.length) + TWITCH_USERNAME_COLORS.length) % TWITCH_USERNAME_COLORS.length;
    return TWITCH_USERNAME_COLORS[index];
}

export function normalizeHexColor(color: string | undefined): string | undefined {
    if (!color) return undefined;
    const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    return match ? `#${match[1].toLowerCase()}` : undefined;
}
