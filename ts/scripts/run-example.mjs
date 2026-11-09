#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServiceBinary } from "./service-binary.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tsRoot = resolve(here, "..");

const args = process.argv.slice(2);
const positional = [];
let timeoutMs = Number(process.env.RNGPUI_EXAMPLE_TIMEOUT_MS || 0);
let interactive = false;
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--timeout-ms") timeoutMs = Number(args[++i] || timeoutMs);
    else if (arg === "--interactive") interactive = true;
    else positional.push(arg);
}

const entry = positional[0];
if (!entry) {
    console.error("usage: node scripts/run-example.mjs <entry.tsx> [--timeout-ms N] [--interactive]");
    process.exit(1);
}

const workdir = mkdtempSync(join(tmpdir(), "rngpui-example-"));
const outJs = join(workdir, "app.js");
const pidPath = join(workdir, "service.pid");
let child = null;
let finished = false;

function cleanup() {
    if (child && child.exitCode == null) {
        try {
            child.kill("SIGTERM");
        } catch {}
    }
    rmSync(workdir, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        cleanup();
        process.exit(signal === "SIGINT" ? 130 : 143);
    });
}

try {
    const bundle = spawnSync("bun", ["scripts/bundle-app.mjs", resolve(tsRoot, entry), outJs], {
        cwd: tsRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
    });
    if (bundle.status !== 0) {
        process.stderr.write(bundle.stdout);
        process.stderr.write(bundle.stderr);
        process.exit(bundle.status || 1);
    }
    const bundlePath = outJs;
    const bin = resolveServiceBinary().path;
    child = spawn(bin, [], {
        cwd: tsRoot,
        env: {
            ...process.env,
            RNGPUI_BUNDLE: bundlePath,
            RNGPUI_UI_BUNDLE: resolve(tsRoot, "dist", "ui-runtime.js"),
            RNGPUI_NO_ACTIVATE: "1",
            // parent-exit watchdog: the service reaps itself if this runner dies unreaped
            RNGPUI_TEST_MODE: "1",
            RNGPUI_SERVICE_PID_FILE: process.env.RNGPUI_SERVICE_PID_FILE || pidPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => process.stdout.write(chunk));

    let timer = null;
    if (!interactive && timeoutMs > 0) {
        timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            console.error(`EXAMPLE_TIMEOUT ${entry} after ${timeoutMs}ms`);
            cleanup();
            process.exit(124);
        }, timeoutMs);
    }

    child.on("exit", (code, signal) => {
        if (timer) clearTimeout(timer);
        if (finished) return;
        finished = true;
        cleanup();
        if (signal) process.exit(1);
        process.exit(code ?? 0);
    });
} catch (error) {
    cleanup();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
