import {
    AppRegistry,
    Files,
    getRandomValues,
    Notifications,
    Processes,
    randomUUID,
    Sound,
    Text,
    View,
} from "../src/index";

const env = process.env;
const server = env.RNGPUI_TEST_HTTP ?? "";
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
    const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
    if (ok) {
        console.log(`PLATFORM_CONFORMANCE ${label} PASS${suffix}`);
        return;
    }
    failures += 1;
    console.error(`PLATFORM_CONFORMANCE ${label} FAIL${suffix}`);
}

async function rejects(label: string, run: () => Promise<unknown>, pattern: RegExp) {
    try {
        await run();
        check(label, false, "resolved");
    } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        check(label, pattern.test(message), message);
    }
}

function throws(label: string, run: () => unknown, name: string) {
    try {
        run();
        check(label, false, "did not throw");
    } catch (error) {
        check(label, error instanceof Error && error.name === name, error instanceof Error ? error.name : String(error));
    }
}

function checkCrypto() {
    const bytes = getRandomValues(new Uint8Array(64));
    check("crypto.getRandomValues fills bytes", new Set(bytes).size > 20, new Set(bytes).size);
    const words = crypto.getRandomValues(new Uint32Array(8));
    check("crypto.getRandomValues returns its argument", words instanceof Uint32Array && words.some((word) => word > 0xffff));
    const offsetView = new Uint8Array(new ArrayBuffer(16), 8, 4);
    crypto.getRandomValues(offsetView);
    check("crypto.getRandomValues honors byteOffset", new Uint8Array(offsetView.buffer, 0, 8).every((byte) => byte === 0));
    throws("crypto.getRandomValues rejects floats", () => crypto.getRandomValues(new Float32Array(4) as unknown as Uint8Array), "TypeMismatchError");
    throws("crypto.getRandomValues caps at 64KiB", () => crypto.getRandomValues(new Uint8Array(65537)), "QuotaExceededError");
    const uuids = Array.from({ length: 500 }, () => randomUUID());
    const shaped = uuids.every((uuid) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid));
    check("crypto.randomUUID is a v4 UUID", shaped, uuids[0]);
    check("crypto.randomUUID is unique", new Set(uuids).size === uuids.length);
}

async function checkFetch() {
    const text = await fetch(`${server}/text`);
    check("fetch status/statusText", text.status === 200 && text.statusText === "OK" && text.ok, [text.status, text.statusText]);
    check("fetch headers.get is case-insensitive", text.headers.get("X-RNGPUI-Test") === "alpha", text.headers.get("x-rngpui-test"));
    check("fetch joins repeated headers", text.headers.get("x-multi") === "one, two", text.headers.get("x-multi"));
    check("fetch headers.has", text.headers.has("content-type") && !text.headers.has("x-missing"));
    const seen: string[] = [];
    text.headers.forEach((_value, name) => seen.push(name));
    const entries = Array.from(text.headers.entries()).map(([name]) => name);
    check("fetch headers.forEach/entries iterate sorted names", seen.join() === entries.join() && entries.includes("x-rngpui-test") && [...entries].sort().join() === entries.join(), entries);
    check("fetch headers are iterable", Array.from(text.headers).length === entries.length && Array.from(text.headers.keys()).length === entries.length);
    check("fetch url", text.url === `${server}/text` && !text.redirected, text.url);
    check("fetch text()", (await text.text()) === "hello ✓", "hello ✓");

    const binary = await fetch(`${server}/bytes`);
    const buffer = await binary.arrayBuffer();
    const view = new Uint8Array(buffer);
    check("fetch arrayBuffer() keeps binary bytes", buffer instanceof ArrayBuffer && view.length === 256 && view.every((byte, index) => byte === index), view.length);
    const utf8 = new Uint8Array(await (await fetch(`${server}/text`)).arrayBuffer());
    check("fetch arrayBuffer() of text is UTF-8", Array.from(utf8.slice(-3)).join() === "226,156,147", Array.from(utf8));

    const redirected = await fetch(`${server}/redirect`);
    check("fetch follows redirects and reports the final url", redirected.redirected && redirected.url === `${server}/text`, redirected.url);

    const teapot = await fetch(`${server}/teapot`);
    check("fetch non-2xx", !teapot.ok && teapot.status === 418 && teapot.statusText === "I'm a teapot", [teapot.status, teapot.statusText]);
    check("fetch json()", (await (await fetch(`${server}/json`)).json()).answer === 42);
    const cloned = await fetch(`${server}/json`);
    check("fetch clone()", (await cloned.clone().json()).answer === 42 && (await cloned.text()).includes("42"));

    const form = await (await fetch(`${server}/echo`, { method: "POST", body: new URLSearchParams({ q: "a b", n: "1" }) })).json();
    check("fetch URLSearchParams body", form.contentType === "application/x-www-form-urlencoded;charset=UTF-8" && form.body === "q=a%20b&n=1", form);
    const sent = new Uint8Array([0, 255, 1, 254]);
    const echoed = await (await fetch(`${server}/echo`, { method: "POST", body: new DataView(sent.buffer, 1, 2) })).json();
    check("fetch DataView body", echoed.hex === "ff01", echoed);
    const headerPairs = await (await fetch(`${server}/echo`, { method: "POST", headers: [["X-Pair", "a"], ["X-Pair", "b"]], body: "x" })).json();
    check("fetch header pairs", headerPairs.pair === "a, b", headerPairs);
    await rejects("fetch network errors reject with TypeError", () => fetch("http://127.0.0.1:1/unreachable"), /^TypeError/);
}

