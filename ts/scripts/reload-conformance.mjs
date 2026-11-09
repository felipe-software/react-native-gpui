#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServiceBinary } from "./service-binary.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tsRoot = resolve(here, "..");
const workdir = mkdtempSync(join(tsRoot, ".rngpui-reload-"));
const entry = join(workdir, "app.tsx");
const outJs = join(workdir, "app.js");
const dumpPath = join(workdir, "tree.json");
const pidPath = join(workdir, "service.pid");
let child = null;

try {
    bundle("rngpui reload first", true);
    child = spawn(resolveServiceBinary().path, [], {
        cwd: tsRoot,
        env: {
            ...process.env,
            RNGPUI_BUNDLE: outJs,
            RNGPUI_DUMP_TREE: dumpPath,
            RNGPUI_NO_ACTIVATE: "1",
            RNGPUI_TEST_MODE: "1",
            RNGPUI_SERVICE_PID_FILE: pidPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code, signal) => {
        if (signal !== "SIGTERM") output += `\nservice exited code=${code} signal=${signal}\n`;
    });

    await waitForDump("rngpui reload first", () => output);
    bundle("rngpui reload second", false);
    await waitForDump("rngpui reload second", () => output);
    console.log("RELOAD_CONFORMANCE_PASS app=exec-reloads-bytecode");
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    if (child && child.exitCode == null) {
        try {
            child.kill("SIGTERM");
        } catch {}
    }
    rmSync(workdir, { recursive: true, force: true });
}

function bundle(label, autoReload) {
    writeFileSync(
        entry,
        `
import { useEffect } from "react";
import { AppRegistry, Text, View } from ${JSON.stringify(resolve(tsRoot, "src/index.ts"))};

function App() {
  useEffect(() => {
    ${autoReload ? "setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1200);" : ""}
  }, []);
  return (
    <View style={{ width: 420, height: 240, backgroundColor: "#15171c", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#f7f8fb", fontSize: 20 }}>${label}</Text>
    </View>
  );
}

AppRegistry.registerComponent("ReloadConformance", () => App);
AppRegistry.runApplication("ReloadConformance", { width: 420, height: 240 });
`,
    );
    const result = spawnSync("bun", ["scripts/bundle-app.mjs", entry, outJs], {
        cwd: tsRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
    });
    if (result.status !== 0) {
        throw new Error(`bundle failed:\n${result.stdout}${result.stderr}`);
    }
}

async function waitForDump(text, output) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (existsSync(dumpPath)) {
            const dump = readFileSync(dumpPath, "utf8");
            if (dump.includes(text)) return;
        }
        if (child?.exitCode != null) {
            throw new Error(`service exited before ${text}; output:\n${output()}`);
        }
        await sleep(100);
    }
    const dump = existsSync(dumpPath) ? readFileSync(dumpPath, "utf8") : "(no dump)";
    throw new Error(`timed out waiting for ${text}; dump:\n${dump}\noutput:\n${output()}`);
}

function sleep(ms) {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function readdirSafe(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}
