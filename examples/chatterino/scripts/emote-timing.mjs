#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettings } from "../src/data/defaults.ts";
import { STORAGE_KEYS } from "../src/data/persistence.ts";
import { startQuietIrcProxy } from "./irc-quiet-proxy.mjs";

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(exampleRoot, "..", "..");
const toolchainBin = join(process.env.HOME ?? "", ".local/share/rngpui-linux-toolchain/root/usr/bin");

const USAGE = `usage: bun scripts/emote-timing.mjs [options]

Times how long emotes take to appear after launch, cold (empty caches) and warm
(second launch), for this app and for the Flatpak Chatterino, one channel per run.

  --apps ours,chatterino     which apps to time (default both); "baseline" runs --baseline-service
                             with --baseline-bundle, for before/after comparisons
  --baseline-service <path>  rngpui-service for the "baseline" app
  --baseline-bundle <file>   bundle for the "baseline" app
  --channels xqc,forsen      channels, one single-split run each (default xqc,forsen,sodapoppin)
  --states cold,warm         cache states, in order (default cold,warm)
  --mode quiet|live          quiet drops live PRIVMSG/USERNOTICE through a local IRC proxy, so the
                             first screen is exactly the history tail (default quiet)
  --layout single|main       single: one run per channel; main: one run with every channel in
                             Chatterino's Main-tab arrangement (first left, the rest stacked right)
  --history replay|live      replay records each channel's recent messages once into
                             <work>/history and serves that copy to both apps, so every run shows the
                             same first screen; live asks recent-messages.robotty.de (default replay)
  --history-delay-ms 0       replayed history answers after this delay
  --record                   record the replayed history again
  --raw                      keep our app's per-image timings and final visible images in --json
  --seconds 20               how long each run lasts
  --repeat 1                 runs per (app, channel, state); the app order flips every round
  --work <dir>               profiles and captures (default $TMPDIR/chatterino-emote-timing)
  --service <path>           rngpui-service (default rust/target/release/rngpui-service)
  --no-bundle                reuse .build/chatterino.js instead of bundling first
  --bundle <file>            run this bundle (implies --no-bundle)
  --display :98              private X display for Chatterino (started if missing)
  --json <file>              also write every run's raw result
`;

function parseArgs(argv) {
    const options = {
        apps: ["ours", "chatterino"],
        channels: ["xqc", "forsen", "sodapoppin"],
        states: ["cold", "warm"],
        mode: "quiet",
        layout: "single",
        history: "replay",
        historyDelayMs: 0,
        record: false,
        raw: false,
        bundlePath: join(exampleRoot, ".build/chatterino.js"),
        baselineService: undefined,
        baselineBundle: undefined,
        seconds: 20,
        repeat: 1,
        work: join(process.env.TMPDIR || tmpdir(), "chatterino-emote-timing"),
        service: process.env.RNGPUI_SERVICE || join(repoRoot, "rust/target/release/rngpui-service"),
        bundle: true,
        display: ":98",
        json: undefined,
    };
    const list = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => argv[++index] ?? "";
        if (arg === "--apps") options.apps = list(next());
        else if (arg === "--channels") options.channels = list(next());
        else if (arg === "--states") options.states = list(next());
        else if (arg === "--mode") options.mode = next();
        else if (arg === "--layout") options.layout = next();
        else if (arg === "--history") options.history = next();
        else if (arg === "--history-delay-ms") options.historyDelayMs = Number(next());
        else if (arg === "--record") options.record = true;
        else if (arg === "--raw") options.raw = true;
        else if (arg === "--baseline-service") options.baselineService = resolve(next());
        else if (arg === "--baseline-bundle") options.baselineBundle = resolve(next());
        else if (arg === "--bundle") {
            options.bundlePath = resolve(next());
            options.bundle = false;
        }
        else if (arg === "--seconds") options.seconds = Number(next());
        else if (arg === "--repeat") options.repeat = Number(next());
        else if (arg === "--work") options.work = resolve(next());
        else if (arg === "--service") options.service = resolve(next());
        else if (arg === "--no-bundle") options.bundle = false;
        else if (arg === "--display") options.display = next();
        else if (arg === "--json") options.json = resolve(next());
        else if (arg === "--help" || arg === "-h") {
            console.log(USAGE);
            process.exit(0);
        } else {
            console.error(`unknown option ${arg}\n\n${USAGE}`);
            process.exit(2);
        }
    }
    return options;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function request(socketPath, payload, timeoutMs = 4000) {
    return new Promise((resolveRequest, rejectRequest) => {
        const socket = net.connect(socketPath);
        let buffer = "";
        const timer = setTimeout(() => {
            socket.destroy();
            rejectRequest(new Error(`control request ${payload.$cmd} timed out`));
        }, timeoutMs);
        socket.on("connect", () => socket.write(`${JSON.stringify({ reqId: 1, ...payload })}\n`));
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            clearTimeout(timer);
            socket.destroy();
            resolveRequest(JSON.parse(buffer.slice(0, newline)));
        });
        socket.on("error", (error) => {
            clearTimeout(timer);
            rejectRequest(error);
        });
    });
}