async function checkNotifications() {
    const shown = await Notifications.show({ title: "rngpui conformance", body: "<b>mention</b> & more" });
    check("Notifications.show resolves true", shown === true, shown);
    await rejects("Notifications.show needs a title", () => Notifications.show({ title: "  " }), /title/);
}

async function checkSound() {
    await Sound.play();
    await Sound.play("ping", { volume: 0.5 });
    await Sound.play(env.RNGPUI_TEST_WAV ?? "");
    await Sound.play(`file://${env.RNGPUI_TEST_WAV ?? ""}`);
    await Sound.play(`${server}/beep.wav`);
    check("Sound.play resolves for ping, files, file:// and http", true);
    await rejects("Sound.play rejects missing files", () => Sound.play("/definitely/missing.wav"), /cannot open/);
    await rejects("Sound.play rejects MP3", () => Sound.play(env.RNGPUI_TEST_NOT_AUDIO ?? ""), /MP3 is not supported/);
    await rejects("Sound.play rejects 404s", () => Sound.play(`${server}/missing.wav`), /404/);
    await rejects("Sound.play validates volume", () => Sound.play("ping", { volume: 2 }), /^RangeError/);
}

async function checkProcesses() {
    const probe = env.RNGPUI_TEST_PROCESS ?? "";
    const found = await Processes.findRunning([probe.toUpperCase(), "rngpui-surely-not-running", probe.toUpperCase(), ""]);
    check("Processes.findRunning finds a live process case-insensitively", found.length === 1 && found[0] === probe.toUpperCase(), found);
    check("Processes.findRunning of nothing", (await Processes.findRunning([])).length === 0);
}

async function checkFiles() {
    const path = env.RNGPUI_TEST_TEXT_FILE ?? "";
    check("Files.readText reads UTF-8 text", (await Files.readText(path)) === '{"name":"héllo ✓"}');
    check("Files.readText of a missing file is null", (await Files.readText(`${path}.missing`)) === null);
    await rejects("Files.readText rejects relative paths", () => Files.readText("relative/settings.json"), /absolute path/);
    await rejects("Files.readText rejects binary files", () => Files.readText(env.RNGPUI_TEST_NOT_TEXT ?? ""), /not UTF-8/);
    const dirs = await Files.knownDirectories();
    check("Files.knownDirectories names home, data and config", !!dirs.home?.startsWith("/") && !!dirs.data && !!dirs.config, dirs);
}

async function main() {
    checkCrypto();
    await checkFetch();
    await checkNotifications();
    await checkSound();
    await checkProcesses();
    await checkFiles();
    console.log(`PLATFORM_CONFORMANCE done failures=${failures}`);
    process.exit(failures === 0 ? 0 : 1);
}

function App() {
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#18181b" }}>
            <Text style={{ color: "#fafafa", fontSize: 14 }}>platform services conformance</Text>
        </View>
    );
}

AppRegistry.registerComponent("platform-services-conformance", () => App);
AppRegistry.runApplication("platform-services-conformance", { width: 360, height: 120 });
main().catch((error) => {
    console.error(`PLATFORM_CONFORMANCE threw ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
});
