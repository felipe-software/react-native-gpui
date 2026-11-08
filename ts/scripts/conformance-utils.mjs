import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";

export const cuaDriver =
    process.env.CUA_DRIVER ||
    (existsSync(join(homedir(), ".local/bin/cua-driver")) ? join(homedir(), ".local/bin/cua-driver") : "cua-driver");

export function conformanceEnv(extra = {}) {
    return {
        ...process.env,
        RNGPUI_NO_ACTIVATE: "1",
        RNGPUI_TEST_MODE: "1",
        ...extra,
    };
}

export async function waitForServicePid(pidPath, { timeoutMs = 5000, isFixtureExited } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last = "";
    while (Date.now() < deadline) {
        if (existsSync(pidPath)) {
            const pid = Number(readFileSync(pidPath, "utf8").trim());
            if (Number.isFinite(pid) && pid > 0) {
                try {
                    process.kill(pid, 0);
                    return pid;
                } catch (error) {
                    last = error instanceof Error ? error.message : String(error);
                }
            }
        }
        if (isFixtureExited?.()) break;
        await sleep(25);
    }
    throw new Error(`timed out waiting for service pid at ${pidPath}${last ? `: ${last}` : ""}`);
}

// The budget bounds SILENCE, not wall time. `progress` returns a token (the
// service log's size) and any change resets the clock, so a fixture merely
// starved by concurrent work keeps its time while a wedged one still dies
// promptly. An absolute deadline here is really a claim about how fast the
// machine is, and it is wrong on a busy one.
//
// A fixture that has EXITED is reported as such rather than as a missing window.
// The old code broke the loop on isFixtureExited and then threw the generic
// "GPUI window was not found", so a self-terminating example (one that runs its
// assertions and quits, like box-model-conformance) was indistinguishable from a
// renderer that could not open a window — and it got read as the latter.
export async function waitForWindow(match, { timeoutMs = 5000, isFixtureExited, progress } = {}) {
    let deadline = Date.now() + timeoutMs;
    let token = progress?.();
    while (Date.now() < deadline) {
        const window = listWindows().find(match);
        if (window) return window;
        if (isFixtureExited?.()) {
            throw new Error("the fixture exited before opening a window");
        }
        await sleep(50);
        const next = progress?.();
        if (next !== token) {
            token = next;
            deadline = Date.now() + timeoutMs;
        }
    }
    throw new Error(`GPUI window was not found (no progress for ${timeoutMs}ms)`);
}

export function linuxWindowRegistryDir() {
    return join(process.env.XDG_RUNTIME_DIR || tmpdir(), "rngpui-windows");
}

function listLinuxWindows() {
    const dir = linuxWindowRegistryDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => {
            try {
                return JSON.parse(readFileSync(join(dir, entry), "utf8"));
            } catch {
                return null;
            }
        })
        .filter((window) => window && isLiveService(window.pid))
        .map((window) => ({
            ...window,
            bounds: { x: window.x, y: window.y, width: window.width, height: window.height },
        }));
}

function isLiveService(pid) {
    try {
        return readFileSync(`/proc/${pid}/comm`, "utf8").trim() === "rngpui-service";
    } catch {
        return false;
    }
}

export function listWindows() {
    if (process.platform === "linux") return listLinuxWindows();
    const swift = `
import Foundation
import CoreGraphics
let list = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
for window in list {
    let owner = window[kCGWindowOwnerName as String] as? String ?? ""
    let title = window[kCGWindowName as String] as? String ?? ""
    let id = (window[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
    let pid = (window[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0
    let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let x = (bounds["X"] as? NSNumber)?.doubleValue ?? 0
    let y = (bounds["Y"] as? NSNumber)?.doubleValue ?? 0
    let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
    let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
    let alpha = (window[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? -1
    print("\\(id)\\t\\(pid)\\t\\(owner)\\t\\(title)\\t\\(layer)\\t\\(x)\\t\\(y)\\t\\(width)\\t\\(height)\\t\\(alpha)")
}
`;
    const raw = execFileSync("swift", ["-e", swift], { encoding: "utf8", stdio: "pipe" });
    return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [id, pid, owner, title, layer, x, y, width, height, alpha] = line.split("\t");
            return {
                id: Number(id),
                window_id: Number(id),
                pid: Number(pid),
                owner,
                app_name: owner,
                title,
                layer: Number(layer),
                x: Number(x),
                y: Number(y),
                width: Number(width),
                height: Number(height),
                alpha: Number(alpha),
                bounds: {
                    x: Number(x),
                    y: Number(y),
                    width: Number(width),
                    height: Number(height),
                },
            };
        })
        .filter(
            (window) =>
                Number.isFinite(window.id) &&
                window.id > 0 &&
                Number.isFinite(window.pid) &&
                window.pid > 0 &&
                Number.isFinite(window.width) &&
                window.width > 0 &&
                Number.isFinite(window.height) &&
                window.height > 0,
        );
}

