import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "examples/local-storage-conformance.tsx";
const workdir = mkdtempSync(join(tmpdir(), "rngpui-local-storage-"));
const storageDir = join(workdir, "app-data");
const storageFile = join(storageDir, "local-storage.json");

function fail(message) {
    throw new Error(message);
}

function runPhase(phase, { env = {}, onLine } = {}) {
    const pidFile = join(workdir, `${phase}.pid`);
    return new Promise((done) => {
        const child = spawn("node", ["scripts/run-example.mjs", entry, "--timeout-ms", "20000"], {
            cwd: tsRoot,
            env: {
                ...process.env,
                RNGPUI_NO_ACTIVATE: "1",
                RNGPUI_TEST_MODE: "1",
                RNGPUI_STORAGE_DIR: storageDir,
                RNGPUI_STORAGE_EXPECTED_PATH: storageFile,
                RNGPUI_STORAGE_PHASE: phase,
                RNGPUI_SERVICE_PID_FILE: pidFile,
                ...env,
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let pending = "";
        const onChunk = (chunk) => {
            output += chunk;
            pending += chunk;
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) onLine?.(line, { pidFile });
        };
        child.stdout.setEncoding("utf8").on("data", onChunk);
        child.stderr.setEncoding("utf8").on("data", onChunk);
        child.on("exit", (code, signal) => done({ code, signal, output }));
    });
}

function expectPhase(result, phase, expectedCode = 0) {
    const failed = /STORAGE_CONFORMANCE \S+ .* FAIL|STORAGE_CONFORMANCE \S+ threw/.test(result.output);
    if (result.code !== expectedCode || failed) {
        fail(`phase ${phase} exited ${result.code}${result.signal ? ` (${result.signal})` : ""}\n${result.output}`);
    }
    const passes = result.output.match(/STORAGE_CONFORMANCE \S+ .* PASS/g) ?? [];
    console.log(`  PASS phase ${phase} (${passes.length} in-app checks)`);
}

function readStore() {
    return JSON.parse(readFileSync(storageFile, "utf8"));
}

function expectStore(label, expected) {
    const actual = readStore();
    const same = JSON.stringify(Object.keys(actual).sort().map((key) => [key, actual[key]])) === JSON.stringify(Object.keys(expected).sort().map((key) => [key, expected[key]]));
    if (!same) fail(`${label}: ${storageFile} holds ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`  PASS ${label}: ${JSON.stringify(Object.keys(actual).sort())}`);
}

function waitForExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((done, reject) => {
        const poll = () => {
            try {
                process.kill(pid, 0);
            } catch {
                done();
                return;
            }
            if (Date.now() > deadline) {
                reject(new Error(`service ${pid} still running after SIGTERM`));
                return;
            }
            setTimeout(poll, 25);
        };
        poll();
    });
}

console.log("rngpui local-storage-conformance: localStorage survives restarts, signals, and corruption\n");
try {
    expectPhase(await runPhase("write"), "write");
    expectStore("write + exit flush", {
        account: JSON.stringify({ login: "forsen", token: "oauth:abc" }),
        "emoji ✓": "🎉 line break \"quoted\"",
        number: "42",
        theme: "dark",
        unflushed: "written at exit",
    });
    const fileMode = statSync(storageFile).mode & 0o777;
    const dirMode = statSync(storageDir).mode & 0o777;
    if (fileMode !== 0o600 || dirMode !== 0o700) fail(`expected 0600 file / 0700 dir, got ${fileMode.toString(8)} / ${dirMode.toString(8)}`);
    const leftovers = readdirSync(storageDir).filter((name) => name.endsWith(".tmp"));
    if (leftovers.length) fail(`staging files left behind: ${leftovers.join(", ")}`);
    console.log("  PASS the store is private (0600 in a 0700 dir) with no staging files left");

    expectPhase(await runPhase("read"), "read");
    expectStore("read + update", {
        "emoji ✓": "🎉 line break \"quoted\"",
        number: "42",
        theme: "light",
        unflushed: "written at exit",
    });

    let signalled = false;
    const signal = await runPhase("signal", {
        onLine(line, { pidFile }) {
            if (signalled || !line.includes("STORAGE_CONFORMANCE signal ready")) return;
            signalled = true;
            const pid = Number(readFileSync(pidFile, "utf8").trim());
            process.kill(pid, "SIGTERM");
            waitForExit(pid, 10_000).catch(() => {});
        },
    });
    if (!signalled) fail(`phase signal never became ready\n${signal.output}`);
    expectPhase(signal, "signal", 1);
    expectStore("SIGTERM flush", {
        "emoji ✓": "🎉 line break \"quoted\"",
        late: "saved on SIGTERM",
        number: "42",
        theme: "light",
        unflushed: "written at exit",
    });

    writeFileSync(storageFile, "{broken");
    expectPhase(await runPhase("corrupt"), "corrupt");
    expectStore("corrupt file replaced", { fresh: "1" });
    const quarantined = readdirSync(storageDir).filter((name) => name.startsWith("local-storage.json.corrupt-"));
    if (quarantined.length !== 1 || readFileSync(join(storageDir, quarantined[0]), "utf8") !== "{broken") {
        fail(`expected the corrupt file to be kept aside, found ${JSON.stringify(quarantined)}`);
    }
    console.log(`  PASS the unreadable file was kept as ${quarantined[0]}`);

    expectPhase(await runPhase("clear"), "clear");
    expectStore("clear", { "after-clear": "1" });

    const xdgDataHome = join(workdir, "xdg-data");
    mkdirSync(xdgDataHome);
    expectPhase(await runPhase("memory", { env: { RNGPUI_STORAGE_DIR: "", XDG_DATA_HOME: xdgDataHome } }), "memory");
    const written = readdirSync(xdgDataHome);
    if (written.length) fail(`RNGPUI_TEST_MODE without RNGPUI_STORAGE_DIR wrote ${JSON.stringify(written)} into XDG_DATA_HOME`);
    console.log("  PASS test mode without RNGPUI_STORAGE_DIR never touches the data dir");

    console.log("\nLOCAL_STORAGE_CONFORMANCE_PASS");
} catch (error) {
    console.error(`LOCAL_STORAGE_CONFORMANCE_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    if (existsSync(workdir)) rmSync(workdir, { recursive: true, force: true });
}
