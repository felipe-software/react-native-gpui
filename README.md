# react-native-gpui

Write React Native components — render them natively with
[GPUI](https://www.gpui.rs/), Zed's GPU-accelerated Rust UI framework. No
browser, no Electron: a real `react-reconciler` drives a GPUI window on Metal,
with a typed component surface mirroring React Native (`View`, `Text`,
`Pressable`, `ScrollView`, `TextInput`, `Svg`, `WebView`, `StyleSheet`).

The package and full documentation live in [`ts/`](ts/README.md). The Rust
renderer service is in [`rust/`](rust/).

```sh
bun add @felipe-software/react-native-gpui react
bun run rngpui run app.tsx
```

Runs on macOS arm64 (Metal) and Linux x86_64 or arm64 (Vulkan, Wayland or X11). MIT licensed.