export function captureWindow(window, path) {
    if (process.platform === "linux") {
        captureLinuxWindow(window, path);
        return;
    }
    execFileSync(
        cuaDriver,
        [
            "call",
            "get_window_state",
            JSON.stringify({
                pid: window.pid,
                window_id: window.id ?? window.window_id,
                capture_mode: "vision",
                screenshot_out_file: path,
            }),
        ],
        { stdio: "pipe" },
    );
    if (!existsSync(path)) throw new Error(`screenshot was not written at ${path}`);
}

function captureLinuxWindow(window, path) {
    if (!window.capture) {
        throw new Error(
            `rngpui-service pid ${window.pid} cannot capture frames; start it with RNGPUI_FRAME_CAPTURE=1 (test and CLI launches enable it)`,
        );
    }
    const target = resolve(path);
    rmSync(target, { force: true });
    const request = join(linuxWindowRegistryDir(), `${window.pid}.capture`);
    writeFileSync(`${request}.staging`, target);
    renameSync(`${request}.staging`, request);
    const deadline = Date.now() + 10_000;
    while (!existsSync(target)) {
        if (Date.now() > deadline) throw new Error(`rngpui-service pid ${window.pid} did not write a frame to ${target}`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
}

export function frontmostApp() {
    return frontmostProcess().name;
}

export function frontmostProcess() {
    if (process.platform !== "darwin") return { pid: 0, name: "" };
    const raw = execFileSync(
        "swift",
        [
            "-e",
            `
import AppKit
let app = NSWorkspace.shared.frontmostApplication
print("\\(app?.processIdentifier ?? 0)\\t\\(app?.localizedName ?? "")")
`,
        ],
        {
            encoding: "utf8",
            stdio: "pipe",
        },
    ).trim();
    const [pid, ...nameParts] = raw.split("\t");
    return { pid: Number(pid), name: nameParts.join("\t") };
}

export function screenFrames() {
    if (process.platform !== "darwin") return [];
    const swift = `
import AppKit
for screen in NSScreen.screens {
    let frame = screen.frame
    print("\\(frame.origin.x)\\t\\(frame.origin.y)\\t\\(frame.size.width)\\t\\(frame.size.height)")
}
`;
    return execFileSync("swift", ["-e", swift], { encoding: "utf8", stdio: "pipe" })
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [x, y, width, height] = line.split("\t").map(Number);
            return { x, y, width, height };
        });
}

export function assertWindowOffscreen(window, label = "GPUI test window") {
    const frames = screenFrames();
    const visibleFrame = frames.find((frame) => rectsIntersect(window.bounds ?? window, frame));
    if (!visibleFrame) return;
    throw new Error(
        `${label} is on-screen at ${window.x},${window.y} ${window.width}x${window.height}; screen=${visibleFrame.x},${visibleFrame.y} ${visibleFrame.width}x${visibleFrame.height}`,
    );
}

function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function execFileText(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            command,
            args,
            {
                encoding: "utf8",
                cwd: options.cwd,
                env: options.env,
            },
            (error, stdout, stderr) => {
                if (error && options.reject !== false) {
                    reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
                    return;
                }
                resolve({ stdout, stderr, error });
            },
        );
        if (options.input != null) child.stdin?.end(options.input);
    });
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
