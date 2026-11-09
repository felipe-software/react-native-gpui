// Launch / attach plumbing for the `rngpui` developer CLI.
//
// The only launch model is the JavaScriptCore one-process host:
//   entry.tsx -> bundle-app.mjs -> app.js -> rngpui-service
//
// Bun is used as a compiler only. The app runtime is always the Rust service with
// embedded JavaScriptCore, and debug commands go over RNGPUI_CONTROL_SOCKET.

import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import {
    copyFileSync,
    existsSync,
    mkdtempSync,
    mkdirSync,
    openSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { captureWindow, listWindows, sleep, waitForServicePid, waitForWindow } from "../scripts/conformance-utils.mjs";
import { packageRoot, resolveServiceBinary, uiRuntimeEnv } from "../scripts/service-binary.mjs";
import { bundleApp } from "./bundle";

export const tsRoot = packageRoot;

export interface GpuiWindow {
    id: number;
    window_id: number;
    pid: number;
    owner: string;
    title: string;
    layer: number;
    x: number;
    y: number;
    width: number;
    height: number;
    bounds: { x: number; y: number; width: number; height: number };
    rngpui?: boolean;
}

export interface LaunchedHost {
    mode: "launch";
    pid: number;
    servicePid: number;
    window: GpuiWindow;
    sessionDir: string;
    appName: string;
    controlSocketPath: string;
    request<T = unknown>(cmd: object): Promise<T>;
    dump(): Promise<DumpNode>;
    capture(path: string): void;
    close(): void;
}

export interface AttachedHost {
    mode: "attach";
    servicePid: number;
    window: GpuiWindow;
    appName?: string;
    controlSocketPath?: string;
    dumpTreePath?: string;
    request?<T = unknown>(cmd: object): Promise<T>;
    capture(path: string): void;
    dump(): Promise<DumpNode | null>;
    close(): void;
}

export type Host = LaunchedHost | AttachedHost;

export type DriveableHost = Host & {
    request<T = unknown>(cmd: object): Promise<T>;
    dump(): Promise<DumpNode>;
};

export function isDriveableHost(host: Host): host is DriveableHost {
    return typeof (host as { request?: unknown }).request === "function";
}

export type DumpNode = {
    globalId: number;
    type: string;
    text?: string;
    value?: string;
    src?: string;
    events?: string[];
    accessibility?: {
        identifier?: string;
        testID?: string;
        nativeID?: string;
        label?: string;
        role?: string;
    };
    bounds?: { x: number; y: number; width: number; height: number };
    style?: Record<string, unknown>;
    children?: DumpNode[];
    nativeListGroup?: string;
};

function countWebviews(node: DumpNode): number {
    let n = node.type === "webview" ? 1 : 0;
    for (const child of node.children ?? []) n += countWebviews(child);
    return n;
}

function firstWebviewBounds(node: DumpNode): { x: number; y: number; width: number; height: number } | null {
    if (node.type === "webview" && node.bounds && node.bounds.width > 4 && node.bounds.height > 4) return node.bounds;
    for (const child of node.children ?? []) {
        const found = firstWebviewBounds(child);
        if (found) return found;
    }
    return null;
}

// Poll the live capture frame until the webview region has painted content
// (pixel variance above a flat-background floor). A WKWebView underlay loads +
// renders its HTML asynchronously after the gpui tree commits — and under load
// that can exceed any fixed sleep — so wait for the pixels, not the clock. A
// genuinely-empty webview just hits the budget and proceeds (best-effort).
async function waitForWebviewContent(
    capturePath: string,
    captureTriggerPath: string,
    bounds: { x: number; y: number; width: number; height: number },
    windowLogicalWidth: number,
): Promise<void> {
    const { readPng } = await import("../scripts/png.mjs");
    const budgetMs = Number(process.env.RNGPUI_SHOT_WEBVIEW_BUDGET_MS) || 4000;
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
        try {
            if (existsSync(capturePath) && statSync(capturePath).size > 0) {
                const img = (await readPng(capturePath)) as { width: number; height: number; rgba: Uint8Array };
                const scale = img.width / windowLogicalWidth; // capture is HiDPI (≈2x)
                const x0 = Math.max(0, Math.round((bounds.x + bounds.width * 0.15) * scale));
                const x1 = Math.min(img.width, Math.round((bounds.x + bounds.width * 0.85) * scale));
                const y0 = Math.max(0, Math.round((bounds.y + bounds.height * 0.1) * scale));
                const y1 = Math.min(img.height, Math.round((bounds.y + bounds.height * 0.7) * scale));
                // luminance variance over the region: flat (loading) ≈ 0, text content ≫ 0.
                let sum = 0;
                let sumSq = 0;
                let count = 0;
                for (let y = y0; y < y1; y += 4) {
                    for (let x = x0; x < x1; x += 4) {
                        const i = (y * img.width + x) * 4;
                        const lum = 0.299 * img.rgba[i] + 0.587 * img.rgba[i + 1] + 0.114 * img.rgba[i + 2];
                        sum += lum;
                        sumSq += lum * lum;
                        count++;
                    }
                }
                if (count > 0) {
                    const variance = sumSq / count - (sum / count) ** 2;
                    if (variance > 25) return; // content present (text/edges)
                }
            }
        } catch {
            /* transient read of a half-written frame — retry */
        }
        requestCapture(capturePath, captureTriggerPath);
        await sleep(150);
    }
}

