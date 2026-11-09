import type { Settings } from "../../data/api";
import type { UiPrefs } from "../state/prefs";
import type { ListOption } from "./SettingsContext";

export type SettingsAccess = {
    settings: Settings;
    prefs: UiPrefs;
    update: (patch: Partial<Settings>) => void;
    updatePrefs: (patch: Partial<UiPrefs>) => void;
    openUrl: (url: string) => void;
    pickDirectory: (apply: (path: string) => void) => void;
    confirm: (title: string, message: string, onYes: () => void) => void;
    storagePath: string | null;
    canOpenCustomScheme: boolean;
    canSpawn: boolean;
    importUploader?: () => void;
    copyText?: (text: string) => void;
};

type Common = { id: string; tooltip?: string; keywords?: string[]; unsupported?: string };

export type DescriptionLink = { label: string; url: string };

export type GeneralItem =
    | { kind: "title"; id: string; text: string; spacingBefore?: boolean }
    | { kind: "subtitle"; id: string; text: string }
    | { kind: "description"; id: string; text: string; links?: DescriptionLink[]; color?: string }
    | { kind: "separator"; id: string }
    | (Common & {
          kind: "checkbox";
          label: string;
          get: (access: SettingsAccess) => boolean;
          set: (access: SettingsAccess, value: boolean) => void;
          enabled?: (access: SettingsAccess) => boolean;
          description?: string;
      })
    | (Common & {
          kind: "dropdown";
          label: string;
          options: ListOption[];
          get: (access: SettingsAccess) => string;
          set: (access: SettingsAccess, value: string) => void;
          enabled?: (access: SettingsAccess) => boolean;
          placeholder?: string;
          width?: number;
          labelWidth?: number;
          itemKeywords?: boolean;
      })
    | (Common & {
          kind: "intInput";
          label: string;
          min: number;
          max: number;
          step: number;
          suffix?: string;
          get: (access: SettingsAccess) => number;
          set: (access: SettingsAccess, value: number) => void;
      })
    | (Common & {
          kind: "lineEdit";
          label: string;
          placeholder?: string;
          labelWidth?: number;
          get: (access: SettingsAccess) => string;
          set: (access: SettingsAccess, value: string) => void;
          enabled?: (access: SettingsAccess) => boolean;
      })
    | (Common & {
          kind: "color";
          label: string;
          get: (access: SettingsAccess) => string;
          set: (access: SettingsAccess, value: string) => void;
      })
    | (Common & { kind: "font"; label: string })
    | (Common & { kind: "buttons"; buttons: Array<{ id: string; label: string; onPress: (access: SettingsAccess) => void }> });

export function itemKeywords(item: GeneralItem): string[] {
    switch (item.kind) {
        case "title":
            return [];
        case "subtitle":
        case "description":
            return [item.text];
        case "separator":
            return [];
        case "buttons":
            return [...item.buttons.map((button) => button.label), ...(item.keywords ?? [])];
        case "font":
            return ["font", "weight", "size"];
        default: {
            const base = [item.label, ...(item.keywords ?? [])];
            if (item.tooltip) base.push(item.tooltip);
            if (item.kind === "checkbox" && item.description) base.push(item.description);
            if (item.kind === "dropdown" && item.itemKeywords) base.push(...item.options.map((option) => option.label));
            return base;
        }
    }
}
