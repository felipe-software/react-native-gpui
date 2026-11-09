import { copyFileSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = resolve(root, "..", "rust", "target", "release");
const serviceSource = join(releaseDir, "rngpui-service");
const nativeDir = join(root, "native");
const serviceTarget = join(nativeDir, "rngpui-service");
const jscEntitlements = resolve(root, "..", "rust", "jsc.entitlements");
const isMac = process.platform === "darwin";

mkdirSync(nativeDir, { recursive: true });
stage(serviceSource, serviceTarget);

if (isMac) {
    // JavaScriptCore silently falls back to its interpreter when this entitlement is absent.
    // Sign both developer entry points after every byte-changing staging operation so direct
    // cargo runs and the npm package cannot enter that state.
    for (const binary of [serviceSource, serviceTarget]) {
        execFileSync("codesign", ["--force", "--sign", "-", "--entitlements", jscEntitlements, binary]);
    }
}

// the worklet/UI runtime bundle ships next to the binary — the service resolves
// ui-runtime.js beside its executable (plans/off-thread-reanimated.md).
const uiRuntime = spawnSync("bun", ["scripts/build-ui-runtime.mjs"], { cwd: root, stdio: "inherit" });
if (uiRuntime.status !== 0) {
    throw new Error("build-ui-runtime.mjs failed — the shipped package needs native/ui-runtime.js");
}

// Write beside the target and rename over it, never copy onto it. A plain
// copyFileSync reuses the inode, and macOS caches a code signature per (device,
// inode): overwrite the file a running service is mapped from and the NEXT launch
// is SIGKILLed by AMFI with `EXC_BAD_ACCESS ... CODESIGNING / Invalid Page`, on a
// binary `codesign --verify` still calls valid on disk. The launch fails before it
// writes a line, so the harness reports only "service did not start (no service
// log)" and the cause is invisible. A rename gives the new bytes a new inode and
// nothing stale can be consulted.
function stage(source, target) {
    const temp = `${target}.staging`;
    copyFileSync(source, temp);
    renameSync(temp, target);
}
