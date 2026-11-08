function svg(viewBox: string, body: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}

function gearTeeth(count: number, inner: number, outer: number, center: number): string {
    const points: string[] = [];
    const step = (Math.PI * 2) / count;
    for (let index = 0; index < count; index++) {
        const angle = index * step;
        const corners = [
            [angle - step * 0.22, outer],
            [angle + step * 0.22, outer],
            [angle + step * 0.34, inner],
            [angle + step * 0.66, inner],
        ];
        for (const [cornerAngle, radius] of corners) {
            const x = center + Math.cos(cornerAngle) * radius;
            const y = center + Math.sin(cornerAngle) * radius;
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
    }
    return `M${points.join(" L")} Z`;
}

const GEAR_PATH = `${gearTeeth(8, 14.5, 18.75, 25)} M25,18.4 A6.6,6.6 0 1 0 25,31.6 A6.6,6.6 0 1 0 25,18.4 Z`;

export const ICONS = {
    gear: svg("0 0 50 50", `<path fill-rule="evenodd" d="${GEAR_PATH}"/>`),
    account: svg(
        "0 0 50 50",
        '<circle cx="25" cy="18.75" r="9.4"/><path d="M6.25 43.75C6.25 34 13 27.6 16 27.3A12.6 12.6 0 0 0 34 27.3C37 27.6 43.75 34 43.75 43.75Z"/>',
    ),
    emote: svg(
        "0 0 100 100",
        '<path fill-rule="evenodd" d="M50 2a48 48 0 1 0 0.01 0ZM50 10a40 40 0 1 1-0.01 0Z"/><circle cx="34" cy="39" r="7.5"/><circle cx="66" cy="39" r="7.5"/><path d="M25 59c14 11 36 11 50 0l-4.5-6.4c-11 8.4-30 8.4-41 0Z"/>',
    ),
    close: svg("0 0 16 16", '<path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" fill="none" stroke="black" stroke-width="1"/>'),
    check: svg("0 0 16 16", '<path d="M3.5 8.5L6.5 11.5L12.5 4.5" fill="none" stroke="black" stroke-width="1.8"/>'),
    chevronDown: svg("0 0 16 16", '<path d="M4 6L8 10L12 6" fill="none" stroke="black" stroke-width="1.5"/>'),
    chevronRight: svg("0 0 16 16", '<path d="M6 4L10 8L6 12" fill="none" stroke="black" stroke-width="1.5"/>'),
    copy: svg(
        "0 0 16 16",
        '<path d="M5.5 5.5h7v8h-7z M3.5 10.5v-8h7" fill="none" stroke="black" stroke-width="1.2"/>',
    ),
    pin: svg("0 0 16 16", '<path d="M10 2l4 4-2 1-2 3 1 2-1 1-3-3-4 4-1 0 0-1 4-4-3-3 1-1 2 1 3-2z"/>'),
};