function waitForExit(child, timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((done) => {
        const timer = setTimeout(done, timeoutMs);
        child.once("exit", () => {
            clearTimeout(timer);
            done();
        });
    });
}

function isSevenTvUrl(url) {
    return url.includes("cdn.7tv.app/");
}

function isEmoteUrl(url) {
    return /cdn\.betterttv\.net\/emote\/|cdn\.frankerfacez\.com\/(emote|emoticon)\/|cdn\.7tv\.app\/emote\/|static-cdn\.jtvnw\.net\/emoticons\//.test(url);
}

async function recordHistory(channels, dir, force) {
    mkdirSync(dir, { recursive: true });
    for (const channel of channels) {
        const file = join(dir, `${channel}.json`);
        if (existsSync(file) && !force) continue;
        const response = await fetch(`https://recent-messages.robotty.de/api/v2/recent-messages/${channel}?limit=800`);
        if (!response.ok) throw new Error(`recording history for ${channel} failed: ${response.status}`);
        writeFileSync(file, await response.text());
    }
}

function startHistoryServer(dir, delayMs) {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const match = /\/api\/v2\/recent-messages\/([^/?]+)/.exec(new URL(request.url).pathname);
            const file = match ? join(dir, `${decodeURIComponent(match[1]).toLowerCase()}.json`) : "";
            if (delayMs > 0) await sleep(delayMs);
            if (!file || !existsSync(file)) return Response.json({ messages: [], error: "not recorded", error_code: null });
            return new Response(readFileSync(file), { headers: { "content-type": "application/json" } });
        },
    });
    return { template: `http://127.0.0.1:${server.port}/api/v2/recent-messages/%1`, stop: () => server.stop(true) };
}

