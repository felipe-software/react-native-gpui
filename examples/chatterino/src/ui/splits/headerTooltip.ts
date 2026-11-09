import type { LiveStatus } from "../../data/api";
import { formatUptime, localizeNumber, streamThumbnail } from "../format";
import type { TooltipBlock } from "../state/overlays";

export function headerTooltipBlocks(live: LiveStatus | undefined, login: string, thumbnailSize: number, now: number): TooltipBlock[] | undefined {
    if (!live) return undefined;
    if (!live.live) return [{ kind: "text", text: "Offline" }, { kind: "text", text: live.title ?? "" }];
    const blocks: TooltipBlock[] = [];
    if (live.title) blocks.push({ kind: "text", text: live.title }, { kind: "text", text: " " });
    const thumbnail = streamThumbnail(login, thumbnailSize, now);
    if (thumbnail) blocks.push({ kind: "image", url: thumbnail.url, width: thumbnail.width, height: thumbnail.height });
    if (live.game) blocks.push({ kind: "text", text: live.game });
    const viewers = localizeNumber(live.viewers ?? 0);
    blocks.push({ kind: "text", text: `Live for ${formatUptime(live.startedAt, now)} with ${viewers} viewers` });
    return blocks;
}
