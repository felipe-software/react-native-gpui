#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { conformanceEnv, sleep } from "./conformance-utils.mjs";
import { resolveServiceBinary } from "./service-binary.mjs";

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
};
const seconds = option("seconds", 10);
const warmup = option("warmup", 4);
const maxMainCpu = option("max-main-cpu", Number.NaN);
const json = args.includes("--json");

if (process.platform !== "linux") {
    console.error("chat-list-stress reads per-thread CPU from /proc and runs on Linux only");
    process.exit(2);
}

const outDir = join(tmpdir(), "rngpui-chat-list-stress");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const outJs = join(outDir, "app.js");
const controlSocket = join(outDir, "control.sock");

const bundle = spawnSync("bun", ["scripts/bundle-app.mjs", resolve(tsRoot, "examples/chat-list-stress.tsx"), outJs], {
    cwd: tsRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
});
if (bundle.status !== 0) {
    process.stderr.write(bundle.stdout || "");
    process.stderr.write(bundle.stderr || "");
    process.exit(1);
}

const serviceBin = resolveServiceBinary().path;

let output = "";
const child = spawn(serviceBin, [], {
    cwd: tsRoot,
    env: conformanceEnv({ RNGPUI_BUNDLE: outJs, RNGPUI_CONTROL_SOCKET: controlSocket }),
    stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => (output += chunk.toString()));
child.stderr?.on("data", (chunk) => (output += chunk.toString()));

const clockTicks = Number(spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).stdout.trim()) || 100;

try {
    const deadline = Date.now() + 30_000;
    while (!/CHAT_STRESS_READY/.test(output)) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error(`fixture never became ready\n${output.slice(-2000)}`);
        await sleep(50);
    }
    await sleep(warmup * 1000);
    const startStats = await request({ $cmd: "frameStats" });
    const startLists = (await request({ $cmd: "chatListState" })).lists;
    const startThreads = threadTimes(child.pid);
    const startedAt = performance.now();
    await sleep(seconds * 1000);
    const endThreads = threadTimes(child.pid);
    const elapsed = (performance.now() - startedAt) / 1000;
    const endStats = await request({ $cmd: "frameStats" });
    const endLists = (await request({ $cmd: "chatListState" })).lists;

    const threads = [...endThreads.entries()]
        .map(([tid, end]) => {
            const start = startThreads.get(tid) ?? { ticks: 0, name: end.name };
            const cpu = ((end.ticks - start.ticks) / clockTicks / elapsed) * 100;
            return { tid, name: end.name, cpu, main: tid === child.pid };
        })
        .filter((thread) => thread.cpu > 0.05)
        .sort((a, b) => b.cpu - a.cpu);
    const main = threads.find((thread) => thread.main) ?? { cpu: 0 };
    const total = threads.reduce((sum, thread) => sum + thread.cpu, 0);
    const frames = endStats.framesPainted - startStats.framesPainted;
    const layoutsBuilt = endLists.reduce((sum, list) => sum + list.layoutsBuilt, 0) - startLists.reduce((sum, list) => sum + list.layoutsBuilt, 0);
    const report = {
        seconds: Number(elapsed.toFixed(2)),
        mainThreadCpu: Number(main.cpu.toFixed(1)),
        processCpu: Number(total.toFixed(1)),
        framesPerSecond: Number((frames / elapsed).toFixed(1)),
        avgFrameGapMs: endStats.avgFrameGapMs,
        lists: endLists.length,
        messagesPerList: endLists.map((list) => list.messages),
        visibleMessages: endLists.reduce((sum, list) => sum + list.visibleMessages, 0),
        animatedVisible: endLists.reduce((sum, list) => sum + list.animatedVisible, 0),
        layoutsBuiltPerSecond: Number((layoutsBuilt / elapsed).toFixed(1)),
        cachedLayouts: endLists.reduce((sum, list) => sum + list.cachedLayouts, 0),
        threads: threads.slice(0, 8).map((thread) => ({ name: thread.name, tid: thread.tid, cpu: Number(thread.cpu.toFixed(1)) })),
    };
    stop();
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
        console.log(`CHAT_LIST_STRESS ${report.lists} lists, ${report.messagesPerList.join("/")} messages, ${report.visibleMessages} visible, ${report.animatedVisible} animated visible`);
        console.log(`  main thread ${report.mainThreadCpu}% of one core, whole process ${report.processCpu}%`);
        console.log(`  ${report.framesPerSecond} frames/s (avg gap ${report.avgFrameGapMs?.toFixed?.(1) ?? "n/a"} ms), ${report.layoutsBuiltPerSecond} message layouts/s, ${report.cachedLayouts} cached`);
        for (const thread of report.threads) console.log(`  ${thread.cpu.toFixed(1).padStart(5)}%  ${thread.name} (${thread.tid})`);
    }
    if (Number.isFinite(maxMainCpu) && report.mainThreadCpu > maxMainCpu) {
        console.error(`CHAT_LIST_STRESS FAIL main thread ${report.mainThreadCpu}% > ${maxMainCpu}%`);
        process.exit(1);
    }
    process.exit(0);
} catch (error) {
    stop();
    console.error(`CHAT_LIST_STRESS FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}

function threadTimes(pid) {
    const times = new Map();
    for (const tid of readdirSync(`/proc/${pid}/task`)) {
        try {
            const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, "utf8");
            const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
            const ticks = Number(fields[11]) + Number(fields[12]);
            const name = readFileSync(`/proc/${pid}/task/${tid}/comm`, "utf8").trim();
            times.set(Number(tid), { ticks, name });
        } catch {
            continue;
        }
    }
    return times;
}

function request(payload) {
    return new Promise((resolveRequest, rejectRequest) => {
        const socket = net.connect(controlSocket);
        let buffer = "";
        const timer = setTimeout(() => {
            socket.destroy();
            rejectRequest(new Error(`control request ${payload.$cmd} timed out`));
        }, 8000);
        socket.on("connect", () => socket.write(`${JSON.stringify({ reqId: 1, ...payload })}\n`));
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            clearTimeout(timer);
            socket.destroy();
            resolveRequest(JSON.parse(buffer.slice(0, newline)));
        });
        socket.on("error", (error) => {
            clearTimeout(timer);
            rejectRequest(error);
        });
    });
}

function stop() {
    if (child.exitCode === null) child.kill("SIGTERM");
}
