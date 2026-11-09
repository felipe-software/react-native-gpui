#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureWindow, conformanceEnv, listWindows, sleep } from "./conformance-utils.mjs";
import { colorDistance, parseColor, pixelAt } from "./pixel.mjs";
import { readPng } from "./png.mjs";

let child = null;
const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(tsRoot, "..");
const outDir = process.argv[2] || join(tmpdir(), "rngpui-multi-window-conformance");
const socketDir = `/tmp/rngpui-mw-${process.pid}`;
const controlSocket = join(socketDir, "control.sock");
const clipboardFile = join(outDir, "clipboard.txt");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
rmSync(socketDir, { recursive: true, force: true });
mkdirSync(socketDir, { recursive: true });
writeFileSync(clipboardFile, "");
const outJs = join(outDir, "app.js");

const bundle = spawnSync("bun", ["scripts/bundle-app.mjs", resolve(tsRoot, "examples/multi-window-conformance.tsx"), outJs], {
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
child = spawn(serviceBin, [], {
    cwd: tsRoot,
    env: conformanceEnv({
        RNGPUI_BUNDLE: outJs,
        RNGPUI_CONTROL_SOCKET: controlSocket,
        RNGPUI_FRAME_CAPTURE: "1",
        RNGPUI_FAKE_CLIPBOARD: clipboardFile,
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
    await waitFor(() => /MW_READY/.test(output), 15000, "MW_READY");
    await waitFor(async () => findNode(await dump(0), "main-count"), 8000, "main tree");
    const baseline = await dump(0);
    const baselineNodes = countNodes(baseline);
    check("only the main window at start", (await windows()).length === 1);
    await checkDialog();
    await checkChatWindow();
    await checkPopup();
    await checkUnmountClosesEverything(baselineNodes);
    await checkClipboardAndAppState();
    await checkKeysAndPointer();
} catch (error) {
    stop();
    fail(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n--- results ---\n${summary()}\n--- output ---\n${output.trim().slice(-4000)}`);
}
stop();

const broken = results.filter((result) => !result.ok);
if (broken.length > 0) fail(`${broken.length}/${results.length} checks failed\n${summary()}\n--- output ---\n${output.trim().slice(-3000)}`);
console.log(`MULTI_WINDOW_CONFORMANCE PASS ${results.length} checks\n${summary()}`);
process.exit(0);

async function checkDialog() {
    await tapNode(0, "open-dialog");
    const dialog = await waitForWindow("fixture-dialog");
    check("dialog opens as a second window", dialog.kind === "dialog" && dialog.title === "Fixture Dialog", JSON.stringify(dialog));
    check(
        "dialog content has the requested size",
        near(dialog.bounds.width, 360) && near(dialog.bounds.height, 220),
        `${dialog.bounds.width}x${dialog.bounds.height}`,
    );
    const tree = await dump(dialog.id);
    const box = findNode(tree, "dialog-box");
    check("dialog tree is the window's own tree", box && !findNode(tree, "main-count"), box ? JSON.stringify(box.bounds) : "no dialog-box");
    check("dialog layout", box && near(box.bounds.width, 120) && near(box.bounds.height, 40), box && JSON.stringify(box.bounds));
    const mainTree = await dump(0);
    check("main tree does not contain the dialog's nodes", !findNode(mainTree, "dialog-box"));

    const png = capture(dialog.id, "dialog");
    expectColor(png, "dialog paints its own pixels", center(box), "#2a8cff");

    const tap = await request({ $cmd: "realtap", ...center(findNode(tree, "dialog-increment")), window: dialog.id });
    check("a real click in the dialog reaches its handler", tap.ok && tap.handlerFired, JSON.stringify(tap));
    await waitFor(async () => textOf(await dump(0), "main-count") === "count: 1", 4000, "main count after dialog click");
    await waitFor(async () => textOf(await dump(dialog.id), "dialog-count") === "dialog count: 1", 4000, "dialog count");
    check("state is shared: the main window shows the dialog's change", textOf(await dump(0), "main-count") === "count: 1");

    await request({ $cmd: "tap", ...center(findNode(tree, "dialog-input")), window: dialog.id });
    const typed = await request({ $cmd: "type", text: "hi", window: dialog.id });
    check("typing into the dialog's input", typed.ok, JSON.stringify(typed));
    await waitFor(async () => textOf(await dump(0), "main-text") === "text: hi", 4000, "main text after typing");
    check("TextInput in a secondary window drives shared state", true);

    await request({ $cmd: "tap", ...center(findNode(tree, "dialog-note")), window: dialog.id });
    await settle();
    const before = await request({ $cmd: "frameStats" });
    const dialogBefore = (await windows()).find((window) => window.id === dialog.id);
    for (const key of ["a", "b", "c"]) await request({ $cmd: "type", text: key, window: dialog.id });
    await settle();
    const after = await request({ $cmd: "frameStats" });
    const dialogAfter = (await windows()).find((window) => window.id === dialog.id);
    check(
        "editing window-local state repaints that window only",
        after.framesPainted === before.framesPainted && dialogAfter.framesPainted > dialogBefore.framesPainted,
        `main ${before.framesPainted}->${after.framesPainted}, dialog ${dialogBefore.framesPainted}->${dialogAfter.framesPainted}`,
    );

    const since = output.length;
    const escape = await request({ $cmd: "realKey", key: "escape", window: dialog.id });
    check("Escape reaches the dialog", escape.ok, JSON.stringify(escape));
    await waitForEvent("dialogClose", since, (event) => event.reason === "escape");
    await waitFor(async () => (await windows()).length === 1, 4000, "dialog closed");
    check("Escape closes a dialog through onClose and unmount", true);
    check("the closed window leaves the registry", !registryRecord(dialog.id));
}

async function checkChatWindow() {
    await tapNode(0, "open-chat");
    const chat = await waitForWindow("fixture-chat");
    check("a normal window opens", chat.kind === "normal", JSON.stringify(chat));
    for (let index = 0; index < 4; index++) await tapNode(0, "append");
    await waitFor(async () => (await chatState())?.messages === 20, 4000, "20 chat messages");
    await waitFor(async () => listNodes(await dump(chat.id), "chatlist-message").length >= 6, 4000, "laid-out chat rows");
    const tree = await dump(chat.id);
    const rows = listNodes(tree, "chatlist-message");
    check("ChatList lays out in the second window", rows.length >= 6, `${rows.length} visible rows`);
    const user = listNodes(tree, "chatlist-user").at(-1);
    const png = capture(chat.id, "chat");
    const userColor = closestInRect(png, user.bounds, "#ff7f50");
    check("ChatList paints in the second window", userColor < 40, `closest ${userColor.toFixed(1)} to the user color`);
    check("ChatList follows the newest message", (await chatState()).lastMessageId === "m-19" && (await chatState()).following);

    await tapNode(0, "chat-top");
    await waitFor(async () => (await chatState())?.anchor?.messageId === "m-0", 3000, "scrollToTop");
    check("scrollToTop shows the oldest message and stops following", !(await chatState()).following);
    await tapNode(0, "chat-reveal");
    await waitFor(async () => (await chatState())?.anchor?.messageId === "m-3", 3000, "scrollToMessage");
    check("scrollToMessage(id, top) puts the message at the top", true);
    await tapNode(0, "chat-page-down");
    await waitFor(async () => messageIndex((await chatState())?.anchor?.messageId) > 3, 3000, "page down");
    const paged = messageIndex((await chatState()).anchor.messageId);
    check("pageDown scrolls one viewport down", paged >= 9, `anchor m-${paged}`);
    await tapNode(0, "chat-page-up");
    await waitFor(async () => messageIndex((await chatState())?.anchor?.messageId) < paged, 3000, "page up");
    check("pageUp scrolls back up", messageIndex((await chatState()).anchor.messageId) <= 3, (await chatState()).anchor.messageId);

    const scrolled = await dump(chat.id);
    const target = listNodes(scrolled, "chatlist-user")[1];
    const point = center(target);
    let since = output.length;
    await request({ $cmd: "realmove", ...point, window: chat.id });
    const hover = await waitForEvent("chatHover", since, (event) => event.target === "user");
    check(
        "onHover carries the pointer position",
        near(hover.pointerX, point.x) && near(hover.pointerY, point.y),
        `${hover.pointerX},${hover.pointerY} vs ${point.x},${point.y}`,
    );
    since = output.length;
    await request({ $cmd: "realtap", ...point, modifiers: ["control"], window: chat.id });
    const press = await waitForEvent("chatPress", since, () => true);
    check("onPress carries the modifier keys", press.ctrlKey === true && press.shiftKey === false, JSON.stringify(press));

    since = output.length;
    const hasTitleBar = chat.bounds.outerHeight - chat.bounds.height > 30;
    if (hasTitleBar) {
        const close = { x: chat.bounds.outerWidth - 12 - 17, y: 12 + 17 };
        const tap = await request({ $cmd: "realtap", ...close, window: chat.id });
        check("the title bar's close button takes a real click", tap.ok && tap.handlerFired, JSON.stringify(tap));
    } else {
        await request({ $cmd: "systemClose", window: chat.id });
    }
    await waitForEvent("chatClose", since, (event) => event.reason === "system");
    await waitFor(async () => (await windows()).length === 1, 4000, "chat window closed");
    check("the OS close button reaches onClose", true);
    const lists = await request({ $cmd: "chatListState" });
    check("closing the window drops its ChatList state", lists.ok && lists.lists.length === 0, JSON.stringify(lists.lists?.length));
}

async function checkPopup() {
    await request({ $cmd: "realmove", x: 300, y: 200 });
    await tapNode(0, "open-popup");
    const popup = await waitForWindow("fixture-popup");
    check(
        "a popup is frameless",
        popup.kind === "popup" && near(popup.bounds.outerWidth, 200) && near(popup.bounds.outerHeight, 120),
        JSON.stringify(popup.bounds),
    );
    const body = findNode(await dump(popup.id), "popup-body");
    const png = capture(popup.id, "popup");
    expectColor(png, "popup paints", center(body), "#e0a030");
    await request({ $cmd: "activate", active: true, window: popup.id });
    const since = output.length;
    await request({ $cmd: "activate", active: false, window: popup.id });
    await waitForEvent("popupClose", since, (event) => event.reason === "blur");
    await waitFor(async () => (await windows()).length === 1, 4000, "popup closed");
    check("a popup closes when it loses focus", true);
}

async function checkUnmountClosesEverything(baselineNodes) {
    await tapNode(0, "open-dialog");
    await tapNode(0, "open-chat");
    await waitFor(async () => (await windows()).length === 3, 4000, "two windows open");
    check("several windows can be open at once", (await windows()).length === 3);
    await tapNode(0, "close-all");
    await waitFor(async () => (await windows()).length === 1, 4000, "all secondary windows closed");
    check("unmounting a <Window> closes it", true);
    await settle();
    const records = listWindows().filter((window) => window.pid === child.pid);
    check("no window records are left behind", records.length === 1 && !records[0].secondary, JSON.stringify(records.map((r) => r.windowId ?? 0)));
    const main = await dump(0);
    check("the main tree has no leaked nodes", countNodes(main) === baselineNodes, `${countNodes(main)} vs ${baselineNodes}`);
    const mainEntry = (await windows())[0];
    check("the host keeps only the main window's nodes", mainEntry.nodes === baselineNodes, `${mainEntry.nodes} vs ${baselineNodes}`);
}

async function checkClipboardAndAppState() {
    writeFileSync(clipboardFile, "oauth:fixture-token");
    const since = output.length;
    await tapNode(0, "read-clipboard");
    const read = await waitForEvent("clipboard", since, () => true);
    check("NativeClipboard.read returns the clipboard text", read.value === "oauth:fixture-token", JSON.stringify(read));

    await request({ $cmd: "activate", active: true });
    await waitFor(async () => textOf(await dump(0), "main-app-state") === "app: active", 4000, "app active");
    await request({ $cmd: "activate", active: false });
    await waitFor(async () => textOf(await dump(0), "main-app-state") === "app: inactive", 4000, "app inactive");
    await request({ $cmd: "activate", active: true });
    await waitFor(async () => textOf(await dump(0), "main-app-state") === "app: active", 4000, "app active again");
    check("AppState follows window activation", true);
}

async function checkKeysAndPointer() {
    let since = output.length;
    await request({ $cmd: "realModifiers", modifiers: ["control"] });
    const down = await waitForEvent("keyPress", since, (event) => event.key === "Control");
    check("pressing Ctrl alone reaches onKeyPress", down.ctrlKey === true, JSON.stringify(down));
    since = output.length;
    await request({ $cmd: "realModifiers", modifiers: [] });
    const up = await waitForEvent("keyUp", since, (event) => event.key === "Control");
    check("releasing Ctrl reaches onKeyUp", up.ctrlKey === false, JSON.stringify(up));

    const main = await dump(0);
    const middle = center(findNode(main, "middle-target"));
    since = output.length;
    await request({ $cmd: "realtap", ...middle, button: "middle" });
    const aux = await waitForEvent("auxClick", since, () => true);
    check("a middle click reaches onAuxClick", aux.button === 1, JSON.stringify(aux));
    since = output.length;
    await request({ $cmd: "realtap", ...middle });
    await settle();
    check("a left click is not an aux click", !eventsSince("auxClick", since).length);

    const png = capture(0, "main");
    const probe = findNode(main, "transparent-probe");
    expectColor(png, "backgroundColor transparent shows what is behind it", center(probe), "#ff0000");
    expectColor(png, "borderColor transparent draws no border", { x: probe.bounds.x + 2, y: center(probe).y }, "#ff0000");
    const inked = closestInRect(png, probe.bounds, "#ffffff");
    check("color transparent draws no glyphs", inked > 200, `closest to white ${inked.toFixed(1)}`);

    for (const [row, expectPlus] of [
        ["drag-default", true],
        ["drag-opt-out", false],
    ]) {
        const header = findNode(main, row);
        const plus = findNode(main, `${row}-plus`);
        const start = { x: header.bounds.x + 20, y: center(header).y };
        since = output.length;
        await request({ $cmd: "realdrag", x: start.x, y: start.y, x2: center(plus).x, y2: center(plus).y, steps: 6 });
        await waitForEvent("headerUp", since, (event) => event.testID === row).catch(() => undefined);
        await waitForEvent("plusClick", since, (event) => event.testID === row, 1500).catch(() => undefined);
        const clicked = eventsSince("plusClick", since).some((event) => event.testID === row);
        check(
            expectPlus ? "press-drag scrubbing presses a child button by default" : "nativePressDrag={false} stops the scrub",
            clicked === expectPlus,
            `plusClick=${clicked}`,
        );
    }
}

function summary() {
    return results.map((result) => `  ${result.ok ? "ok  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`).join("\n");
}

async function windows() {
    const listing = await request({ $cmd: "windows" });
    if (!listing.ok) throw new Error(`windows failed: ${JSON.stringify(listing)}`);
    return listing.windows;
}

async function waitForWindow(testID) {
    let found;
    await waitFor(
        async () => {
            found = (await windows()).find((window) => window.testID === testID && window.bounds && window.framesPainted > 0);
            return found;
        },
        6000,
        `window ${testID}`,
    );
    await waitFor(async () => countNodes(await dump(found.id)) > 2, 4000, `${testID} tree`);
    return found;
}

async function dump(window) {
    const response = await request({ $cmd: "dump", window });
    if (!response.ok || !response.tree) throw new Error(`dump of window ${window} failed: ${JSON.stringify(response)}`);
    return response.tree;
}

async function chatState() {
    const response = await request({ $cmd: "chatListState" });
    return response.lists?.[0];
}

async function tapNode(window, testID) {
    const node = findNode(await dump(window), testID);
    if (!node) throw new Error(`no ${testID} in window ${window}`);
    const tap = await request({ $cmd: "realtap", ...center(node), window });
    if (!tap.ok) throw new Error(`realtap ${testID}: ${JSON.stringify(tap)}`);
    await settle();
}

function registryRecord(windowId) {
    return listWindows().find((window) => window.pid === child.pid && window.windowId === windowId);
}

function capture(windowId, label) {
    const record =
        windowId === 0
            ? listWindows().find((window) => window.pid === child.pid && !window.secondary)
            : registryRecord(windowId);
    if (!record) throw new Error(`window ${windowId} is not registered for capture`);
    const path = join(outDir, `${label}.png`);
    captureWindow(record, path);
    const png = readPng(path);
    png.scale = png.width / record.width;
    return png;
}

function findNode(node, testID) {
    if (!node) return null;
    if (node.accessibility?.testID === testID) return node;
    for (const childNode of node.children ?? []) {
        const found = findNode(childNode, testID);
        if (found) return found;
    }
    return null;
}

function listNodes(node, type, out = []) {
    if (node.type === type) out.push(node);
    for (const childNode of node.children ?? []) listNodes(childNode, type, out);
    return out;
}

function countNodes(node) {
    let count = 0;
    const walk = (current) => {
        if (current.type?.startsWith("chatlist-")) return;
        count++;
        for (const childNode of current.children ?? []) walk(childNode);
    };
    walk(node);
    return count;
}

function textOf(tree, testID) {
    const node = findNode(tree, testID);
    if (!node) return undefined;
    if (typeof node.text === "string") return node.text;
    const texts = [];
    const walk = (current) => {
        if (typeof current.text === "string") texts.push(current.text);
        for (const childNode of current.children ?? []) walk(childNode);
    };
    walk(node);
    return texts.join("");
}

function messageIndex(id) {
    return id ? Number(String(id).replace("m-", "")) : -1;
}

function center(node) {
    return { x: node.bounds.x + node.bounds.width / 2, y: node.bounds.y + node.bounds.height / 2 };
}

function near(a, b, tolerance = 1.5) {
    return Math.abs(a - b) <= tolerance;
}

function sample(png, point) {
    return pixelAt(png, Math.round(point.x * png.scale), Math.round(point.y * png.scale));
}

function expectColor(png, name, point, expected, tolerance = 24) {
    const actual = sample(png, point);
    const distance = colorDistance(actual, parseColor(expected));
    check(name, distance <= tolerance, `${actual.hex ?? JSON.stringify(actual)} vs ${expected} (distance ${distance.toFixed(1)})`);
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

function eventsSince(kind, since) {
    const events = [];
    for (const match of output.slice(since).matchAll(/MW_EVENT (.+)/g)) {
        const event = JSON.parse(match[1]);
        if (event.kind === kind) events.push(event);
    }
    return events;
}

async function waitForEvent(kind, since, predicate, timeoutMs = 4000) {
    let found;
    await waitFor(
        () => {
            found = eventsSince(kind, since).find(predicate);
            return found !== undefined;
        },
        timeoutMs,
        `${kind} event`,
    );
    return found;
}

async function settle() {
    await sleep(250);
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
    return new Promise((resolvePromise, reject) => {
        const socket = net.createConnection(controlSocket);
        let buffer = "";
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error(`debug request timed out: ${JSON.stringify(payload)}`));
        }, 10000);
        socket.on("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            const index = buffer.indexOf("\n");
            if (index >= 0) {
                clearTimeout(timer);
                socket.end();
                resolvePromise(JSON.parse(buffer.slice(0, index)));
            }
        });
        socket.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function stop() {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(socketDir, { recursive: true, force: true });
}

function fail(message) {
    console.error(`MULTI_WINDOW_CONFORMANCE FAIL\n${message}`);
    if (child && child.exitCode === null) child.kill("SIGTERM");
    process.exit(1);
}