function bundleApp() {
    const result = spawnSync("node", [join(exampleRoot, "scripts/run.mjs"), "--bundle-only"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("bundling the app failed");
}

function oursSplitTree(channels) {
    const leaf = (channel) => ({ type: "split", id: `split-${channel}`, channel });
    if (channels.length === 1) return leaf(channels[0]);
    const [first, ...rest] = channels;
    const right = rest.length === 1 ? leaf(rest[0]) : { type: "container", id: "main-right", direction: "vertical", sizes: rest.map(() => 1), children: rest.map(leaf) };
    return { type: "container", id: "main-root", direction: "horizontal", sizes: [1, 1], children: [leaf(first), right] };
}

function oursLayout(channels) {
    return {
        tabs: [{ id: "tab-main", title: "Main", root: oursSplitTree(channels), focusedSplitId: `split-${channels[0]}` }],
        selectedTabId: "tab-main",
    };
}

function seedStorage(dir, channels) {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "local-storage.json");
    let entries = {};
    try {
        entries = JSON.parse(readFileSync(file, "utf8"));
    } catch {
        entries = {};
    }
    entries[STORAGE_KEYS.layout] = JSON.stringify(oursLayout(channels));
    entries[STORAGE_KEYS.settings] = JSON.stringify({ ...defaultSettings("linux"), streamerMode: "off" });
    writeFileSync(file, JSON.stringify(entries));
}

function relative(value, origin) {
    return typeof value === "number" ? Math.round(value - origin) : null;
}

function parseMarks(text) {
    const marks = [];
    for (const line of text.split("\n")) {
        const at = line.indexOf("[chatterino-timing] ");
        if (at < 0) continue;
        try {
            marks.push(JSON.parse(line.slice(at + "[chatterino-timing] ".length)));
        } catch {
            continue;
        }
    }
    return marks;
}

function firstMark(marks, event, origin) {
    const mark = marks.find((entry) => entry.event === event);
    return mark ? relative(mark.t, origin) : null;
}

function visibleIdsOf(list) {
    return list.visibleIds ?? (list.visibleImages ?? []).map((image) => image.messageId);
}

function oursListMetrics({ t0, polls, timings, listId }) {
    const byUrl = new Map(timings.map((entry) => [entry.url, entry]));
    const seen = new Set();
    let historyPoll;
    let firstScreenIds = new Set();
    const latestUrls = new Map();
    for (const poll of polls) {
        const list = poll.lists.find((candidate) => candidate.id === listId);
        if (!list) continue;
        const emotes = (list.visibleImages ?? []).filter((image) => image.kind === "emote");
        for (const emote of emotes) seen.add(emote.url);
        if (!historyPoll && list.visibleHistorical > 0) {
            historyPoll = poll;
            firstScreenIds = new Set(visibleIdsOf(list));
        }
        if (!historyPoll) continue;
        const visible = new Set(visibleIdsOf(list));
        for (const id of firstScreenIds) {
            if (!visible.has(id)) continue;
            latestUrls.set(id, new Set(emotes.filter((emote) => emote.messageId === id).map((emote) => emote.url)));
        }
    }
    const firstScreen = [...new Set([...latestUrls.values()].flatMap((urls) => [...urls]))];
    const paintedAt = (url) => byUrl.get(url)?.paintedMs ?? null;
    const paintedSeen = [...seen].map(paintedAt).filter((value) => value !== null);
    const firstScreenPainted = firstScreen.map(paintedAt);
    const failed = firstScreen.filter((url) => byUrl.get(url)?.state === "failed").length;
    const unpainted = firstScreenPainted.filter((value) => value === null).length - failed;
    const complete = unpainted === 0;
    const notSevenTv = firstScreen.filter((url) => !isSevenTvUrl(url));
    const notSevenTvPainted = notSevenTv.map(paintedAt);
    const notSevenTvComplete = notSevenTvPainted.every((value, index) => value !== null || byUrl.get(notSevenTv[index])?.state === "failed");
    const loadTimes = firstScreen
        .map((url) => byUrl.get(url))
        .filter((entry) => entry?.settledMs && entry.requestedMs)
        .map((entry) => entry.settledMs - entry.requestedMs)
        .sort((a, b) => a - b);
    const percentile = (fraction) => (loadTimes.length ? Math.round(loadTimes[Math.min(loadTimes.length - 1, Math.floor(fraction * loadTimes.length))]) : null);
    return {
        listId,
        historyShownMs: historyPoll ? relative(historyPoll.t, t0) : null,
        firstEmoteMs: paintedSeen.length ? relative(Math.min(...paintedSeen), t0) : null,
        firstScreenMs: complete && historyPoll ? relative(Math.max(historyPoll.t, ...firstScreenPainted.filter((value) => value !== null)), t0) : null,
        firstScreenEmotes: firstScreen.length,
        firstScreenNo7tvMs: notSevenTvComplete && historyPoll ? relative(Math.max(historyPoll.t, ...notSevenTvPainted.filter((value) => value !== null)), t0) : null,
        firstScreenNo7tvEmotes: notSevenTv.length,
        firstScreenFailed: failed,
        firstScreenUnpainted: unpainted,
        loadMsMedian: percentile(0.5),
        loadMsP90: percentile(0.9),
    };
}

function maxOrNull(values) {
    const present = values.filter((value) => value !== null && value !== undefined);
    return present.length === values.length && present.length > 0 ? Math.max(...present) : null;
}

function minOrNull(values) {
    const present = values.filter((value) => value !== null && value !== undefined);
    return present.length ? Math.min(...present) : null;
}

function oursMetrics({ t0, polls, timings, marks }) {
    const listIds = [...new Set(polls.flatMap((poll) => poll.lists.map((list) => list.id)))];
    const lists = listIds.map((listId) => oursListMetrics({ t0, polls, timings, listId }));
    const sum = (key) => lists.reduce((total, list) => total + (list[key] ?? 0), 0);
    const allLoadTimes = timings.filter((entry) => entry.settledMs && entry.requestedMs).map((entry) => entry.settledMs - entry.requestedMs).sort((a, b) => a - b);
    return {
        historyShownMs: maxOrNull(lists.map((list) => list.historyShownMs)),
        firstEmoteMs: minOrNull(lists.map((list) => list.firstEmoteMs)),
        firstScreenMs: maxOrNull(lists.map((list) => list.firstScreenMs)),
        firstScreenEmotes: sum("firstScreenEmotes"),
        firstScreenNo7tvMs: maxOrNull(lists.map((list) => list.firstScreenNo7tvMs)),
        firstScreenNo7tvEmotes: sum("firstScreenNo7tvEmotes"),
        firstScreenFailed: sum("firstScreenFailed"),
        firstScreenUnpainted: sum("firstScreenUnpainted"),
        loadMsMedian: allLoadTimes.length ? Math.round(allLoadTimes[Math.floor(allLoadTimes.length / 2)]) : null,
        imagesRequested: timings.length,
        lists,
        milestones: {
            join: firstMark(marks, "channel:join", t0),
            lookup: firstMark(marks, "channel:lookup", t0),
            roomstate: firstMark(marks, "irc:roomstate", t0),
            emoteSetsStart: firstMark(marks, "emotes:start", t0),
            bttv: firstMark(marks, "emotes:bttv", t0),
            ffz: firstMark(marks, "emotes:ffz", t0),
            seventv: firstMark(marks, "emotes:7tv", t0),
            globals: firstMark(marks, "globals:ready", t0),
            historyFetched: firstMark(marks, "history:fetched", t0),
            historyPrepended: firstMark(marks, "history:prepended", t0),
        },
    };
}

async function runOurs({ app = "ours", channel, channels, state, options, proxy, history }) {
    const isBaseline = app === "baseline";
    const service = isBaseline ? options.baselineService : options.service;
    const bundlePath = isBaseline ? options.baselineBundle : options.bundlePath;
    const profile = join(options.work, app, channel);
    if (state === "cold") rmSync(profile, { recursive: true, force: true });
    mkdirSync(profile, { recursive: true });
    seedStorage(join(profile, "storage"), channels);
    const socketDir = join("/tmp", `rngpui-emote-timing-${process.pid}`);
    mkdirSync(socketDir, { recursive: true });
    const socketPath = join(socketDir, `${channel}.sock`);
    rmSync(socketPath, { force: true });
    const env = {
        ...process.env,
        RNGPUI_BUNDLE: bundlePath,
        RNGPUI_CONTROL_SOCKET: socketPath,
        RNGPUI_STORAGE_DIR: join(profile, "storage"),
        RNGPUI_CACHE_DIR: join(profile, "cache"),
        RNGPUI_APP_ID: "com.chatterino.gpui.timing",
        RNGPUI_NO_ACTIVATE: "1",
        RNGPUI_WINDOW_SIZE: "1280,800",
        WAYLAND_DISPLAY: process.env.RNGPUI_TIMING_WAYLAND_DISPLAY || "rngpui-headless-0",
        CHATTERINO_TIMING: "1",
    };
    delete env.DISPLAY;
    delete env.RNGPUI_TEST_MODE;
    if (proxy) env.CHATTERINO_IRC_URL = proxy.wsUrl;
    if (history) env.CHATTERINO_RECENT_MESSAGES_URL = history.template;
    let log = "";
    const t0 = Date.now();
    const child = spawn(service, [], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => (log += chunk.toString()));
    child.stderr.on("data", (chunk) => (log += chunk.toString()));
    const polls = [];
    const deadline = t0 + options.seconds * 1000;
    let finalState;
    try {
        while (Date.now() < deadline) {
            if (child.exitCode !== null) throw new Error(`service exited early (${child.exitCode})\n${log.slice(-2000)}`);
            if (!existsSync(socketPath)) {
                await sleep(25);
                continue;
            }
            const state = await request(socketPath, { $cmd: "chatListState", images: true }).catch(() => undefined);
            if (state?.ok) polls.push({ t: Date.now(), lists: state.lists });
            await sleep(25);
        }
        finalState = await request(socketPath, { $cmd: "chatListState", images: true, timings: true }, 8000);
    } finally {
        child.kill("SIGTERM");
        await waitForExit(child, 3000);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    rmSync(socketDir, { recursive: true, force: true });
    writeFileSync(join(profile, `service-${state}.log`), log);
    const marks = parseMarks(log);
    const timings = finalState?.imageTimings ?? [];
    const raw = options.raw ? { imageTimings: timings, finalLists: finalState?.lists ?? [], t0 } : {};
    return { app, channel, state, ...oursMetrics({ t0, polls, timings, marks }), ...raw };
}

function chatterinoPids() {
    const pids = new Set();
    for (const entry of readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        try {
            if (readFileSync(`/proc/${entry}/comm`, "utf8").trim() === "chatterino") pids.add(Number(entry));
        } catch {
            continue;
        }
    }
    return pids;
}

function processStartMs(pid) {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const startTicks = Number(fields[19]);
    const bootSeconds = Number(/btime (\d+)/.exec(readFileSync("/proc/stat", "utf8"))[1]);
    const ticksPerSecond = Number(spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).stdout.trim()) || 100;
    return (bootSeconds + startTicks / ticksPerSecond) * 1000;
}

let ownedXvfb;
const BURST_GAP_MS = 2000;

async function ensureDisplay(display) {
    const socket = `/tmp/.X11-unix/X${display.replace(":", "")}`;
    if (existsSync(socket)) return;
    ownedXvfb = spawn(join(toolchainBin, "Xvfb"), [display, "-screen", "0", "1280x800x24", "-nolisten", "tcp"], { stdio: "ignore" });
    for (let attempt = 0; attempt < 100 && !existsSync(socket); attempt += 1) await sleep(50);
    if (!existsSync(socket)) throw new Error(`Xvfb ${display} did not start`);
}

function chatterinoSplit(channel) {
    return { type: "split", moderationMode: false, data: { type: "twitch", name: channel }, filters: [], flexh: 1, flexv: 1 };
}

function chatterinoSplitTree(channels) {
    if (channels.length === 1) return chatterinoSplit(channels[0]);
    const [first, ...rest] = channels;
    const right = rest.length === 1 ? chatterinoSplit(rest[0]) : { type: "vertical", flexh: 1, flexv: 1, items: rest.map(chatterinoSplit) };
    return { type: "horizontal", flexh: 1, flexv: 1, items: [chatterinoSplit(first), right] };
}

function chatterinoLayout(channels) {
    return {
        windows: [
            {
                type: "main",
                x: 0,
                y: 0,
                width: 1280,
                height: 800,
                emotePopup: { x: 0, y: 0, width: 0, height: 0 },
                tabs: [
                    {
                        title: "Main",
                        selected: true,
                        highlightsEnabled: true,
                        splits2: chatterinoSplitTree(channels),
                    },
                ],
            },
        ],
    };
}

function parseChatterinoLog(text) {
    const events = [];
    for (const line of text.split("\n")) {
        const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3})\|([^|]*)\|(.*)$/.exec(line);
        if (!match) continue;
        events.push({ t: new Date(match[1]).getTime(), category: match[2], message: match[3] });
    }
    return events;
}

