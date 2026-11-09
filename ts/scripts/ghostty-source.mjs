import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustRoot = resolve(tsRoot, "..", "rust");

export function ghosttySource() {
    const vendored = resolve(tsRoot, "..", "..", "team-machine", "vendor", "libghostty-vt", "source");
    if (existsSync(join(vendored, "build.zig"))) return vendored;

    const commit = pinnedGhosttyCommit();
    const cacheRoot = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "rngpui");
    const checkout = join(cacheRoot, `ghostty-${commit.slice(0, 12)}`);
    if (!existsSync(join(checkout, "build.zig"))) {
        mkdirSync(cacheRoot, { recursive: true });
        git(["clone", "--filter=blob:none", "--no-checkout", "https://github.com/ghostty-org/ghostty.git", checkout]);
        git(["checkout", "--quiet", commit], checkout);
    }
    return checkout;
}

export function pinnedGhosttyCommit() {
    const metadata = JSON.parse(
        execFileSync("cargo", ["metadata", "--format-version", "1"], { cwd: rustRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }),
    );
    const sys = metadata.packages.find((pkg) => pkg.name === "libghostty-vt-sys");
    if (!sys) throw new Error("libghostty-vt-sys is not in the cargo dependency graph");
    const buildScript = readFileSync(join(dirname(sys.manifest_path), "build.rs"), "utf8");
    const commit = buildScript.match(/GHOSTTY_COMMIT:\s*&str\s*=\s*"([0-9a-f]{40})"/)?.[1];
    if (!commit) throw new Error(`cannot find GHOSTTY_COMMIT in ${sys.manifest_path}`);
    return commit;
}

function git(args, cwd) {
    execFileSync("git", args, { cwd, stdio: ["ignore", 2, 2] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const wantsCommit = process.argv.includes("--commit");
    console.log(wantsCommit ? pinnedGhosttyCommit() : ghosttySource());
}
