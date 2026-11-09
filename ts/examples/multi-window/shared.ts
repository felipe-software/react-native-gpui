export const COLORS = {
    page: "#14161a",
    button: "#2d3340",
    text: "#e8e8e8",
    dialog: "#2a8cff",
    list: "#1c1c1c",
    row: "#ff7f50",
    popup: "#e0a030",
};

export function log(kind: string, payload: Record<string, unknown> = {}) {
    console.log(`MW_EVENT ${JSON.stringify({ kind, ...payload })}`);
}
