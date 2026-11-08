import { createChatCore } from "../src/data/index.ts";

const CHANNELS = (process.env.SMOKE_CHANNELS ?? "xqc,forsen").split(",");
const WAIT_MS = Number(process.env.SMOKE_SECONDS ?? 45) * 1000;
const MIN_LIVE = Number(process.env.SMOKE_MIN_LIVE ?? 30);

const core = createChatCore({ platform: {} });
const stats = new Map();
const started = Date.now();

function statFor(name) {
    if (!stats.has(name)) stats.set(name, { prepend: 0, append: 0, updates: 0, batches: 0, infos: 0, firstHistoryMs: undefined });
    return stats.get(name);
}

const channels = CHANNELS.map((name) => {
    const channel = core.join(name);
    const stat = statFor(name);
    channel.subscribe((event) => {
        stat.batches += 1;
        if (event.type === "prepend") {
            stat.prepend += event.messages.length;
            stat.firstHistoryMs ??= Date.now() - started;
        }
        if (event.type === "append") stat.append += event.messages.length;
        if (event.type === "update") stat.updates += event.patches.length;
        if (event.type === "info") stat.infos += 1;
    });
    return channel;
});

function liveCount(channel) {
    return channel.buffer.messages().filter((message) => !message.flags.historical && !message.flags.system).length;
}

await new Promise((resolve) => {
    const deadline = setTimeout(resolve, WAIT_MS);
    const poll = setInterval(() => {
        const historyDone = channels.every((channel) => statFor(channel.name).prepend > 0);
        const liveDone = channels.every((channel) => liveCount(channel) >= MIN_LIVE);
        if (historyDone && liveDone) {
            clearTimeout(deadline);
            clearInterval(poll);
            resolve();
        }
    }, 500);
});

function classify(message) {
    const kinds = [];
    const { flags } = message;
    if (flags.system) kinds.push("system");
    else kinds.push(flags.action ? "action" : "privmsg");
    if (flags.reply) kinds.push("reply");
    if (flags.subscription) kinds.push("subscription");
    if (flags.watchStreak) kinds.push("watch-streak");
    if (flags.announcement) kinds.push("announcement");
    if (flags.firstMessage) kinds.push("first-message");
    if (flags.redeemed) kinds.push("redeemed");
    if (flags.elevated) kinds.push("elevated");
    if (flags.cheer) kinds.push("cheer");
    if (flags.highlighted) kinds.push("highlighted");
    if (flags.timeout) kinds.push("timeout/ban");
    if (flags.clearChat) kinds.push("clearchat");
    if (message.timeoutUser?.startsWith("msg:")) kinds.push("deletion");
    if (flags.disabled) kinds.push("disabled");
    if (flags.historical) kinds.push("historical");
    else kinds.push("live");
    return kinds;
}

const report = {};
for (const channel of channels) {
    const kinds = {};
    const emotes = {};
    const zeroWidth = { layered: 0 };
    const badges = {};
    let links = 0;
    let mentions = 0;
    for (const message of channel.buffer.messages()) {
        for (const kind of classify(message)) kinds[kind] = (kinds[kind] ?? 0) + 1;
        for (const piece of message.pieces) {
            if (piece.kind === "emote") {
                emotes[piece.emote.provider] = (emotes[piece.emote.provider] ?? 0) + 1;
                if (piece.layers) zeroWidth.layered += piece.layers.length;
            }
            if (piece.kind === "badge") badges[piece.badge.name] = (badges[piece.badge.name] ?? 0) + 1;
            if (piece.kind === "text" && piece.link?.startsWith("http")) links += 1;
            if (piece.kind === "user" && piece.text.startsWith("@")) mentions += 1;
        }
    }
    const topBadges = Object.entries(badges)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    const sets = channel.emoteSets;
    report[channel.name] = {
        info: channel.info(),
        events: statFor(channel.name),
        messages: channel.buffer.size(),
        kinds,
        emoteElements: emotes,
        zeroWidth,
        badgeElements: Object.values(badges).reduce((sum, count) => sum + count, 0),
        topBadges: Object.fromEntries(topBadges),
        links,
        mentions,
        channelEmotes: { bttv: sets.bttv.size, ffz: sets.ffz.size, seventv: sets.seventv.size, badges: sets.badges.size },
        sample: channel
            .snapshot()
            .slice(-3)
            .map((message) => ({
                timestamp: message.timestamp,
                text: message.elements
                    .map((element) => element.text ?? `[${element.kind}:${element.name}]`)
                    .join(" ")
                    .slice(0, 160),
            })),
    };
}

const globals = core.globalEmotes();
const byProvider = {};
for (const emote of globals) byProvider[emote.provider] = (byProvider[emote.provider] ?? 0) + 1;
console.log(JSON.stringify({ elapsedMs: Date.now() - started, status: core.status.get(), globalEmotes: byProvider, report }, null, 2));
const xqc = await core.userInfo("xqc", "forsen").catch((error) => ({ error: String(error) }));
console.log("userInfo(xqc):", JSON.stringify({ ...xqc, bio: xqc.bio?.slice(0, 40) }));
console.log("complete('LU'):", core.join("forsen").complete("LU", false).slice(0, 5).map((c) => c.display));
console.log("send anonymous:", JSON.stringify(await core.join("forsen").send("hello")));
core.dispose();
process.exit(0);
