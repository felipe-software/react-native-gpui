import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustRoot = resolve(tsRoot, "..", "rust");

const result = spawnSync("cargo", ["build", "--release", "--bin", "rngpui-service"], {
    cwd: rustRoot,
    stdio: "inherit",
});
process.exit(result.status ?? 1);