function xwdColorfulPixels(buffer) {
    const header = (offset) => buffer.readUInt32BE(offset);
    const headerSize = header(0);
    const width = header(16);
    const height = header(20);
    const bitsPerPixel = header(44);
    const bytesPerLine = header(48);
    const colormapEntries = header(76);
    const byteOrder = header(28);
    if (bitsPerPixel !== 32) return null;
    const pixelsOffset = headerSize + colormapEntries * 12;
    const top = Math.round(height * 0.08);
    const bottom = Math.round(height * 0.92);
    let colorful = 0;
    for (let y = top; y < bottom; y += 1) {
        const row = pixelsOffset + y * bytesPerLine;
        for (let x = 0; x < width; x += 1) {
            const at = row + x * 4;
            const red = byteOrder === 0 ? buffer[at + 2] : buffer[at + 1];
            const green = byteOrder === 0 ? buffer[at + 1] : buffer[at + 2];
            const blue = byteOrder === 0 ? buffer[at] : buffer[at + 3];
            const high = Math.max(red, green, blue);
            const low = Math.min(red, green, blue);
            if (high - low > 70 && high > 90) colorful += 1;
        }
    }
    return colorful;
}

async function captureLoop(display, until, frames, keepDir) {
    let index = 0;
    while (Date.now() < until) {
        const t = Date.now();
        const result = spawnSync("xwd", ["-root", "-display", display, "-silent"], { maxBuffer: 64 * 1024 * 1024 });
        if (result.status === 0 && result.stdout.length > 100) {
            frames.push({ t, colorful: xwdColorfulPixels(result.stdout) });
            if (index % 4 === 0) writeFileSync(join(keepDir, `frame-${String(index).padStart(3, "0")}-${t}.xwd`), result.stdout);
            index += 1;
        }
        await sleep(Math.max(0, 200 - (Date.now() - t)));
    }
}

