import { spawnSync } from "node:child_process";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ghosttySource } from "./ghostty-source.mjs";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustRoot = resolve(tsRoot, "..", "rust");
const env = { ...process.env };

if (process.platform === "darwin") {
    env.PATH = ["/opt/homebrew/opt/zig@0.16/bin", env.PATH].join(delimiter);
}
env.GHOSTTY_SOURCE_DIR = env.GHOSTTY_SOURCE_DIR || ghosttySource();

const result = spawnSync("cargo", ["build", "--release", "--bin", "rngpui-service"], {
    cwd: rustRoot,
    env,
    stdio: "inherit",
});
process.exit(result.status ?? 1);
