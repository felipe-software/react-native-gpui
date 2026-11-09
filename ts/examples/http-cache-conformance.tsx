import { AppRegistry, Image, ImageCache, Text, View } from "../src/index";

const env = process.env;
const server = env.RNGPUI_TEST_HTTP ?? "";
const phase = env.RNGPUI_TEST_PHASE ?? "first";
const setUrl = `${server}/set.json`;
const emoteUrl = `${server}/emote.png`;
const avatarUrl = `${server}/avatar.png`;
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
    const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
    if (ok) {
        console.log(`HTTP_CACHE_CONFORMANCE ${phase} ${label} PASS${suffix}`);
        return;
    }
    failures += 1;
    console.error(`HTTP_CACHE_CONFORMANCE ${phase} ${label} FAIL${suffix}`);
}

async function read(init?: RequestInit): Promise<{ status: number; body: string }> {
    const response = await fetch(setUrl, init);
    return { status: response.status, body: await response.text() };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function firstLaunch() {
    const miss = await read({ cache: "only-if-cached" });
    check("only-if-cached misses an empty cache with 504", miss.status === 504, miss);
    const fresh = await read({ cache: "reload" });
    check("reload goes to the network and stores", fresh.status === 200 && JSON.parse(fresh.body).version === 1, fresh);
    const cached = await read({ cache: "only-if-cached" });
    check("only-if-cached then hits the stored copy", cached.status === 200 && cached.body === fresh.body, cached);
    const forced = await read({ cache: "force-cache" });
    check("force-cache serves the stored copy", forced.status === 200 && forced.body === fresh.body, forced);
    const plain = await read();
    check("default fetch still reaches the network", plain.status === 200, plain);
    const revalidated = await read({ cache: "no-cache" });
    check("no-cache revalidates and serves the body on 304", revalidated.status === 200 && revalidated.body === fresh.body, revalidated);
    check("ImageCache.prefetch loads a remote image", await ImageCache.prefetch(emoteUrl));
    check("ImageCache.prefetch reports a broken image", !(await ImageCache.prefetch(`${server}/missing.png`)));
}

async function secondLaunch() {
    const cached = await read({ cache: "only-if-cached" });
    check("the stored copy survives a relaunch", cached.status === 200 && JSON.parse(cached.body).version === 1, cached);
    const revalidated = await read({ cache: "no-cache" });
    check("no-cache after a relaunch revalidates", revalidated.status === 200 && revalidated.body === cached.body, revalidated);
    check("a cached image prefetches without the network", await ImageCache.prefetch(emoteUrl));
}

async function isolatedLaunch() {
    await read({ cache: "reload" });
    const miss = await read({ cache: "only-if-cached" });
    check("test mode without RNGPUI_CACHE_DIR keeps nothing", miss.status === 504, miss);
    check("images still load without a cache", await ImageCache.prefetch(emoteUrl));
}

async function main() {
    if (phase === "first") await firstLaunch();
    else if (phase === "second") await secondLaunch();
    else await isolatedLaunch();
    await sleep(1500);
    console.log(`HTTP_CACHE_CONFORMANCE ${phase} done failures=${failures}`);
    process.exit(failures === 0 ? 0 : 1);
}

function App() {
    return (
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#18181b" }}>
            <Image testID="avatar" source={{ uri: avatarUrl }} style={{ width: 64, height: 64 }} />
            <Text style={{ color: "#fafafa", fontSize: 14, marginLeft: 12 }}>http cache conformance</Text>
        </View>
    );
}

AppRegistry.registerComponent("http-cache-conformance", () => App);
AppRegistry.runApplication("http-cache-conformance", { width: 360, height: 120 });
main().catch((error) => {
    console.error(`HTTP_CACHE_CONFORMANCE threw ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
});
