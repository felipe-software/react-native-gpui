export type Rgba = { r: number; g: number; b: number; a: number };

type Hsl = { h: number; s: number; l: number };

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

const NAMED: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    gray: "#808080",
    grey: "#808080",
};

function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function expandShortHex(hex: string): string {
    return hex
        .split("")
        .map((digit) => digit + digit)
        .join("");
}

export function parseColor(input: string | undefined): Rgba | undefined {
    if (!input) return undefined;
    const trimmed = input.trim().toLowerCase();
    const named = NAMED[trimmed];
    if (named) return parseColor(named);
    const hexMatch = HEX_RE.exec(trimmed);
    if (hexMatch) {
        const raw = hexMatch[1];
        const isShort = raw.length <= 4;
        const full = isShort ? expandShortHex(raw) : raw;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) : 255;
        return { r, g, b, a };
    }
    const rgbMatch = RGB_RE.exec(trimmed);
    if (rgbMatch) {
        const alphaText = rgbMatch[4];
        const alpha = alphaText === undefined ? 255 : clampByte(parseFloat(alphaText) * 255);
        return {
            r: clampByte(parseFloat(rgbMatch[1])),
            g: clampByte(parseFloat(rgbMatch[2])),
            b: clampByte(parseFloat(rgbMatch[3])),
            a: alpha,
        };
    }
    return undefined;
}

function hexByte(value: number): string {
    return clampByte(value).toString(16).padStart(2, "0");
}

export function formatColor(color: Rgba): string {
    const rgb = `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;
    if (color.a >= 255) return rgb;
    return rgb + hexByte(color.a);
}

export function opaque(color: Rgba): Rgba {
    return { ...color, a: 255 };
}

function rgbToHsl(color: Rgba): Hsl {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const delta = max - min;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let h: number;
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    return { h: h / 6, s, l };
}

function hueToChannel(p: number, q: number, t: number): number {
    let hue = t;
    if (hue < 0) hue += 1;
    if (hue > 1) hue -= 1;
    if (hue < 1 / 6) return p + (q - p) * 6 * hue;
    if (hue < 1 / 2) return q;
    if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
    return p;
}

function hslToRgb(hsl: Hsl, alpha: number): Rgba {
    const lightness = Math.max(0, Math.min(1, hsl.l));
    if (hsl.s === 0) {
        const grey = lightness * 255;
        return { r: grey, g: grey, b: grey, a: alpha };
    }
    const q = lightness < 0.5 ? lightness * (1 + hsl.s) : lightness + hsl.s - lightness * hsl.s;
    const p = 2 * lightness - q;
    return {
        r: hueToChannel(p, q, hsl.h + 1 / 3) * 255,
        g: hueToChannel(p, q, hsl.h) * 255,
        b: hueToChannel(p, q, hsl.h - 1 / 3) * 255,
        a: alpha,
    };
}

function normalizeForLightTheme(hsl: Hsl): Hsl {
    let { h, s, l } = hsl;
    if (l > 0.5) l = 0.5;
    const isYellowGreen = h > 0.1 && h < 0.33333;
    if (l > 0.4 && isYellowGreen) {
        l = l - Math.sin(((h - 0.1) / (0.3333 - 0.1)) * Math.PI) * s * 0.4;
    }
    return { h, s, l };
}

function normalizeForDarkTheme(hsl: Hsl): Hsl {
    let { h, s, l } = hsl;
    if (l < 0.5) l = 0.5;
    const isBluePurple = h > 0.54444 && h < 0.83333;
    if (l < 0.6 && isBluePurple) {
        l = l + Math.sin(((h - 0.54444) / (0.8333 - 0.54444)) * Math.PI) * s * 0.4;
    }
    return { h, s, l };
}

export function normalizeColor(color: Rgba, isLightTheme: boolean): Rgba {
    const hsl = rgbToHsl(color);
    const adjusted = isLightTheme ? normalizeForLightTheme(hsl) : normalizeForDarkTheme(hsl);
    const result = hslToRgb(adjusted, color.a);
    return { r: clampByte(result.r), g: clampByte(result.g), b: clampByte(result.b), a: color.a };
}

export function blendColors(base: Rgba, apply: Rgba): Rgba {
    const alpha = apply.a / 255;
    return {
        r: clampByte(base.r * (1 - alpha) + apply.r * alpha),
        g: clampByte(base.g * (1 - alpha) + apply.g * alpha),
        b: clampByte(base.b * (1 - alpha) + apply.b * alpha),
        a: 255,
    };
}
