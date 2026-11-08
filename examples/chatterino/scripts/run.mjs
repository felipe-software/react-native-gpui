import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsRoot = resolve(exampleRoot, "..", "..", "ts");
const args = new Set(process.argv.slice(2));
const isDev = args.has("--dev");
const bundleOnly = args.has("--bundle-only");
const outDir = join(exampleRoot, ".build");
const bundle = join(outDir, "chatterino.js");

const linked = spawnSync("node", [join(exampleRoot, "scripts", "link-deps.mjs")], { stdio: "inherit" });
if (linked.status !== 0) process.exit(linked.status ?? 1);

mkdirSync(outDir, { recursive: true });
const built = spawnSync("bun", [join(tsRoot, "scripts", "bundle-app.mjs"), join(exampleRoot, "src", "main.tsx"), bundle], {
    cwd: tsRoot,
    env: { ...process.env, NODE_ENV: isDev ? "development" : "production" },
    stdio: "inherit",
});
if (built.status !== 0) process.exit(built.status ?? 1);
if (bundleOnly) process.exit(0);

const service = process.env.RNGPUI_SERVICE || join(tsRoot, "native", "rngpui-service");
if (!existsSync(service)) {
    console.error(`rngpui-service not found at ${service}; run \`npm run build:rust && npm run build:native\` in ts/`);
    process.exit(1);
}

const child = spawn(service, [], {
    stdio: "inherit",
    env: {
        ...process.env,
        RNGPUI_BUNDLE: bundle,
        RNGPUI_APP_ID: process.env.RNGPUI_APP_ID || "com.chatterino.gpui",
        RNGPUI_APP_NAME: process.env.RNGPUI_APP_NAME || "Chatterino GPUI",
        RNGPUI_WINDOW_TITLE: process.env.RNGPUI_WINDOW_TITLE || "Chatterino (react-native-gpui)",
    },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
