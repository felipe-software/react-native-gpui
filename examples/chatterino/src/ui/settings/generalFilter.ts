import { itemKeywords, type GeneralItem } from "./generalTypes";

export type GeneralGroup = { title: Extract<GeneralItem, { kind: "title" }>; items: GeneralItem[] };

export type GeneralFilterResult = { visible: Set<string>; groups: Set<string>; any: boolean };

function contains(text: string, query: string): boolean {
    return text.toLowerCase().includes(query.toLowerCase());
}

export function groupItems(items: GeneralItem[]): GeneralGroup[] {
    const groups: GeneralGroup[] = [];
    for (const item of items) {
        if (item.kind === "title") {
            groups.push({ title: item, items: [] });
            continue;
        }
        groups[groups.length - 1]?.items.push(item);
    }
    return groups;
}

function showGroup(group: GeneralGroup, result: GeneralFilterResult): void {
    result.groups.add(group.title.id);
    for (const item of group.items) result.visible.add(item.id);
    result.any = true;
}

function filterGroup(group: GeneralGroup, query: string, result: GeneralFilterResult): void {
    let groupAny = false;
    let subtitleId: string | undefined;
    let subtitleSearched = false;
    let subtitleVisible = false;
    const closeSubtitle = () => {
        if (subtitleId && subtitleVisible) result.visible.add(subtitleId);
    };
    for (const item of group.items) {
        if (item.kind === "subtitle") {
            closeSubtitle();
            subtitleId = item.id;
            subtitleVisible = false;
            subtitleSearched = contains(item.text, query);
            continue;
        }
        if (item.kind === "separator") continue;
        const matched = subtitleSearched || itemKeywords(item).some((keyword) => contains(keyword, query));
        if (!matched) continue;
        result.visible.add(item.id);
        subtitleVisible = true;
        groupAny = true;
    }
    closeSubtitle();
    if (!groupAny) return;
    result.groups.add(group.title.id);
    result.any = true;
}

export function filterGeneral(items: GeneralItem[], query: string): GeneralFilterResult {
    const result: GeneralFilterResult = { visible: new Set(), groups: new Set(), any: false };
    for (const group of groupItems(items)) {
        const descriptionMatches = group.items.some((item) => item.kind === "description" && contains(item.text, query));
        if (contains(group.title.text, query) || descriptionMatches) {
            showGroup(group, result);
            continue;
        }
        filterGroup(group, query, result);
    }
    return result;
}
