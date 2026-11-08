import { AppRegistry, LocalStorage, Text, View } from "../src/index";

const phase = process.env.RNGPUI_STORAGE_PHASE ?? "";

function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    const line = `STORAGE_CONFORMANCE ${phase} ${label} ${ok ? "PASS" : "FAIL"} actual=${JSON.stringify(actual)}`;
    if (ok) {
        console.log(line);
        return;
    }
    console.error(`${line} expected=${JSON.stringify(expected)}`);
    process.exit(1);
}

function storedKeys() {
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).sort();
}

const phases: Record<string, () => Promise<void>> = {
    async write() {
        check("persistent", LocalStorage.isPersistent(), true);
        check("path", LocalStorage.getPath(), process.env.RNGPUI_STORAGE_EXPECTED_PATH);
        check("starts empty", localStorage.length, 0);
        localStorage.setItem("theme", "dark");
        localStorage.setItem("account", JSON.stringify({ login: "forsen", token: "oauth:abc" }));
        localStorage.setItem("emoji ✓", "🎉 line break \"quoted\"");
        localStorage.setItem("number", 42 as unknown as string);
        localStorage.setItem("removed", "x");
        localStorage.removeItem("removed");
        check("getItem", localStorage.getItem("theme"), "dark");
        check("values are strings", localStorage.getItem("number"), "42");
        check("removed key", localStorage.getItem("removed"), null);
        check("length", localStorage.length, 4);
        await LocalStorage.flush();
        console.log("STORAGE_CONFORMANCE write flushed");
        localStorage.setItem("unflushed", "written at exit");
        process.exit(0);
    },
    async read() {
        check("theme", localStorage.getItem("theme"), "dark");
        check("account", JSON.parse(localStorage.getItem("account") ?? "null"), { login: "forsen", token: "oauth:abc" });
        check("unicode", localStorage.getItem("emoji ✓"), "🎉 line break \"quoted\"");
        check("exit flush", localStorage.getItem("unflushed"), "written at exit");
        check("keys", storedKeys(), ["account", "emoji ✓", "number", "theme", "unflushed"]);
        check("key out of range", localStorage.key(99), null);
        localStorage.removeItem("account");
        localStorage.setItem("theme", "light");
        await LocalStorage.flush();
        process.exit(0);
    },
    async signal() {
        localStorage.setItem("late", "saved on SIGTERM");
        console.log("STORAGE_CONFORMANCE signal ready");
    },
    async corrupt() {
        check("corrupt file starts empty", localStorage.length, 0);
        localStorage.setItem("fresh", "1");
        await LocalStorage.flush();
        process.exit(0);
    },
    async clear() {
        check("loaded before clear", localStorage.getItem("fresh"), "1");
        localStorage.clear();
        check("cleared", localStorage.length, 0);
        localStorage.setItem("after-clear", "1");
        await LocalStorage.flush();
        process.exit(0);
    },
    async memory() {
        check("not persistent", LocalStorage.isPersistent(), false);
        check("no path", LocalStorage.getPath(), null);
        localStorage.setItem("k", "v");
        check("in-memory value", localStorage.getItem("k"), "v");
        await LocalStorage.flush();
        process.exit(0);
    },
};

function App() {
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#18181b" }}>
            <Text style={{ color: "#fafafa", fontSize: 14 }}>localStorage conformance: {phase}</Text>
        </View>
    );
}

AppRegistry.registerComponent("local-storage-conformance", () => App);
AppRegistry.runApplication("local-storage-conformance", { width: 360, height: 120 });

const run = phases[phase];
if (!run) {
    console.error(`STORAGE_CONFORMANCE unknown phase ${JSON.stringify(phase)}`);
    process.exit(1);
} else {
    run().catch((error) => {
        console.error(`STORAGE_CONFORMANCE ${phase} threw ${error instanceof Error ? error.stack : String(error)}`);
        process.exit(1);
    });
}