type SessionMeta = {
    version: 1;
    servicePid: number;
    socketPath: string;
    capturePath: string;
    captureTriggerPath?: string;
    bundlePath: string;
    appName: string;
    size: string;
};

type OwnerMeta = {
    owner?: string;
    ownerLabel?: string;
    appName?: string;
    pidPath?: string;
    controlSocketPath?: string;
    dumpTreePath?: string;
};

type LaunchOptions = {
    size?: string;
    bundle?: string;
    keep?: boolean;
    development?: boolean;
    appearance?: string;
    fixture?: boolean;
};

function bundleEntry(entry: string, workdir: string, development: boolean) {
    return bundleApp(entry, join(workdir, "app.js"), { development });
}

function writeSession(dir: string, meta: SessionMeta) {
    writeFileSync(join(dir, "session.json"), JSON.stringify(meta, null, 2));
}

function readSession(dir: string): SessionMeta {
    const path = join(resolve(dir), "session.json");
    if (!existsSync(path)) throw new Error(`session metadata not found: ${path}`);
    return JSON.parse(readFileSync(path, "utf8")) as SessionMeta;
}

function assertAlive(pid: number) {
    try {
        process.kill(pid, 0);
    } catch {
        throw new Error(`rngpui service pid ${pid} is not running`);
    }
}

