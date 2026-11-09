import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveServiceBinary, uiRuntimeEnv } from "../scripts/service-binary.mjs";
import { bundleApp } from "./bundle";

export type RunOptions = {
    entry?: string;
    bundle?: string;
    development: boolean;
    size?: string;
};

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export async function runApp(options: RunOptions): Promise<number> {
    if (!options.entry && !options.bundle) {
        console.error("  run needs an entry (rngpui run app.tsx) or --bundle <app.js>");
        return 1;
    }
    const windowSize = parseSize(options.size);
    const workdir = options.bundle ? null : mkdtempSync(join(tmpdir(), "rngpui-run-"));
    const cleanup = () => {
        if (workdir) rmSync(workdir, { recursive: true, force: true });
    };
    try {
        const bundlePath = options.bundle
            ? resolve(options.bundle)
            : bundleApp(options.entry!, join(workdir!, "app.js"), { development: options.development, inheritOutput: true });
        const service = resolveServiceBinary();
        console.error(`[rngpui] ${service.path} (${service.source})`);
        const child = spawn(service.path, [], {
            stdio: "inherit",
            env: {
                ...process.env,
                ...uiRuntimeEnv(service.path),
                RNGPUI_BUNDLE: bundlePath,
                ...(windowSize ? { RNGPUI_WINDOW_SIZE: windowSize } : {}),
            },
        });
        const forward = (signal: NodeJS.Signals) => child.kill(signal);
        for (const signal of FORWARDED_SIGNALS) process.on(signal, forward);
        const code = await new Promise<number>((resolveExit) => {
            child.on("error", (error) => {
                console.error(`  failed to start ${service.path}: ${error.message}`);
                resolveExit(1);
            });
            child.on("exit", (exitCode, signal) => {
                const signalCode = signal ? 128 + (constants.signals[signal] ?? 0) : 1;
                resolveExit(exitCode ?? signalCode);
            });
        });
        for (const signal of FORWARDED_SIGNALS) process.off(signal, forward);
        return code;
    } finally {
        cleanup();
    }
}

function parseSize(size: string | undefined): string | null {
    if (!size) return null;
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) throw new Error(`--size must look like 1280x860, got ${size}`);
    return `${match[1]},${match[2]}`;
}
