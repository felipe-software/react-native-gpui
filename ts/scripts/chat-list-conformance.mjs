#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureWindow, conformanceEnv, listWindows, sleep } from "./conformance-utils.mjs";
import { colorDistance, parseColor, pixelAt } from "./pixel.mjs";
import { readPng } from "./png.mjs";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(tsRoot, "..");
const outDir = process.argv[2] || join(tmpdir(), "rngpui-chat-list-conformance");
const LONG_WORD = "Supercalifragilisticexpialidocious".repeat(3);
const COLORS = {
    emote: "#e0a030",
    badge: "#30a0e0",
    cover: "#ff00ff",
    animatedA: "#20c040",
    animatedB: "#8040c0",
    muted: "#8c7f7f",
    thumb: "#575757",
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const outJs = join(outDir, "app.js");
const controlSocket = join(outDir, "control.sock");

const bundle = spawnSync("bun", ["scripts/bundle-app.mjs", resolve(tsRoot, "examples/chat-list-conformance.tsx"), outJs], {
    cwd: tsRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
});
if (bundle.status !== 0) {
    process.stderr.write(bundle.stdout || "");
    process.stderr.write(bundle.stderr || "");
    fail("bundle failed");
}

const serviceBin = resolve(process.env.RNGPUI_SERVICE || resolve(repoRoot, "rust", "target", "release", "rngpui-service"));
if (!existsSync(serviceBin)) fail(`rngpui-service not found: ${serviceBin} (build it or set RNGPUI_SERVICE)`);

let output = "";
const child = spawn(serviceBin, [], {
    cwd: tsRoot,
    env: conformanceEnv({
        RNGPUI_BUNDLE: outJs,
        RNGPUI_CONTROL_SOCKET: controlSocket,
        RNGPUI_FRAME_CAPTURE: "1",
    }),
    stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => (output += chunk.toString()));
child.stderr?.on("data", (chunk) => (output += chunk.toString()));

const results = [];
function check(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail });
}