export async function launchHost(entry: string, opts: LaunchOptions = {}): Promise<LaunchedHost> {
    const workdir = mkdtempSync(join(tmpdir(), "rngpui-cli-"));
    const stamp = `${process.pid}-${Date.now().toString(36)}`;
    const appName = `rngpui-cli-${stamp}`;
    const pidPath = join(workdir, "service.pid");
    const socketPath = join(workdir, "control.sock");
    const capturePath = join(workdir, "frame.png");
    const captureTriggerPath = join(workdir, "capture.request");
    const logPath = join(workdir, "service.log");
    const size = opts.size ?? "1280x860";
    const [w, h] = size.split("x").map((value) => parseInt(value, 10));
    const bundlePath = opts.bundle ? resolve(opts.bundle) : bundleEntry(entry, workdir, opts.development === true);
    if (!existsSync(bundlePath)) throw new Error(`bundle not found: ${bundlePath}`);

    const service = resolveServiceBinary().path;
    const child = spawn(service, [], {
        cwd: tsRoot,
        env: {
            ...process.env,
            ...uiRuntimeEnv(service),
            RNGPUI_BUNDLE: bundlePath,
            RNGPUI_NO_ACTIVATE: "1",
            RNGPUI_TEST_MODE: "1",
            // test-mode services exit when their spawning parent dies (the orphan
            // watchdog in service.rs). A --keep launch is the one flow whose
            // CONTRACT is to outlive this cli process (do/get --session ... then
            // `rngpui close`), so it opts out explicitly.
            ...(opts.keep === true ? { RNGPUI_KEEP_ALIVE: "1" } : {}),
            RNGPUI_CAPTURE_ONSCREEN: "1",
            RNGPUI_OPAQUE_WINDOW: "1",
            RNGPUI_CAPTURE_ALPHA: process.env.RNGPUI_CAPTURE_ALPHA || "0.2",
            RNGPUI_WINDOW_SIZE: `${w},${h}`,
            RNGPUI_CAPTURE_PNG: capturePath,
            RNGPUI_CAPTURE_TRIGGER: captureTriggerPath,
            RNGPUI_SERVICE_PID_FILE: pidPath,
            RNGPUI_CONTROL_SOCKET: socketPath,
            RNGPUI_APP_NAME: appName,
            ...(opts.appearance ? { RNGPUI_FORCE_APPEARANCE: opts.appearance } : {}),
            ...(opts.appearance ? { TM_CAPTURE_APPEARANCE: opts.appearance } : {}),
            ...(opts.fixture === true ? { TM_FIXTURE_ONLY: "1" } : {}),
        },
        // stderr goes to a session log file, never a pipe back to this process: the
        // service outlives the cli (dev/--keep), and an eprintln! into a closed pipe
        // panics (EPIPE) and aborts the whole service mid-demo.
        stdio: ["ignore", "ignore", openSync(logPath, "a")],
    });
    const logTail = () => {
        try {
            return readFileSync(logPath, "utf8").split("\n").slice(-30).join("\n");
        } catch {
            return "(no service log)";
        }
    };

    const fail = (message: string): never => {
        killPidFile(pidPath);
        try {
            child.kill("SIGTERM");
        } catch {
            /* already gone */
        }
        // deliberately NOT rmSync(workdir) here. This is the ERROR path, and the
        // service log inside the workdir is the only evidence of why it failed —
        // but rmSync ran before the template below evaluated logTail(), so every
        // failure printed "(no service log)" and deleted the one thing worth
        // reading. Two agents lost real time to a window bug that way. A leaked
        // temp dir is cheap; the log is not, so keep it and say where it is.
        throw new Error(`${message}\n--- service log (${logPath}) ---\n${logTail()}`);
    };

    let servicePid = 0;
    try {
        servicePid = await waitForServicePid(pidPath, {
            timeoutMs: 20_000,
            isFixtureExited: () => child.exitCode != null,
        });
    } catch (error) {
        fail(`service did not start: ${(error as Error).message}`);
    }

    let window: GpuiWindow;
    try {
        window = (await waitForWindow((win: GpuiWindow) => win.pid === servicePid, {
            timeoutMs: 15_000,
            isFixtureExited: () => child.exitCode != null,
            // the service writing anything is progress, so a starved launch keeps
            // its budget instead of dying at a fixed 15s that only suited an idle box.
            progress: () => {
                try {
                    return statSync(logPath).size;
                } catch {
                    return -1;
                }
            },
        })) as GpuiWindow;
    } catch (error) {
        const finalWindow = currentWindow(servicePid);
        if (finalWindow) {
            window = finalWindow;
        } else {
            const seen = (listWindows() as GpuiWindow[])
                .map((win) => `${win.owner}/"${win.title}"/pid${win.pid}/${win.width}x${win.height}`)
                .join("  ");
            fail(`window did not appear: ${(error as Error).message} [wanted pid ${servicePid}; saw: ${seen}]`);
        }
    }

    await waitForSocket(socketPath, () => child.exitCode != null);
    // settle before the first capture. 500ms covers a pure-Metal tree, but a
    // WKWebView underlay (the team-machine chat/timeline stage) loads + renders its
    // HTML async AFTER the gpui tree commits — and under machine load that can
    // take well over a second, so a fixed sleep races it (the blank-webview bug).
    // Instead: find the webview's bounds, then poll the live capture frame until
    // that region actually has painted content (variance above the background
    // floor), with a budget. A genuinely-empty webview just hits the budget.
    if (!opts.development) {
        await sleep(Number(process.env.RNGPUI_SHOT_SETTLE_MS) || 350);
        try {
            const probe = await requestSocket<{ ok: boolean; tree?: DumpNode }>(socketPath, { $cmd: "dump" });
            const wv = probe.tree ? firstWebviewBounds(probe.tree) : null;
            if (wv) {
                requestCapture(capturePath, captureTriggerPath);
                await waitForWebviewContent(capturePath, captureTriggerPath, wv, w);
            }
        } catch {
            /* probe is best-effort; proceed to capture */
        }
    }

    const meta: SessionMeta = {
        version: 1,
        servicePid,
        socketPath,
        capturePath,
        captureTriggerPath,
        bundlePath,
        appName,
        size,
    };
    writeSession(workdir, meta);
    return makeLaunchedHost({
        child,
        meta,
        sessionDir: workdir,
        window,
        ownsProcess: true,
        keepOnClose: opts.keep === true,
    });
}

