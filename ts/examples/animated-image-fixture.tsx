import { AppRegistry, Image, Text, View } from "../src/index";

const animatedTiles = [
    { label: "GIF", testID: "animated-gif", uri: new URL("./assets/animated-frames.gif", import.meta.url).pathname },
    { label: "WebP", testID: "animated-webp", uri: new URL("./assets/animated-frames.webp", import.meta.url).pathname },
];
const stillTile = { label: "PNG", testID: "still-png", uri: new URL("./assets/avatar.png", import.meta.url).pathname };
const stillOnly = process.env.RNGPUI_ANIMATED_IMAGE_FIXTURE === "still";
const tiles = stillOnly ? [stillTile] : [...animatedTiles, stillTile];

function App() {
    return (
        <View style={{ flex: 1, flexDirection: "row", gap: 24, padding: 20, backgroundColor: "#18181b" }}>
            {tiles.map((tile) => (
                <View key={tile.testID} style={{ alignItems: "center", gap: 6 }}>
                    <Image testID={tile.testID} source={{ uri: tile.uri }} style={{ width: 96, height: 96, borderRadius: 8 }} />
                    <Text style={{ color: "#d4d4d8", fontSize: 12 }}>{tile.label}</Text>
                </View>
            ))}
        </View>
    );
}

AppRegistry.registerComponent("animated-image-fixture", () => App);
AppRegistry.runApplication("animated-image-fixture", { width: 420, height: 160 });
