import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "examples/animated-image-fixture.tsx";
const animatedIds = ["animated-gif", "animated-webp"];
const palette = {
    red: [229, 72, 77],
    green: [48, 164, 108],
    blue: [0, 144, 255],
    yellow: [255, 178, 36],
};
const workdir = mkdtempSync(join(tmpdir(), "rngpui-animated-image-"));
const sessions = [];

function cli(args, extraEnv = {}) {
    const result = spawnSync("bun", ["run", "cli/bin.ts", ...args], {
        cwd: tsRoot,
        encoding: "utf8",
        env: { ...process.env, RNGPUI_NO_ACTIVATE: "1", RNGPUI_TEST_MODE: "1", ...extraEnv },
        timeout: 90_000,
    });
    if (result.status !== 0) {
        throw new Error(`rngpui ${args.join(" ")} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
    }
    return JSON.parse(result.stdout);
}

function fail(message) {
    console.error(`ANIMATED_IMAGE_CONFORMANCE_FAIL ${message}`);
    process.exitCode = 1;
    throw new Error(message);
}

function nearestFrame(hex) {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    let best = "";
    let bestDistance = Infinity;
    for (const [name, color] of Object.entries(palette)) {
        const distance = Math.hypot(rgb[0] - color[0], rgb[1] - color[1], rgb[2] - color[2]);
        if (distance < bestDistance) {
            best = name;
            bestDistance = distance;
        }
    }
    return bestDistance < 40 ? best : `unknown(${hex})`;
}

function selectFlags(ids) {
    return ids.flatMap((id) => ["--select", id]);
}

function colorsOf(shot) {
    return Object.fromEntries(shot.measurements.map((measurement) => [measurement.selector, measurement.dominant]));
}

function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}

function contains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function framesOver(session, ms) {
    const before = cli(["get", "frames", "--session", session, "--json"]);
    await sleep(ms);
    const after = cli(["get", "frames", "--session", session, "--json"]);
    return { painted: after.framesPainted - before.framesPainted, fps: ((after.framesPainted - before.framesPainted) * 1000) / ms };
}

async function checkAnimated() {
    const ids = [...animatedIds, "still-png"];
    const first = cli(["shot", "--launch", entry, "--keep", "--json", ...selectFlags(ids), "--out", join(workdir, "frame-0.png")]);
    const session = first.session;
    if (!session) fail("shot --keep printed no session");
    sessions.push(session);
    const shots = [first];
    for (let index = 1; index < 8; index += 1) {
        await sleep(37 + 61 * index);
        shots.push(cli(["reshot", "--session", session, "--json", ...selectFlags(ids), "--out", join(workdir, `frame-${index}.png`)]));
    }
    const stillColors = new Set(shots.map((shot) => colorsOf(shot)["still-png"]));
    if (stillColors.size !== 1) fail(`the still PNG changed between captures: ${[...stillColors].join(", ")}`);
    for (const id of animatedIds) {
        const frames = shots.map((shot) => nearestFrame(colorsOf(shot)[id]));
        const unknown = frames.filter((frame) => frame.startsWith("unknown"));
        if (unknown.length) fail(`${id} painted colors that are not GIF frames: ${unknown.join(", ")}`);
        const distinct = new Set(frames);
        if (distinct.size < 2) fail(`${id} showed one frame across 8 captures: ${frames.join(", ")}`);
        console.log(`  PASS ${id} animates: ${frames.join(" → ")}`);
    }

    const firstColors = colorsOf(shots[0]);
    const changedIndex = shots.findIndex((shot) => colorsOf(shot)["animated-gif"] !== firstColors["animated-gif"]);
    if (changedIndex < 0) fail("no capture differed from the first one");
    const diff = cli(["diff", join(workdir, "frame-0.png"), join(workdir, `frame-${changedIndex}.png`), "--json", "--out", join(workdir, "diff.png")]);
    if (!diff.box) fail("rngpui diff found no changed pixels between two captures");
    const scale = diff.width / first.window.split("x").map(Number)[0];
    const scaled = (bounds) => ({ x: bounds.x * scale, y: bounds.y * scale, width: bounds.width * scale, height: bounds.height * scale });
    const bounds = Object.fromEntries(first.measurements.map((measurement) => [measurement.selector, scaled(measurement.bounds)]));
    const animatedUnion = {
        x: Math.min(...animatedIds.map((id) => bounds[id].x)) - 1,
        y: Math.min(...animatedIds.map((id) => bounds[id].y)) - 1,
        width: Math.max(...animatedIds.map((id) => bounds[id].x + bounds[id].width)) - Math.min(...animatedIds.map((id) => bounds[id].x)) + 2,
        height: Math.max(...animatedIds.map((id) => bounds[id].y + bounds[id].height)) - Math.min(...animatedIds.map((id) => bounds[id].y)) + 2,
    };
    if (!contains(animatedUnion, diff.box)) fail(`changed region ${JSON.stringify(diff.box)} leaks outside the animated tiles ${JSON.stringify(animatedUnion)}`);
    if (overlaps(diff.box, bounds["still-png"])) fail("the still PNG region changed");
    console.log(`  PASS rngpui diff frame-0 vs frame-${changedIndex}: ${diff.changed} px changed inside ${JSON.stringify(diff.box)}`);

    const pacing = await framesOver(session, 1500);
    if (pacing.fps < 3 || pacing.fps > 20) fail(`a 150ms-per-frame animation painted at ${pacing.fps.toFixed(1)}fps (want 3-20)`);
    console.log(`  PASS animation paces redraws to its frame delay: ${pacing.fps.toFixed(1)}fps`);
}

async function checkStill() {
    const first = cli(["shot", "--launch", entry, "--keep", "--json", "--select", "still-png", "--out", join(workdir, "still.png")], { RNGPUI_ANIMATED_IMAGE_FIXTURE: "still" });
    const session = first.session;
    if (!session) fail("still shot --keep printed no session");
    sessions.push(session);
    await sleep(500);
    const idle = await framesOver(session, 1500);
    if (idle.painted > 1) fail(`a still image repainted ${idle.painted} times while idle`);
    console.log(`  PASS a still image stays idle: ${idle.painted} frames in 1.5s`);
}

console.log("rngpui animated-image-conformance: GIF/WebP frames advance, still images stay idle\n");
try {
    await checkAnimated();
    await checkStill();
    console.log("\nANIMATED_IMAGE_CONFORMANCE_PASS");
} catch (error) {
    if (!process.exitCode) {
        console.error(`ANIMATED_IMAGE_CONFORMANCE_FAIL ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
} finally {
    for (const session of sessions) {
        spawnSync("bun", ["run", "cli/bin.ts", "close", "--session", session], { cwd: tsRoot, encoding: "utf8", timeout: 30_000 });
    }
    rmSync(workdir, { recursive: true, force: true });
}