export async function attachSession(sessionDir: string): Promise<LaunchedHost> {
    const meta = readSession(sessionDir);
    assertAlive(meta.servicePid);
    await waitForSocket(meta.socketPath);
    const window = (currentWindow(meta.servicePid) ??
        ((await waitForWindow((win: GpuiWindow) => win.pid === meta.servicePid, {
            timeoutMs: 5_000,
        })) as GpuiWindow)) as GpuiWindow;
    return makeLaunchedHost({
        child: null,
        meta,
        sessionDir: resolve(sessionDir),
        window,
        ownsProcess: false,
        keepOnClose: true,
    });
}

export function closeSession(sessionDir: string) {
    const dir = resolve(sessionDir);
    const meta = readSession(dir);
    killPid(meta.servicePid);
    rmSync(dir, { recursive: true, force: true });
}

function makeLaunchedHost({
    child,
    meta,
    sessionDir,
    window,
    ownsProcess,
    keepOnClose,
}: {
    child: ChildProcess | null;
    meta: SessionMeta;
    sessionDir: string;
    window: GpuiWindow;
    ownsProcess: boolean;
    keepOnClose: boolean;
}): LaunchedHost {
    return {
        mode: "launch",
        pid: child?.pid ?? meta.servicePid,
        servicePid: meta.servicePid,
        window,
        sessionDir,
        appName: meta.appName,
        controlSocketPath: meta.socketPath,
        request<T = unknown>(cmd: object) {
            return requestSocket<T>(meta.socketPath, cmd);
        },
        async dump() {
            const response = await requestSocket<{ ok: boolean; tree?: DumpNode; error?: string }>(meta.socketPath, { $cmd: "dump" });
            if (!response.ok || !response.tree) throw new Error(response.error || "dump failed");
            return response.tree;
        },
        capture(path: string) {
            if (meta.captureTriggerPath) {
                requestCapture(meta.capturePath, meta.captureTriggerPath);
            }
            waitForCapture(meta.capturePath, path);
        },
        close() {
            if (keepOnClose) return;
            if (ownsProcess) killPid(meta.servicePid);
            try {
                child?.kill("SIGTERM");
            } catch {
                /* already gone */
            }
            rmSync(sessionDir, { recursive: true, force: true });
        },
    };
}

export async function attachHost(): Promise<AttachedHost> {
    const candidates = (listWindows() as GpuiWindow[])
        .filter((window) => window.title === "react-native-gpui" || window.rngpui === true)
        .filter((window) => !(window as { secondary?: boolean }).secondary)
        .map((window) => ({ window, meta: ownerMetaForWindow(window) }))
        .sort((a, b) => {
            const ad = isMetaDriveable(a.meta) ? 0 : 1;
            const bd = isMetaDriveable(b.meta) ? 0 : 1;
            if (ad !== bd) return ad - bd;
            return b.window.width * b.window.height - a.window.width * a.window.height;
        });
    if (candidates.length === 0) {
        throw new Error("no running rngpui window found; launch one with --launch <entry.tsx> or --bundle <app.js>");
    }
    const { window, meta } = candidates[0];
    const controlSocketPath = isMetaDriveable(meta) ? meta.controlSocketPath : undefined;
    const request = controlSocketPath ? <T = unknown>(cmd: object) => requestSocket<T>(controlSocketPath, cmd) : undefined;
    const attached: AttachedHost = {
        mode: "attach",
        servicePid: window.pid,
        window,
        appName: meta?.appName ?? window.owner,
        controlSocketPath,
        dumpTreePath: meta?.dumpTreePath,
        capture(path: string) {
            const fresh = currentWindow(window.pid) ?? window;
            captureWindow(fresh, path);
        },
        async dump() {
            if (request) {
                const response = await request<{ ok: boolean; tree?: DumpNode; error?: string }>({ $cmd: "dump" });
                if (!response.ok || !response.tree) throw new Error(response.error || "dump failed");
                return response.tree;
            }
            return null;
        },
        close() {
            /* read-only: never touch a process we do not own */
        },
    };
    if (request) attached.request = request;
    return attached;
}

