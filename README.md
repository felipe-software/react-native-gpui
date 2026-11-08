# react-native-gpui

Write React Native components — render them natively with
[GPUI](https://www.gpui.rs/), Zed's GPU-accelerated Rust UI framework. No
browser, no Electron: a real `react-reconciler` drives a GPUI window on Metal,
with a typed component surface mirroring React Native (`View`, `Text`,
`Pressable`, `ScrollView`, `TextInput`, `Svg`, `WebView`, `StyleSheet`).

The package and full documentation live in [`ts/`](ts/README.md). The Rust
renderer service is in [`rust/`](rust/).

```sh
npm install react-native-gpui
```

Runs on macOS arm64 (Metal) and Linux x86_64 (Vulkan, Wayland or X11). MIT licensed.