try {
    await waitFor(() => /CHAT_READY/.test(output), 15000, "CHAT_READY");
    await waitFor(async () => (await chatNode())?.children?.length >= 8, 8000, "eight laid-out messages");
    await checkLayout();
    await checkPixels();
    await checkAnimation();
    await checkEvents();
    await checkOcclusion();
    await checkSelectionAndCopy();
    await checkScrollAnchoring();
    await checkPauseOnHover();
    await checkScrollbarDrag();
    await checkIdle();
} catch (error) {
    stop();
    fail(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n--- results ---\n${summary()}\n--- output ---\n${output.trim().slice(-4000)}`);
}
stop();

const broken = results.filter((result) => !result.ok);
if (broken.length > 0) fail(`${broken.length}/${results.length} checks failed\n${summary()}`);
console.log(`CHAT_LIST_CONFORMANCE PASS ${results.length} checks\n${summary()}`);
process.exit(0);

function summary() {
    return results.map((result) => `  ${result.ok ? "ok  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`).join("\n");
}

async function checkLayout() {
    const chat = await chatNode();
    const list = chat.bounds;
    check("list bounds", near(list.x, 20) && near(list.y, 40) && near(list.width, 420) && near(list.height, 320), JSON.stringify(list));

    const first = await messageNode("m-first");
    const firstItems = first.children;
    const timestamp = firstItems[0];
    check(
        "timestamp leads the row at the left margin",
        timestamp.type === "chatlist-timestamp" && timestamp.text === "12:00" && near(timestamp.bounds.x, list.x + 8),
        `${timestamp.type} "${timestamp.text}" x=${timestamp.bounds.x}`,
    );

    const hello = item(first, "chatlist-text", "hello");
    const kappa = item(first, "chatlist-emote", "Kappa");
    const badge = item(first, "chatlist-badge", "moderator");
    check("emote keeps its 28x28 size", near(kappa.bounds.width, 28) && near(kappa.bounds.height, 28), JSON.stringify(kappa.bounds));
    check(
        "emote sits 2px below the text bottom (compact emotes)",
        near(bottom(kappa), bottom(hello) + 2),
        `emote bottom ${bottom(kappa)} text bottom ${bottom(hello)}`,
    );
    check("emote line is 24px tall plus 4px margins", near(first.bounds.height, 32), `row height ${first.bounds.height}`);
    check("badge is bottom aligned with text", near(bottom(badge), bottom(hello)) && near(badge.bounds.height, 18), JSON.stringify(badge.bounds));

    const wrap = await messageNode("m-wrap");
    const words = wrap.children.filter((node) => node.type === "chatlist-text");
    const lines = new Set(words.map((node) => Math.round(node.bounds.y)));
    const right = list.x + list.width - 8;
    const overflow = words.filter((node) => node.bounds.x + node.bounds.width > right + 0.5);
    check("long message wraps onto several lines", lines.size >= 3, `${lines.size} lines`);
    check("wrapped words stay inside the right margin", overflow.length === 0, overflow.map((node) => node.text).join(","));
    const sentence = "this message is long enough that it has to wrap across several lines inside the chat list box".split(" ");
    const whole = sentence.every((word) => words.some((node) => node.text === word));
    check("wrapping happens at spaces", whole);
    const chunks = words.filter((node) => LONG_WORD.includes(node.text) && !sentence.includes(node.text));
    check(
        "an overlong word is broken across lines",
        chunks.length >= 2 && chunks.map((node) => node.text).join("") === LONG_WORD,
        `${chunks.length} chunks`,
    );

    const zero = await messageNode("m-zero");
    const base = item(zero, "chatlist-emote", "Base");
    const cover = item(zero, "chatlist-emote", "Cover");
    const after = item(zero, "chatlist-text", "after");
    check(
        "zero-width emote is centered over the previous emote",
        near(center(base).x, center(cover).x) && near(bottom(base), bottom(cover)),
        `base ${JSON.stringify(base.bounds)} cover ${JSON.stringify(cover.bounds)}`,
    );
    check("zero-width emote takes no extra width", after.bounds.x < base.bounds.x + base.bounds.width + 8, `after.x=${after.bounds.x}`);

    const reply = await messageNode("m-reply");
    const replyText = item(reply, "chatlist-text", "Replying");
    const replyBody = item(reply, "chatlist-user", "carol:");
    check(
        "reply renders as a smaller line above the message",
        replyText.bounds.height < replyBody.bounds.height && bottom(replyText) <= replyBody.bounds.y + 0.5,
        `reply ${JSON.stringify(replyText.bounds)} body ${JSON.stringify(replyBody.bounds)}`,
    );

    const disabled = await messageNode("m-disabled");
    const history = await messageNode("m-history");
    check(
        "disabled and historical rows are faded",
        Number(disabled.style?.opacity) < 1 && Number(history.style?.opacity) < 1,
        `${disabled.style?.opacity} ${history.style?.opacity}`,
    );
}

async function checkPixels() {
    const png = await capture("layout");
    const first = await messageNode("m-first");
    const kappa = item(first, "chatlist-emote", "Kappa");
    const badge = item(first, "chatlist-badge", "moderator");
    const zero = await messageNode("m-zero");
    const base = item(zero, "chatlist-emote", "Base");
    const timestamp = first.children[0];
    expectColor(png, "emote pixels", center(kappa), COLORS.emote);
    expectColor(png, "badge pixels", center(badge), COLORS.badge);
    expectColor(png, "zero-width overlay paints over the base emote", center(base), COLORS.cover);
    expectColor(png, "base emote shows around the overlay", { x: center(base).x, y: base.bounds.y + 3 }, COLORS.emote);
    const muted = closestInRect(png, timestamp.bounds, COLORS.muted);
    check("timestamp is drawn in the muted color", muted < 40, `closest distance ${muted.toFixed(1)}`);
}

async function checkAnimation() {
    const animated = await messageNode("m-animated");
    const party = item(animated, "chatlist-emote", "Party");
    const seen = new Set();
    for (let index = 0; index < 6 && seen.size < 2; index++) {
        const png = await capture(`animated-${index}`);
        const color = sample(png, center(party));
        const distanceA = colorDistance(color, parseColor(COLORS.animatedA));
        const distanceB = colorDistance(color, parseColor(COLORS.animatedB));
        if (distanceA < 30) seen.add("A");
        if (distanceB < 30) seen.add("B");
        await sleep(130);
    }
    check("animated emote plays its frames", seen.size === 2, [...seen].join(","));
    await sleep(1200);
    const stats = await request({ $cmd: "frameStats" });
    check(
        "a visible GIF repaints at its own frame rate, not every vsync",
        stats.fpsLast1s >= 3 && stats.fpsLast1s <= 12,
        `${stats.fpsLast1s} fps with one 200ms-frame GIF`,
    );
}

async function checkEvents() {
    const first = await messageNode("m-first");
    const alice = item(first, "chatlist-user", "alice:");
    let since = output.length;
    await request({ $cmd: "realtap", ...center(alice) });
    const realPress = await waitForEvent("press", since, (payload) => payload.target === "user");
    check(
        "real click on a name fires onPress(user)",
        realPress.login === "alice" && realPress.messageId === "m-first" && realPress.button === "left",
        JSON.stringify(realPress),
    );
    since = output.length;
    await request({ $cmd: "tap", ...center(alice) });
    const debugPress = await waitForEvent("press", since, (payload) => payload.target === "user");
    check("`do tap` agrees with the real click", debugPress.login === "alice", JSON.stringify(debugPress));

    const kappa = item(first, "chatlist-emote", "Kappa");
    since = output.length;
    await request({ $cmd: "realtap", ...center(kappa) });
    const emotePress = await waitForEvent("press", since, (payload) => payload.target === "emote");
    check("click on an emote fires onPress(emote)", emotePress.name === "Kappa", JSON.stringify(emotePress));

    const hello = item(first, "chatlist-text", "hello");
    since = output.length;
    await request({ $cmd: "realcontext", ...center(hello) });
    const contextPress = await waitForEvent("press", since, (payload) => payload.button === "right");
    check("right click on plain text fires onPress(message, right)", contextPress.target === "message" && contextPress.messageId === "m-first", JSON.stringify(contextPress));

    const linkRow = await messageNode("m-link");
    const link = item(linkRow, "chatlist-link", "https://example.com/page");
    since = output.length;
    await request({ $cmd: "realmove", ...center(link) });
    const hover = await waitForEvent("hover", since, (payload) => payload && payload.target === "link");
    check(
        "hovering a link reports it with window-space bounds",
        hover.url === "https://example.com/page" && near(hover.x, link.bounds.x) && near(hover.width, link.bounds.width),
        JSON.stringify(hover),
    );
    const png = await capture("link-hover");
    const underlineY = bottom(link) - 2;
    let underline = false;
    for (let dy = -3; dy <= 2 && !underline; dy++) {
        const color = sample(png, { x: center(link).x, y: underlineY + dy });
        underline = colorDistance(color, parseColor("#4286f4")) < 60;
    }
    check("hovered link is underlined", underline);
    since = output.length;
    await request({ $cmd: "realmove", x: 300, y: 340 });
    const left = await waitForEvent("hover", since, (payload) => payload === null);
    check("leaving the link reports hover null", left === null);
}

async function checkOcclusion() {
    const tree = (await request({ $cmd: "dump" })).tree;
    const overlay = findNode(tree, (node) => node.accessibility?.testID === "overlay");
    const wrap = await messageNode("m-wrap");
    const covered = wrap.children.find((node) => {
        const point = center(overlay);
        return node.bounds.x <= point.x && point.x <= node.bounds.x + node.bounds.width && node.bounds.y <= point.y && point.y <= bottom(node);
    });
    check("the overlay sits on top of a laid-out message word", covered !== undefined, covered?.text ?? "nothing under the overlay");
    for (const command of ["realtap", "tap"]) {
        const since = output.length;
        await request({ $cmd: command, ...center(overlay) });
        await sleep(300);
        const slice = output.slice(since);
        const chatPresses = [...slice.matchAll(/CHAT_EVENT (.+)/g)].map((match) => JSON.parse(match[1])).filter((event) => event.kind === "press");
        check(`${command}: a covering overlay gets the click, the list stays silent`, /CHAT_OVERLAY_PRESS/.test(slice) && chatPresses.length === 0, `${chatPresses.length} chat presses`);
    }
    await request({ $cmd: "realmove", x: 600, y: 390 });
}

async function checkSelectionAndCopy() {
    const first = await messageNode("m-first");
    const hello = item(first, "chatlist-text", "hello");
    const wrap = await messageNode("m-wrap");
    const thisWord = item(wrap, "chatlist-text", "this");
    await request({
        $cmd: "realdrag",
        x: hello.bounds.x + 1,
        y: center(hello).y,
        x2: thisWord.bounds.x + thisWord.bounds.width - 1,
        y2: center(thisWord).y,
        steps: 10,
    });
    const state = (await request({ $cmd: "chatListState" })).lists[0];
    const expected = "hello world Kappa\n12:01 bob: this";
    check("drag selects across messages; emotes copy as names", state.selection === expected, JSON.stringify(state.selection));
    const key = await request({ $cmd: "realKey", key: "secondary-c" });
    const clipboard = await request({ $cmd: "clipboard" });
    const platformWrote = clipboard.text != null;
    const copied = platformWrote ? clipboard.text : clipboard.lastCopy;
    check(
        "Ctrl+C copies the selection",
        copied === expected,
        `${JSON.stringify(copied)} (${platformWrote ? "read back from the platform clipboard" : "platform clipboard unavailable to an unfocused test window; checked the copied text"}) key=${key.ok}`,
    );
    const png = await capture("selection");
    const world = item(first, "chatlist-text", "world");
    const washed = sample(png, { x: center(world).x, y: world.bounds.y + 2 });
    const plain = sample(png, { x: list(await chatNode()).x + list(await chatNode()).width - 20, y: center(world).y });
    check("selection is painted", colorDistance(washed, plain) > 10, `${washed.hex} vs ${plain.hex}`);

    const alice = item(first, "chatlist-user", "alice:");
    const since = output.length;
    await request({ $cmd: "realtap", ...center(alice) });
    await waitForEvent("press", since, (payload) => payload.target === "user");
    const cleared = (await request({ $cmd: "chatListState" })).lists[0];
    check("clicking a name clears the selection instead of selecting", cleared.selection === null, JSON.stringify(cleared.selection));
}

async function checkScrollAnchoring() {
    const list = (await chatNode()).bounds;
    await request({ $cmd: "realmove", x: 600, y: 390 });
    await settle();
    await pressControl("ctl-append-20", /CHAT_CONTROL appended=20/);
    await waitFor(async () => (await state()).messages === 28, 4000, "28 messages");
    await settle();
    const lastAtBottom = await lastVisibleMessage();
    check("stays pinned to the bottom while following", near(bottom(lastAtBottom), list.y + list.height, 1), `${bottom(lastAtBottom)} vs ${list.y + list.height}`);

    let since = output.length;
    await request({ $cmd: "realscroll", x: list.x + 100, y: list.y + 100, dx: 0, dy: 150 });
    const scrolled = await waitForEvent("scroll", since, (payload) => payload.atBottom === false);
    check("wheel scroll up leaves the bottom", scrolled.atBottom === false, JSON.stringify(scrolled));
    await request({ $cmd: "realmove", x: 600, y: 380 });
    await settle();
    const reference = await referenceRow(list);

    since = output.length;
    await pressControl("ctl-append-20", /CHAT_CONTROL appended=40/);
    const unseen = await waitForEvent("scroll", since, (payload) => payload.unseen >= 20);
    await settle();
    let moved = await rowById(reference.accessibility.nativeID);
    check("append keeps a scrolled-up viewport still", moved && near(moved.bounds.y, reference.bounds.y, 0.5), `${reference.bounds.y} -> ${moved?.bounds.y}`);
    check("onScrollState counts unseen messages", unseen.unseen === 20, JSON.stringify(unseen));

    await pressControl("ctl-prepend-20", /CHAT_CONTROL prepended=20/);
    await settle();
    moved = await rowById(reference.accessibility.nativeID);
    check("prepend keeps the viewport still", moved && near(moved.bounds.y, reference.bounds.y, 0.5), `${reference.bounds.y} -> ${moved?.bounds.y}`);

    await pressControl("ctl-append-20", /CHAT_CONTROL appended=60/);
    await waitFor(async () => (await state()).messages === 80, 4000, "trimmed to maxMessages");
    await settle();
    moved = await rowById(reference.accessibility.nativeID);
    const trimmed = await state();
    check("maxMessages drops the oldest", trimmed.messages === 80 && trimmed.firstMessageId !== "m-old-20", `${trimmed.messages} first=${trimmed.firstMessageId}`);
    check("trimming keeps the viewport still", moved && near(moved.bounds.y, reference.bounds.y, 0.5), `${reference.bounds.y} -> ${moved?.bounds.y}`);

    since = output.length;
    await pressControl("ctl-bottom");
    const back = await waitForEvent("scroll", since, (payload) => payload.atBottom === true);
    check("scrollToBottom returns to the bottom and clears unseen", back.unseen === 0, JSON.stringify(back));
    await settle();
    const last = await lastVisibleMessage();
    check("bottom row is the newest message", last.accessibility.nativeID === "m-new-60" && near(bottom(last), list.y + list.height, 1), `${last.accessibility.nativeID} ${bottom(last)}`);
}

async function checkPauseOnHover() {
    const list = (await chatNode()).bounds;
    let since = output.length;
    await request({ $cmd: "realmove", x: list.x + 150, y: list.y + 150 });
    const paused = await waitForEvent("scroll", since, (payload) => payload.paused === true);
    check("hovering pauses auto-scroll", paused.paused === true);
    const before = await lastVisibleMessage();
    since = output.length;
    await pressControl("ctl-append-1", /CHAT_CONTROL appended=61/);
    const pending = await waitForEvent("scroll", since, (payload) => payload.unseen === 1);
    await settle();
    const after = await rowById(before.accessibility.nativeID);
    check("a paused list does not move on append", after && near(after.bounds.y, before.bounds.y, 0.5) && pending.atBottom === false, `${before.bounds.y} -> ${after?.bounds.y}`);
    since = output.length;
    await request({ $cmd: "realmove", x: 600, y: 390 });
    const resumed = await waitForEvent("scroll", since, (payload) => payload.paused === false && payload.atBottom === true);
    check("leaving resumes and catches up", resumed.unseen === 0, JSON.stringify(resumed));
}

async function checkScrollbarDrag() {
    await settle();
    const current = await state();
    const thumb = current.scrollbar.thumb;
    check("overflowing list shows a scrollbar thumb", thumb && thumb.height >= 20, JSON.stringify(current.scrollbar));
    if (!thumb) return;
    const png = await capture("thumb");
    expectColor(png, "thumb is painted at the right edge", { x: thumb.x + thumb.width - 2, y: thumb.y + thumb.height / 2 }, COLORS.thumb, 30);
    const list = (await chatNode()).bounds;
    await request({
        $cmd: "realdrag",
        x: thumb.x + thumb.width - 2,
        y: thumb.y + thumb.height / 2,
        x2: thumb.x + thumb.width - 2,
        y2: list.y - 50,
        steps: 6,
    });
    await settle();
    const top = await state();
    check("dragging the thumb to the top shows the oldest message", top.anchor?.messageId === top.firstMessageId && top.atBottom === false, JSON.stringify(top.anchor));
    await pressControl("ctl-bottom");
    await settle();
}

async function checkIdle() {
    await request({ $cmd: "realmove", x: 600, y: 390 });
    await sleep(600);
    const before = await request({ $cmd: "frameStats" });
    await sleep(1500);
    const after = await request({ $cmd: "frameStats" });
    check("an idle list with no visible animation does not repaint", after.framesPainted === before.framesPainted, `${before.framesPainted} -> ${after.framesPainted}`);
}

async function pressControl(id, expectLine) {
    const since = output.length;
    const tree = (await request({ $cmd: "dump" })).tree;
    const node = findNode(tree, (candidate) => candidate.accessibility?.testID === id);
    if (!node) throw new Error(`control ${id} not found`);
    await request({ $cmd: "tap", ...center(node) });
    if (expectLine) await waitFor(() => expectLine.test(output.slice(since)), 4000, String(expectLine));
}

async function settle() {
    await sleep(250);
}

async function referenceRow(list) {
    const chat = await chatNode();
    const rows = chat.children.filter((row) => row.bounds.y > list.y + 20 && bottom(row) < list.y + list.height - 20);
    if (rows.length === 0) throw new Error("no fully visible row to anchor on");
    return rows[Math.floor(rows.length / 2)];
}

async function lastVisibleMessage() {
    const chat = await chatNode();
    return chat.children[chat.children.length - 1];
}

async function rowById(id) {
    const chat = await chatNode();
    return chat.children.find((row) => row.accessibility?.nativeID === id);
}

async function state() {
    return (await request({ $cmd: "chatListState" })).lists[0];
}

async function chatNode() {
    const reply = await request({ $cmd: "dump" });
    return findNode(reply.tree, (node) => node.type === "chatlist");
}

async function messageNode(id) {
    const row = await rowById(id);
    if (!row) throw new Error(`message ${id} is not visible`);
    return row;
}

function item(row, type, text) {
    const found = row.children.find((node) => node.type === type && node.text === text);
    if (!found) throw new Error(`${type} "${text}" not found in ${row.accessibility?.nativeID}`);
    return found;
}

function findNode(node, predicate) {
    if (!node) return null;
    if (predicate(node)) return node;
    for (const child of node.children ?? []) {
        const found = findNode(child, predicate);
        if (found) return found;
    }
    return null;
}

function list(node) {
    return node.bounds;
}

function center(node) {
    return { x: node.bounds.x + node.bounds.width / 2, y: node.bounds.y + node.bounds.height / 2 };
}

function bottom(node) {
    return node.bounds.y + node.bounds.height;
}

function near(a, b, tolerance = 0.75) {
    return Math.abs(a - b) <= tolerance;
}

async function capture(label) {
    const window = listWindows().find((candidate) => candidate.pid === child.pid);
    if (!window) throw new Error("service window is not registered for capture");
    const path = join(outDir, `${label}.png`);
    captureWindow(window, path);
    const png = readPng(path);
    png.scale = png.width / window.width;
    return png;
}

function sample(png, point) {
    return pixelAt(png, point.x * png.scale, point.y * png.scale);
}

function expectColor(png, name, point, expected, tolerance = 24) {
    const color = sample(png, point);
    const distance = colorDistance(color, parseColor(expected));
    check(name, distance <= tolerance, `${color.hex} vs ${expected} (distance ${distance.toFixed(1)})`);
}

function closestInRect(png, rect, expected) {
    const target = parseColor(expected);
    let best = Infinity;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
            best = Math.min(best, colorDistance(sample(png, { x, y }), target));
        }
    }
    return best;
}