export function currentWindow(servicePid: number): GpuiWindow | null {
    return (
        (listWindows() as GpuiWindow[])
            .filter((window) => window.pid === servicePid && !(window as { secondary?: boolean }).secondary)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
    );
}

export type ServiceWindow = {
    id: number;
    kind: "main" | "normal" | "dialog" | "popup";
    title: string | null;
    testID: string | null;
    nodes: number;
    framesPainted: number;
    focusedInput: number | null;
    bounds: { x: number; y: number; outerWidth: number; outerHeight: number; width: number; height: number; active: boolean } | null;
};

export async function listServiceWindows(host: Host): Promise<ServiceWindow[]> {
    if (!isDriveableHost(host)) throw new Error("listing windows needs a driveable target (control socket)");
    const listing = await host.request<{ ok: boolean; windows?: ServiceWindow[]; error?: string }>({ $cmd: "windows" });
    if (!listing.ok || !listing.windows) throw new Error(listing.error || "windows listing failed");
    return listing.windows;
}

export function matchServiceWindow(windows: ServiceWindow[], selector: string): ServiceWindow | null {
    const wanted = selector.trim();
    if (wanted === "main") return windows.find((window) => window.id === 0) ?? null;
    if (/^\d+$/.test(wanted)) return windows.find((window) => window.id === Number(wanted)) ?? null;
    const lower = wanted.toLowerCase();
    return (
        windows.find((window) => window.testID === wanted) ??
        windows.find((window) => window.kind === lower && window.id !== 0) ??
        windows.find((window) => (window.title ?? "").toLowerCase().includes(lower)) ??
        null
    );
}

const GLOBAL_COMMANDS = new Set(["windows", "frameStats", "rendererProvenance", "traceStart", "traceStop", "evalJs", "hotEval"]);

export async function scopeToWindow<T extends Host>(host: T, selector: string): Promise<T> {
    const windows = await listServiceWindows(host);
    const target = matchServiceWindow(windows, selector);
    if (!target) {
        const known = windows.map((window) => `${window.id}:${window.kind}${window.testID ? `:${window.testID}` : ""}`).join(" ");
        throw new Error(`no window matches "${selector}" (windows: ${known})`);
    }
    if (target.id === 0) return host;
    const request = host.request!.bind(host);
    const scopedRequest = <R = unknown>(cmd: object) => {
        const name = (cmd as { $cmd?: string }).$cmd ?? "";
        return request<R>(GLOBAL_COMMANDS.has(name) ? cmd : { ...cmd, window: target.id });
    };
    const bounds = target.bounds;
    const window: GpuiWindow = {
        ...host.window,
        title: target.title ?? host.window.title,
        x: bounds?.x ?? 0,
        y: bounds?.y ?? 0,
        width: bounds?.outerWidth ?? host.window.width,
        height: bounds?.outerHeight ?? host.window.height,
        bounds: { x: bounds?.x ?? 0, y: bounds?.y ?? 0, width: bounds?.outerWidth ?? 0, height: bounds?.outerHeight ?? 0 },
    };
    const scoped = {
        ...host,
        window,
        request: scopedRequest,
        async dump() {
            const response = await scopedRequest<{ ok: boolean; tree?: DumpNode; error?: string }>({ $cmd: "dump" });
            if (!response.ok || !response.tree) throw new Error(response.error || "dump failed");
            return response.tree;
        },
        capture(path: string) {
            captureServiceWindow(host, target.id, path);
        },
        close: () => host.close(),
    };
    return scoped as T;
}

