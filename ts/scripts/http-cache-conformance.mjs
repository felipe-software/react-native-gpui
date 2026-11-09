import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "examples/http-cache-conformance.tsx";
const workdir = mkdtempSync(join(tmpdir(), "rngpui-http-cache-"));
const cacheDir = join(workdir, "cache");
const emote = readFileSync(join(tsRoot, "examples/assets/chat-emote.png"));
const avatar = readFileSync(join(tsRoot, "examples/assets/chat-badge.png"));
const hits = new Map();
const SET_ETAG = '"set-v1"';

function fail(message) {
    throw new Error(message);
}

function hitCount(path) {
    return hits.get(path) ?? 0;
}

const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    hits.set(url.pathname, hitCount(url.pathname) + 1);
    if (url.pathname === "/set.json") {
        if (request.headers["if-none-match"] === SET_ETAG) {
            hits.set("/set.json 304", hitCount("/set.json 304") + 1);
            response.writeHead(304, { ETag: SET_ETAG, "Cache-Control": "no-cache" });
            response.end();
            return;
        }
        response.writeHead(200, { "Content-Type": "application/json", ETag: SET_ETAG, "Cache-Control": "no-cache" });
        response.end(JSON.stringify({ version: 1, emotes: ["forsenE"] }));
    } else if (url.pathname === "/emote.png") {
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" });
        response.end(emote);
    } else if (url.pathname === "/avatar.png") {
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" });
        response.end(avatar);
    } else {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("not found");
    }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

function runPhase(phase, extraEnv) {
    return new Promise((done) => {
        const env = { ...process.env, RNGPUI_NO_ACTIVATE: "1", RNGPUI_TEST_MODE: "1", RNGPUI_TEST_HTTP: origin, RNGPUI_TEST_PHASE: phase, ...extraEnv };
        if (!extraEnv.RNGPUI_CACHE_DIR) delete env.RNGPUI_CACHE_DIR;
        delete env.RNGPUI_HTTP_CACHE;
        const child = spawn("node", ["scripts/run-example.mjs", entry, "--timeout-ms", "30000"], { cwd: tsRoot, env, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => {
            output += chunk;
            process.stdout.write(chunk.split("\n").filter((line) => line.includes("HTTP_CACHE_CONFORMANCE")).map((line) => `  ${line}\n`).join(""));
        });
        child.stderr.setEncoding("utf8").on("data", (chunk) => {
            output += chunk;
        });
        child.on("exit", (code) => done({ code, output }));
    });
}

function cacheEntries() {
    const root = join(cacheDir, "http");
    if (!existsSync(root)) return [];
    return readdirSync(root)
        .filter((name) => /^[0-9a-f]{2}$/.test(name))
        .flatMap((shard) => readdirSync(join(root, shard)).map((name) => `${shard}/${name}`));
}

console.log("rngpui http-cache-conformance: fetch cache modes, image disk cache, relaunch, test-mode isolation\n");
try {
    for (const [phase, extraEnv] of [
        ["first", { RNGPUI_CACHE_DIR: cacheDir }],
        ["second", { RNGPUI_CACHE_DIR: cacheDir }],
    ]) {
        const result = await runPhase(phase, extraEnv);
        if (result.code !== 0 || !result.output.includes(`HTTP_CACHE_CONFORMANCE ${phase} done failures=0`)) {
            fail(`${phase} launch exited ${result.code}\n${result.output.slice(-4000)}`);
        }
    }
    const entries = cacheEntries();
    if (entries.length < 3 || !entries.every((entry) => /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(entry))) {
        fail(`expected sha256-named entries under http/<2 hex>/, found ${JSON.stringify(entries)}`);
    }
    const leftovers = existsSync(join(cacheDir, "http", "tmp")) ? readdirSync(join(cacheDir, "http", "tmp")) : [];
    if (leftovers.length > 0) fail(`temporary files were left behind: ${JSON.stringify(leftovers)}`);
    console.log(`  PASS ${entries.length} entries stored as http/<2 hex>/<sha256>, no temporary files left`);
    if (hitCount("/emote.png") !== 1 || hitCount("/avatar.png") !== 1) {
        fail(`images should download once across two launches: emote ${hitCount("/emote.png")}, avatar ${hitCount("/avatar.png")}`);
    }
    console.log("  PASS each image reached the server once across two launches (prefetch and <Image>)");
    if (hitCount("/set.json") !== 4 || hitCount("/set.json 304") !== 2) {
        fail(`expected reload, default and two revalidations of set.json, saw ${hitCount("/set.json")} requests and ${hitCount("/set.json 304")} 304s`);
    }
    console.log("  PASS set.json: reload + default + two conditional requests answered 304; cached reads never hit the server");

    const before = hitCount("/emote.png");
    const isolated = await runPhase("isolated", {});
    if (isolated.code !== 0 || !isolated.output.includes("HTTP_CACHE_CONFORMANCE isolated done failures=0")) {
        fail(`isolated launch exited ${isolated.code}\n${isolated.output.slice(-4000)}`);
    }
    if (hitCount("/emote.png") !== before + 1) fail("test mode without a cache dir should download the image again");
    console.log("  PASS RNGPUI_TEST_MODE without RNGPUI_CACHE_DIR reads and writes no cache");
    console.log("\nHTTP_CACHE_CONFORMANCE_PASS");
} catch (error) {
    console.error(`HTTP_CACHE_CONFORMANCE_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    server.close();
    rmSync(workdir, { recursive: true, force: true });
}