function pixelSettledAt(frames, after) {
    const later = frames.filter((frame) => frame.t >= after && frame.colorful !== null);
    if (later.length < 4) return null;
    const tail = later.slice(-Math.max(3, Math.floor(later.length / 4))).map((frame) => frame.colorful).sort((a, b) => a - b);
    const plateau = tail[Math.floor(tail.length / 2)];
    const firstAbove = later.find((frame) => frame.colorful >= plateau * 0.95);
    return firstAbove ? firstAbove.t : null;
}

async function runChatterino({ channel, channels, state, options, proxy, history }) {
    await ensureDisplay(options.display);
    const profile = join(options.work, "chatterino", channel);
    if (state === "cold") rmSync(profile, { recursive: true, force: true });
    const settingsDir = join(profile, "data/chatterino/Settings");
    for (const dir of [settingsDir, join(profile, "cache"), join(profile, "config"), join(profile, "state")]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(settingsDir, "window-layout.json"), JSON.stringify(chatterinoLayout(channels), null, 4));
    writeFileSync(join(settingsDir, "settings.json"), readFileSync(join(exampleRoot, "docs/compare/settings.json")));
    const framesDir = join(profile, `frames-${state}`);
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });

    const rules = ["chatterino.http.debug=true", "chatterino.recentmessages.debug=true", "chatterino.cache.debug=true"].join(";");
    const sandboxEnv = [
        `--env=QT_LOGGING_RULES=${rules}`,
        "--env=QT_MESSAGE_PATTERN=%{time yyyy-MM-ddTHH:mm:ss.zzz}|%{category}|%{message}",
        "--env=QT_FORCE_STDERR_LOGGING=1",
    ];
    if (history) sandboxEnv.push(`--env=CHATTERINO2_RECENT_MESSAGES_URL=${history.template}`);
    if (proxy) {
        sandboxEnv.push("--env=CHATTERINO2_TWITCH_SERVER_HOST=127.0.0.1", `--env=CHATTERINO2_TWITCH_SERVER_PORT=${proxy.tcpPort}`, "--env=CHATTERINO2_TWITCH_SERVER_SECURE=false");
    }
    const before = chatterinoPids();
    let log = "";
    const launchedAt = Date.now();
    const child = spawn(
        "flatpak",
        [
            "run",
            "--user",
            "--nosocket=wayland",
            "--socket=x11",
            `--filesystem=${profile}`,
            ...sandboxEnv,
            "--command=sh",
            "com.chatterino.chatterino",
            "-c",
            'export XDG_DATA_HOME="$1/data" XDG_CACHE_HOME="$1/cache" XDG_CONFIG_HOME="$1/config" XDG_STATE_HOME="$1/state"; exec chatterino',
            "sh",
            profile,
        ],
        { env: { ...process.env, DISPLAY: options.display, WAYLAND_DISPLAY: "" }, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", (chunk) => (log += chunk.toString()));
    child.stderr.on("data", (chunk) => (log += chunk.toString()));
    let pid;
    for (let attempt = 0; attempt < 600 && pid === undefined; attempt += 1) {
        pid = [...chatterinoPids()].find((candidate) => !before.has(candidate));
        if (pid === undefined) await sleep(25);
    }
    if (pid === undefined) {
        child.kill("SIGTERM");
        throw new Error(`chatterino did not start\n${log.slice(-2000)}`);
    }
    const t0 = processStartMs(pid);
    const frames = [];
    try {
        await captureLoop(options.display, t0 + options.seconds * 1000, frames, framesDir);
    } finally {
        try {
            process.kill(pid, "SIGTERM");
        } catch {
            undefined;
        }
        await waitForExit(child, 8000);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    writeFileSync(join(profile, `chatterino-${state}.log`), log);
    const events = parseChatterinoLog(log);
    const historyLines = events.filter((event) => event.message.includes("Successfully loaded recent messages"));
    const historyFetched = historyLines[0];
    const historyComplete = historyLines.length >= channels.length ? historyLines[channels.length - 1] : undefined;
    const emoteLoads = events
        .map((event) => ({ ...event, match: /^Get (\[CACHED\] )?(\d+) (\S+)/.exec(event.message) }))
        .filter((event) => event.category === "chatterino.http" && event.match && isEmoteUrl(event.match[3]));
    const unique = new Map();
    for (const load of emoteLoads) if (!unique.has(load.match[3])) unique.set(load.match[3], load);
    const loads = [...unique.values()];
    const afterHistory = historyFetched ? loads.filter((load) => load.t >= historyFetched.t).sort((a, b) => a.t - b.t) : [];
    const burst = [];
    for (const load of afterHistory) {
        if (burst.length && load.t - burst[burst.length - 1].t > BURST_GAP_MS) break;
        burst.push(load);
    }
    const lastAfterHistory = burst.length ? burst[burst.length - 1].t : historyComplete?.t ?? null;
    const burstNo7tv = burst.filter((load) => !isSevenTvUrl(load.match[3]));
    const lastNo7tv = burstNo7tv.length ? burstNo7tv[burstNo7tv.length - 1].t : historyComplete?.t ?? null;
    const historyAt = historyFetched?.t ?? null;
    const pixelsSettled = historyAt ? pixelSettledAt(frames, historyAt) : null;
    for (const file of readdirSync(framesDir).filter((name) => name.endsWith(".xwd"))) {
        const source = join(framesDir, file);
        spawnSync(join(process.env.HOME ?? "", ".local/bin/ffmpeg"), ["-loglevel", "error", "-y", "-i", source, source.replace(/\.xwd$/, ".png")]);
        rmSync(source, { force: true });
    }
    writeFileSync(join(framesDir, "colorful.json"), JSON.stringify(frames.map((frame) => ({ t: relative(frame.t, t0), colorful: frame.colorful }))));
    return {
        app: "chatterino",
        channel,
        state,
        flatpakStartMs: Math.round(t0 - launchedAt),
        historyShownMs: relative(historyComplete?.t, t0),
        firstEmoteMs: loads.length ? relative(Math.min(...loads.map((load) => load.t)), t0) : null,
        firstScreenMs: options.mode === "quiet" ? relative(lastAfterHistory, t0) : null,
        firstScreenEmotes: burst.length,
        firstScreenNo7tvMs: options.mode === "quiet" ? relative(lastNo7tv, t0) : null,
        firstScreenNo7tvEmotes: burstNo7tv.length,
        laterEmotes: afterHistory.length - burst.length,
        cachedEmotes: loads.filter((load) => load.match[1]).length,
        pixelsSettledMs: relative(pixelsSettled, t0),
        milestones: {
            firstLogLine: events.length ? relative(events[0].t, t0) : null,
            historyRequested: relative(events.find((event) => event.message.includes("Loading recent messages"))?.t, t0),
            historyFetched: relative(historyAt, t0),
        },
    };
}

function formatMs(value) {
    return value === null || value === undefined ? "—" : `${(value / 1000).toFixed(2)} s`;
}

function printTable(results) {
    const rows = [["channel", "app", "cache", "history shown", "first emote", "first screen done", "emote lag", "emotes", "notes"]];
    for (const result of results) {
        const notes = [];
        if (result.firstScreenFailed) notes.push(`${result.firstScreenFailed} failed`);
        if (result.firstScreenUnpainted) notes.push(`${result.firstScreenUnpainted} unpainted`);
        if (result.cachedEmotes !== undefined) notes.push(`${result.cachedEmotes} from cache`);
        if (result.pixelsSettledMs !== undefined && result.pixelsSettledMs !== null) notes.push(`pixels settle ${formatMs(result.pixelsSettledMs)}`);
        if (result.error) notes.push(result.error.split("\n")[0]);
        rows.push([
            result.channel,
            result.app,
            result.state,
            formatMs(result.historyShownMs),
            formatMs(result.firstEmoteMs),
            formatMs(result.firstScreenMs),
            formatMs(result.firstScreenMs !== null && result.firstScreenMs !== undefined && result.historyShownMs !== null && result.historyShownMs !== undefined ? result.firstScreenMs - result.historyShownMs : null),
            String(result.firstScreenEmotes ?? "—"),
            notes.join(", "),
        ]);
    }
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    for (const [index, row] of rows.entries()) {
        console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
        if (index === 0) console.log(widths.map((width) => "-".repeat(width)).join("  "));
    }
}

function median(values) {
    const present = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
    if (present.length === 0) return null;
    const middle = Math.floor(present.length / 2);
    return present.length % 2 === 1 ? present[middle] : Math.round((present[middle - 1] + present[middle]) / 2);
}

function printSummary(results) {
    const groups = new Map();
    for (const result of results) {
        const key = `${result.channel}\u0000${result.app}\u0000${result.state}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(result);
    }
    const rows = [["channel", "app", "cache", "runs", "history shown", "first emote", "first screen done", "emote lag", "emotes", "without 7TV", "incomplete"]];
    for (const runs of groups.values()) {
        const [first] = runs;
        const lags = runs.map((run) => (typeof run.firstScreenMs === "number" && typeof run.historyShownMs === "number" ? run.firstScreenMs - run.historyShownMs : null));
        const incomplete = runs.filter((run) => typeof run.firstScreenMs !== "number").length;
        rows.push([
            first.channel,
            first.app,
            first.state,
            String(runs.length),
            formatMs(median(runs.map((run) => run.historyShownMs))),
            formatMs(median(runs.map((run) => run.firstEmoteMs))),
            formatMs(median(runs.map((run) => run.firstScreenMs))),
            formatMs(median(lags)),
            String(median(runs.map((run) => run.firstScreenEmotes)) ?? "—"),
            `${formatMs(median(runs.map((run) => run.firstScreenNo7tvMs)))} (${median(runs.map((run) => run.firstScreenNo7tvEmotes)) ?? "—"})`,
            String(incomplete),
        ]);
    }
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    console.log("\nmedians");
    for (const [index, row] of rows.entries()) {
        console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
        if (index === 0) console.log(widths.map((width) => "-".repeat(width)).join("  "));
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    mkdirSync(options.work, { recursive: true });
    if (options.apps.includes("ours")) {
        if (options.bundle) bundleApp();
        if (!existsSync(options.service)) throw new Error(`rngpui-service not found at ${options.service}`);
    }
    if (options.apps.includes("baseline") && !(options.baselineService && options.baselineBundle)) {
        throw new Error("the baseline app needs --baseline-service and --baseline-bundle");
    }
    const historyDir = join(options.work, "history");
    if (options.history === "replay") await recordHistory(options.channels, historyDir, options.record);
    const history = options.history === "replay" ? startHistoryServer(historyDir, options.historyDelayMs) : undefined;
    const proxy = options.mode === "quiet" ? startQuietIrcProxy() : undefined;
    const results = [];
    try {
        const groups = options.layout === "main" ? [{ channel: `main(${options.channels.length})`, channels: options.channels }] : options.channels.map((channel) => ({ channel, channels: [channel] }));
        for (const { channel, channels } of groups) {
            for (let round = 0; round < options.repeat; round += 1) {
                const apps = round % 2 === 0 ? options.apps : [...options.apps].reverse();
                for (const app of apps) {
                    for (const state of options.states) {
                        const run = app === "chatterino" ? runChatterino : runOurs;
                        process.stderr.write(`[emote-timing] ${app} ${channel} ${state}${options.repeat > 1 ? ` #${round + 1}` : ""}\n`);
                        try {
                            results.push({ round, ...(await run({ app, channel, channels, state, options, proxy, history })) });
                        } catch (error) {
                            results.push({ round, app, channel, state, error: String(error?.stack ?? error) });
                        }
                    }
                }
            }
        }
    } finally {
        proxy?.stop();
        history?.stop();
        ownedXvfb?.kill("SIGTERM");
    }
    printTable(results);
    if (options.repeat > 1) printSummary(results);
    if (options.json) writeFileSync(options.json, JSON.stringify({ options, results }, null, 2));
}

await main();