async function waitForEvent(kind, since, predicate, timeoutMs = 4000) {
    let found;
    await waitFor(
        () => {
            for (const match of output.slice(since).matchAll(/CHAT_EVENT (.+)/g)) {
                const event = JSON.parse(match[1]);
                if (event.kind === kind && predicate(event.payload)) {
                    found = event.payload;
                    return true;
                }
            }
            return false;
        },
        timeoutMs,
        `${kind} event`,
    );
    return found;
}

async function waitFor(predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        if (child.exitCode !== null) throw new Error(`service exited while waiting for ${label}`);
        await sleep(50);
    }
    throw new Error(`timed out waiting for ${label}`);
}

function request(payload) {
    return new Promise((resolveRequest, rejectRequest) => {
        const socket = net.connect(controlSocket);
        let buffer = "";
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            fn(value);
        };
        const timer = setTimeout(() => finish(rejectRequest, new Error(`control request ${payload.$cmd} timed out`)), 8000);
        socket.on("connect", () => socket.write(`${JSON.stringify({ reqId: 1, ...payload })}\n`));
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            clearTimeout(timer);
            try {
                finish(resolveRequest, JSON.parse(buffer.slice(0, newline)));
            } catch (error) {
                finish(rejectRequest, error);
            }
        });
        socket.on("error", (error) => {
            clearTimeout(timer);
            finish(rejectRequest, error);
        });
    });
}

function stop() {
    if (child.exitCode === null) child.kill("SIGTERM");
}

function fail(message) {
    console.error(`CHAT_LIST_CONFORMANCE FAIL ${message}`);
    process.exit(1);
}
