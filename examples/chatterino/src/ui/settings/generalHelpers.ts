import type { Settings } from "../../data/api";
import type { UiPrefs } from "../state/prefs";
import type { GeneralItem, SettingsAccess } from "./generalTypes";
import type { ListOption } from "./SettingsContext";

type BoolKey = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
type NumberKey = { [K in keyof Settings]-?: Settings[K] extends number ? K : never }[keyof Settings];
type StringKey = { [K in keyof Settings]-?: Settings[K] extends string ? K : never }[keyof Settings];
type PrefBoolKey = { [K in keyof UiPrefs]-?: UiPrefs[K] extends boolean ? K : never }[keyof UiPrefs];

type Extra = { tooltip?: string; keywords?: string[]; unsupported?: string; enabled?: (access: SettingsAccess) => boolean; description?: string };

export function title(text: string, spacingBefore = false): GeneralItem {
    return { kind: "title", id: `title-${text}`, text, spacingBefore };
}

export function subtitle(text: string): GeneralItem {
    return { kind: "subtitle", id: `subtitle-${text}`, text };
}

export function description(id: string, text: string, links?: Array<{ label: string; url: string }>, color?: string): GeneralItem {
    return { kind: "description", id: `description-${id}`, text, links, color };
}

export function separator(id: string): GeneralItem {
    return { kind: "separator", id: `separator-${id}` };
}

export function check(key: BoolKey, label: string, extra: Extra = {}): GeneralItem {
    return {
        kind: "checkbox",
        id: key,
        label,
        get: (access) => access.settings[key] as boolean,
        set: (access, value) => access.update({ [key]: value } as Partial<Settings>),
        ...extra,
    };
}

export function inverse(key: BoolKey, label: string, extra: Extra = {}): GeneralItem {
    return {
        kind: "checkbox",
        id: key,
        label,
        get: (access) => !(access.settings[key] as boolean),
        set: (access, value) => access.update({ [key]: !value } as Partial<Settings>),
        ...extra,
    };
}

export function prefCheck(key: PrefBoolKey, label: string, extra: Extra = {}): GeneralItem {
    return {
        kind: "checkbox",
        id: key,
        label,
        get: (access) => access.prefs[key] as boolean,
        set: (access, value) => access.updatePrefs({ [key]: value } as Partial<UiPrefs>),
        ...extra,
    };
}

export function options(values: Array<[string, string]>): ListOption[] {
    return values.map(([value, label]) => ({ value, label }));
}

export function choice(key: StringKey, label: string, values: ListOption[], extra: Extra & { width?: number; labelWidth?: number } = {}): GeneralItem {
    return {
        kind: "dropdown",
        id: key,
        label,
        options: values,
        get: (access) => access.settings[key] as string,
        set: (access, value) => access.update({ [key]: value } as Partial<Settings>),
        ...extra,
    };
}

export function numberChoice(
    key: NumberKey,
    label: string,
    values: Array<[number, string]>,
    extra: Extra & { width?: number } = {},
): GeneralItem {
    return {
        kind: "dropdown",
        id: key,
        label,
        options: values.map(([value, text]) => ({ value: String(value), label: text })),
        get: (access) => String(access.settings[key]),
        set: (access, value) => access.update({ [key]: Number(value) } as Partial<Settings>),
        ...extra,
    };
}

export function intInput(key: NumberKey, label: string, min: number, max: number, step: number, extra: Extra & { suffix?: string } = {}): GeneralItem {
    return {
        kind: "intInput",
        id: key,
        label,
        min,
        max,
        step,
        get: (access) => access.settings[key] as number,
        set: (access, value) => access.update({ [key]: value } as Partial<Settings>),
        ...extra,
    };
}

export function lineEdit(key: StringKey, label: string, extra: Extra & { placeholder?: string; labelWidth?: number } = {}): GeneralItem {
    return {
        kind: "lineEdit",
        id: key,
        label,
        get: (access) => access.settings[key] as string,
        set: (access, value) => access.update({ [key]: value } as Partial<Settings>),
        ...extra,
    };
}

export function colorButton(key: StringKey, label: string, extra: Extra = {}): GeneralItem {
    return {
        kind: "color",
        id: key,
        label,
        get: (access) => access.settings[key] as string,
        set: (access, value) => access.update({ [key]: value } as Partial<Settings>),
        ...extra,
    };
}

export function scaleLabel(value: number): string {
    return value === 1 ? "Default" : `${value}x`;
}

export const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.33, 2.66, 3, 3.5, 4];

export const TIMESTAMP_FORMATS = [
    "h:mm",
    "hh:mm",
    "h:mm a",
    "hh:mm a",
    "h:mm:ss",
    "hh:mm:ss",
    "h:mm:ss a",
    "hh:mm:ss a",
    "h:mm:ss.zzz",
    "h:mm:ss.zzz a",
    "hh:mm:ss.zzz",
    "hh:mm:ss.zzz a",
];

export function unsupportedTooltip(tooltip: string | undefined, reason: string | undefined): string | undefined {
    if (!reason) return tooltip;
    const note = `Not available in this app: ${reason}`;
    return tooltip ? `${tooltip}\n\n${note}` : note;
}
