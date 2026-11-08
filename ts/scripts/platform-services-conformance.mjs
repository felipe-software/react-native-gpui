import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "examples/platform-services-conformance.tsx";
const workdir = mkdtempSync(join(tmpdir(), "rngpui-platform-services-"));
const soundDir = join(workdir, "sounds");
const notificationsFile = join(workdir, "notifications.jsonl");
const probeName = "rngpui-conformance-probe-process";

function fail(message) {
    throw new Error(message);
}

function wav(rate, samples) {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((sample, index) => data.writeInt16LE(Math.round(sample * 32767), index * 2));
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

function parseWav(path) {
    const bytes = readFileSync(path);
    const channels = bytes.readUInt16LE(22);
    const rate = bytes.readUInt32LE(24);
    const dataBytes = bytes.readUInt32LE(40);
    let peak = 0;
    for (let offset = 44; offset < 44 + dataBytes; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)) / 32767);
    return { channels, rate, frames: dataBytes / 2 / channels, peak };
}

const beep = wav(8000, Array.from({ length: 800 }, (_, index) => 0.5 * Math.sin((2 * Math.PI * 440 * index) / 8000)));
const testWav = join(workdir, "beep.wav");
const notAudio = join(workdir, "not-audio.mp3");
writeFileSync(testWav, beep);
writeFileSync(notAudio, Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000fake mp3"));

const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/text") {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("X-RNGPUI-Test", "alpha");
        response.setHeader("X-Multi", ["one", "two"]);
        response.end("hello ✓");
    } else if (url.pathname === "/bytes") {
        response.setHeader("Content-Type", "application/octet-stream");
        response.end(Buffer.from(Array.from({ length: 256 }, (_, index) => index)));
    } else if (url.pathname === "/redirect") {
        response.writeHead(302, { Location: "/text" });
        response.end();
    } else if (url.pathname === "/teapot") {
        response.writeHead(418, "I'm a teapot", { "Content-Type": "text/plain" });
        response.end("short and stout");
    } else if (url.pathname === "/json") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ answer: 42 }));
    } else if (url.pathname === "/echo") {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => {
            const body = Buffer.concat(chunks);
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({
                contentType: request.headers["content-type"] ?? null,
                pair: request.headers["x-pair"] ?? null,
                body: body.toString("utf8"),
                hex: body.toString("hex"),
            }));
        });
    } else if (url.pathname === "/beep.wav") {
        response.setHeader("Content-Type", "audio/wav");
        response.end(beep);
    } else {
        response.writeHead(404);
        response.end("not found");
    }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const probePath = join(workdir, probeName);
copyFileSync(existsSync("/bin/sleep") ? "/bin/sleep" : "/usr/bin/sleep", probePath);
const probe = spawn(probePath, ["120"], { stdio: "ignore" });

function runFixture() {
    return new Promise((done) => {
        const child = spawn("node", ["scripts/run-example.mjs", entry, "--timeout-ms", "45000"], {
            cwd: tsRoot,
            env: {
                ...process.env,
                RNGPUI_NO_ACTIVATE: "1",
                RNGPUI_TEST_MODE: "1",
                RNGPUI_TEST_HTTP: origin,
                RNGPUI_TEST_WAV: testWav,
                RNGPUI_TEST_NOT_AUDIO: notAudio,
                RNGPUI_TEST_PROCESS: probeName,
                RNGPUI_FAKE_SOUND_DIR: soundDir,
                RNGPUI_FAKE_NOTIFICATIONS: notificationsFile,
                RNGPUI_APP_NAME: "rngpui platform conformance",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => {
            output += chunk;
            process.stdout.write(chunk.split("\n").filter((line) => line.includes("PLATFORM_CONFORMANCE")).map((line) => `  ${line}\n`).join(""));
        });
        child.stderr.setEncoding("utf8").on("data", (chunk) => {
            output += chunk;
        });
        child.on("exit", (code) => done({ code, output }));
    });
}

console.log("rngpui platform-services-conformance: fetch, crypto, notifications, sound, processes\n");
try {
    const result = await runFixture();
    if (result.code !== 0 || !result.output.includes("PLATFORM_CONFORMANCE done failures=0")) {
        fail(`fixture exited ${result.code}\n${result.output}`);
    }

    const sounds = readdirSync(soundDir).filter((name) => name.endsWith(".wav")).sort();
    if (sounds.length !== 5) fail(`expected 5 rendered sounds, found ${JSON.stringify(sounds)}`);
    const [ping, quietPing, file, fileUrl, remote] = sounds.map((name) => parseWav(join(soundDir, name)));
    const pingSeconds = ping.frames / ping.rate;
    if (ping.rate !== 48000 || ping.channels !== 1 || pingSeconds < 0.25 || pingSeconds > 0.5 || ping.peak < 0.2) {
        fail(`built-in ping looks wrong: ${JSON.stringify(ping)}`);
    }
    if (Math.abs(quietPing.peak - ping.peak / 2) > 0.01) fail(`volume 0.5 should halve the peak: ${ping.peak} vs ${quietPing.peak}`);
    for (const [label, decoded] of [["file", file], ["file://", fileUrl], ["http", remote]]) {
        if (decoded.rate !== 8000 || decoded.channels !== 1 || decoded.frames !== 800 || Math.abs(decoded.peak - 0.5) > 0.01) {
            fail(`${label} source decoded wrong: ${JSON.stringify(decoded)}`);
        }
    }
    console.log(`  PASS rendered sounds: ping ${pingSeconds.toFixed(2)}s peak ${ping.peak.toFixed(2)}, volume 0.5 peak ${quietPing.peak.toFixed(2)}, file/file:///http 800 frames @ 8kHz`);

    const notifications = readFileSync(notificationsFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const expected = { title: "rngpui conformance", body: "<b>mention</b> & more", appName: "rngpui platform conformance" };
    if (notifications.length !== 1 || JSON.stringify(notifications[0]) !== JSON.stringify(expected)) {
        fail(`unexpected notifications ${JSON.stringify(notifications)}`);
    }
    console.log("  PASS one notification reached the host with its title, body and app name");
    console.log("\nPLATFORM_SERVICES_CONFORMANCE_PASS");
} catch (error) {
    console.error(`PLATFORM_SERVICES_CONFORMANCE_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    probe.kill();
    server.close();
    rmSync(workdir, { recursive: true, force: true });
}