function captureServiceWindow(host: Host, windowId: number, path: string) {
    if (host.mode === "launch") {
        const meta = readSession(host.sessionDir);
        if (!meta.captureTriggerPath) throw new Error("this session has no capture trigger");
        rmSync(meta.capturePath, { force: true });
        writeFileSync(meta.captureTriggerPath, `capture window=${windowId}\n`);
        waitForCapture(meta.capturePath, path);
        return;
    }
    const record = (listWindows() as Array<GpuiWindow & { windowId?: number }>).find(
        (window) => window.pid === host.servicePid && window.windowId === windowId,
    );
    if (!record) throw new Error(`window ${windowId} of pid ${host.servicePid} is not in the window registry`);
    captureWindow(record, path);
}

function requestSocket<T>(socketPath: string, cmd: object): Promise<T> {
    return new Promise((resolve, reject) => {
        const socket = createConnection(socketPath);
        let buffer = "";
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error(`debug command timed out on ${socketPath}`));
        }, 10_000);
        socket.on("connect", () => {
            socket.write(JSON.stringify(cmd) + "\n");
        });
        socket.on("data", (chunk) => {
            buffer += chunk.toString("utf8");
            const idx = buffer.indexOf("\n");
            if (idx >= 0) {
                clearTimeout(timer);
                socket.end();
                try {
                    resolve(JSON.parse(buffer.slice(0, idx)) as T);
                } catch (error) {
                    reject(error);
                }
            }
        });
        socket.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        socket.on("end", () => {
            if (!buffer.trim()) {
                clearTimeout(timer);
                reject(new Error("debug socket closed without a response"));
            }
        });
    });
}

function isMetaDriveable(meta: OwnerMeta | null): meta is OwnerMeta & { controlSocketPath: string } {
    return !!meta?.controlSocketPath && existsSync(meta.controlSocketPath);
}

function ownerMetaForWindow(window: GpuiWindow): OwnerMeta | null {
    const paths = new Set<string>([`/tmp/${window.owner}.owner.json`]);
    try {
        for (const entry of readdirSync("/tmp")) {
            if (entry.endsWith(".owner.json")) paths.add(join("/tmp", entry));
        }
    } catch {
        /* /tmp should exist, but attach can still work read-only without metadata */
    }

    for (const path of paths) {
        const meta = readOwnerMeta(path);
        if (!meta) continue;
        if (meta.appName === window.owner) return meta;
        if (meta.pidPath && pidPathMatches(meta.pidPath, window.pid)) return meta;
    }
    return null;
}

function readOwnerMeta(path: string): OwnerMeta | null {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as OwnerMeta;
    } catch {
        return null;
    }
}

function pidPathMatches(path: string, pid: number): boolean {
    try {
        return Number(readFileSync(path, "utf8").trim()) === pid;
    } catch {
        return false;
    }
}

async function waitForSocket(path: string, exited?: () => boolean) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
        if (existsSync(path)) return;
        if (exited?.()) break;
        await sleep(25);
    }
    throw new Error(`timed out waiting for control socket at ${path}`);
}

function waitForCapture(source: string, target: string) {
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
        if (existsSync(source) && statSync(source).size > 0) {
            execSyncSleep(300);
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(source, target);
            return;
        }
        execSyncSleep(120);
    }
    throw new Error("in-service capture produced no frame (RNGPUI_CAPTURE_PNG)");
}

function requestCapture(capturePath: string, triggerPath: string) {
    rmSync(capturePath, { force: true });
    writeFileSync(triggerPath, "capture\n");
}

function execSyncSleep(ms: number) {
    try {
        execFileSync("sleep", [String(ms / 1000)]);
    } catch {
        /* ignore */
    }
}

function killPidFile(path: string) {
    try {
        const pid = Number(readFileSync(path, "utf8").trim());
        if (Number.isFinite(pid) && pid > 0) killPid(pid);
    } catch {
        /* no pid yet */
    }
}

function killPid(pid: number) {
    try {
        process.kill(pid, "SIGTERM");
    } catch {
        /* already gone */
    }
}
