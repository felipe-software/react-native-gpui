import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { packageRoot } from "../scripts/service-binary.mjs";

export type BundleOptions = {
    development?: boolean;
    inheritOutput?: boolean;
};

const bunExecutable = process.versions.bun ? process.execPath : "bun";

export function bundleApp(entry: string, out: string, options: BundleOptions = {}): string {
    const entryPath = resolve(entry);
    if (!existsSync(entryPath)) throw new Error(`entry not found: ${entryPath}`);
    const outPath = resolve(out);
    mkdirSync(dirname(outPath), { recursive: true });
    const nodeEnv = options.development ? "development" : "production";
    const stdio = options.inheritOutput ? "inherit" : "pipe";
    const result = spawnSync(bunExecutable, [join(packageRoot, "scripts", "bundle-app.mjs"), entryPath, outPath], {
        cwd: packageRoot,
        encoding: "utf8",
        stdio,
        env: { ...process.env, NODE_ENV: nodeEnv },
    });
    if (result.status !== 0) {
        const output = options.inheritOutput ? "" : `\n${result.stdout}\n${result.stderr}`;
        throw new Error(`bundle-app failed${output}`);
    }
    if (!existsSync(outPath)) throw new Error(`bundle-app did not write ${outPath}`);
    return outPath;
}
