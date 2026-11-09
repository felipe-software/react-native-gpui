# react-native-gpui

Write **React Native** components — render them **natively** with [GPUI](https://www.gpui.rs/) (Zed's GPU-accelerated Rust UI framework). No browser, no Electron, no mobile host. Your React tree is reconciled into a GPUI window on Metal (macOS) or Vulkan (Linux), with a real `react-reconciler` (so hooks, state, and effects all work) and a typed component surface that mirrors React Native.

It also supports the **"native shell, web content"** hybrid: embed a native `WebView` (WKWebView via `wry`) anywhere in the tree for web-grade content with native scroll + selection, while the rest of the UI stays native GPUI.

```tsx
import { AppRegistry, View, Text, Pressable, StyleSheet } from "@felipe-software/react-native-gpui";
import { useState } from "react";

function App() {
  const [n, setN] = useState(0);
  return (
    <View style={s.root}>
      <Text style={s.h1}>Hello from GPUI 👋</Text>
      <Pressable style={s.btn} onPress={() => setN((c) => c + 1)}>
        <Text style={s.btnText}>tapped {n}×</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1e1e2e", gap: 16 },
  h1: { color: "#e6e6ef", fontSize: 24, fontWeight: "700" },
  btn: { backgroundColor: "#8a5cf6", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

AppRegistry.registerComponent("App", () => App);
AppRegistry.runApplication("App");
```

```sh
bun add @felipe-software/react-native-gpui react
bun run rngpui run app.tsx
```

## Install

```sh
bun add @felipe-software/react-native-gpui react
```

The package brings its own renderer: npm, Bun, pnpm and Yarn install the one platform
package that matches your machine from its `optionalDependencies`, so do not install with
`--omit=optional` / `--no-optional`. Your app's own `react` (19 or newer) is the only React in
the bundle; the library declares it as a peer dependency.

| Platform | Package | Built on |
| --- | --- | --- |
| Linux x86_64 | `@felipe-software/react-native-gpui-linux-x64` | Ubuntu 24.04 (glibc 2.39 or newer) |
| Linux arm64 | `@felipe-software/react-native-gpui-linux-arm64` | Ubuntu 24.04 (glibc 2.39 or newer) |
| macOS Apple silicon | `@felipe-software/react-native-gpui-darwin-arm64` | macOS 14 |

Each platform package holds `rngpui-service` and `ui-runtime.js`; there is no
Intel macOS build. The CLI and the bundler run on [Bun](https://bun.sh) 1.3 or newer.

**Linux runtime.** The service loads WebKitGTK's JavaScriptCore at startup
(`libjavascriptcoregtk-4.1`, `-6.0` or `-4.0`, whichever is installed) and needs a Vulkan
driver, `libwayland-client` (Wayland), `libxkbcommon-x11` (X11) and ALSA. GNOME desktops
already ship them; elsewhere:

```sh
# Debian 13 / Ubuntu 24.04
sudo apt install libjavascriptcoregtk-4.1-0 libvulkan1 mesa-vulkan-drivers libxkbcommon-x11-0 libasound2t64
# Fedora
sudo dnf install javascriptcoregtk4.1 vulkan-loader mesa-vulkan-drivers libxkbcommon-x11 alsa-lib
```

## Bundle and run

An app is one entry file. Bun bundles it into a single script and `rngpui-service` runs that
script in JavaScriptCore:

```sh
rngpui run app.tsx                          # bundle (production) and open the window
rngpui run app.tsx --dev --size 1280x800    # development React, window size
rngpui bundle app.tsx dist/app.js           # just write the bundle (add --dev for development)
rngpui run --bundle dist/app.js             # run a bundle you built earlier
rngpui dev --launch app.tsx --root src      # Fast Refresh while you edit
```

Run them with `bun run rngpui …` or from a `package.json` script, which only use the copy in
your `node_modules`. The bundler
resolves packages from the entry's directory upward, so it uses your app's `node_modules`, and
both `@felipe-software/react-native-gpui` and `react-native` resolve to the same renderer.
Imports of the old unscoped name `react-native-gpui` bundle too; for TypeScript, map it with
`"paths": { "react-native-gpui": ["./node_modules/@felipe-software/react-native-gpui"] }` or
install the package under that name (`bun add react-native-gpui@npm:@felipe-software/react-native-gpui`).

`rngpui run` finds the renderer the same way every launcher here does: `RNGPUI_SERVICE` if set,
otherwise the installed platform package. A custom launcher can ask for the same path:

```js
import { resolveServiceBinary } from "@felipe-software/react-native-gpui/scripts/service-binary.mjs";

const { path } = resolveServiceBinary(); // spawn it with RNGPUI_BUNDLE=<your bundle>
```

`react-native-reanimated` runs from a copy prebuilt into the package, so do not install
reanimated yourself. Worklets in your own code (`useAnimatedStyle`, `withSpring`, …) need the
worklets Babel transform at bundle time:
`bun add -d @babel/core @babel/plugin-syntax-jsx @babel/preset-typescript react-native-worklets@0.8.1`.

## How it works

```
React tree ──► react-reconciler ──► serialized node tree ──► __rngpui_applyTree()
                                                                    │
                                                              rngpui-service
                                                     Rust + GPUI + JavaScriptCore
                                                                    │
   onPress / onChangeText / onLayout / resize  ◄──── __rngpui_onHostEvent()
```

The TypeScript side is bundled to a self-contained JS file and evaluated inside the native
service via system JavaScriptCore. React reconciles your components into a flat node tree; host globals pass
commits and UI events in memory between JavaScriptCore and GPUI. Stable element ids keep
native state (text-input contents, scroll offsets, web views) alive across
re-renders.

## Components

| Layout / display | Input / touch | Lists | Native content |
| --- | --- | --- | --- |
| `View` `Text` `ScrollView` `SafeAreaView` `KeyboardAvoidingView` | `TextInput` `Pressable` `TouchableOpacity` `TouchableHighlight` `TouchableWithoutFeedback` `Button` `Switch` | `FlatList` `SectionList` `ChatList` | `Image` `Svg` `WebView` |

APIs: `StyleSheet`, `Dimensions`, `useWindowDimensions`, `Platform`, `PixelRatio`, `useColorScheme`, `AppRegistry`, `createRoot` / `render`, [`Window`](#windows), `AppState` / `useAppState` / `useWindowFocused`, plus the [platform services](#platform-services) (`localStorage`, `Notifications`, `Sound`, `Processes`, `NativeClipboard`, `fetch`, `crypto`, `ImageCache`).

- **Real text input** (`TextInput`) is backed by [gpui-component](https://github.com/longbridge/gpui-component)'s editor: selection, IME, copy/paste, word motion, multiline. Resolved `style.color` and `placeholderTextColor` paint through the native editor. `onChange.nativeEvent` includes `isComposing` and `eventCount`, so controlled inputs can preserve native marked text while React commits catch up.
- **Text truncation** follows React Native's `numberOfLines`: one-line labels truncate with ellipsis, and multi-line labels are line-clamped.
- **Native portals** (`PortalProvider`, `Portal`, `PortalHost`) render overlay content at the matching host during GPUI serialization, so Tamagui Dialog/Popover/Sheet can avoid extra state-driven portal fallbacks.
- **RN-style measurement** (`measure`, `measureInWindow`, `measureLayout`) is exposed on host refs. Floating overlay libraries such as Tamagui's Popover/Select can measure trigger and content nodes without app-specific adapters.
- **RN Animated** runs JS-frame animations through React commits; animated styles resolve to plain GPUI styles each frame.
- **Native layout overrides** (`nativeLayoutKey`, `nativeResize`, `NativeLayout`) let narrow chrome interactions such as pane resizing mutate GPUI layout in the native service without a React commit per pointer frame.
- **Styling** matches RN: flexbox (Yoga semantics — `flex:1`, `%`, `auto`), `backgroundColor`, gradients via `backgroundImage`, `boxShadow` / iOS `shadow*` / `elevation`, `borderRadius`, `overflow: scroll`, `opacity`.
- **`Svg`** renders a monochrome icon tinted by `style.color`.
- **Keyboard**: the first `onKeyPress` listener of a window (outside text inputs) receives
  every key typed in that window, and Ctrl, Shift, Alt or Meta pressed on its own arrives
  as `Control`, `Shift`, `Alt` or `Meta`. `onKeyUp` reports releases the same way.
- **Middle click**: `onAuxClick` fires when the middle button is pressed and released on
  the same view (`nativeEvent.button` is 1).
- **Press-drag scrubbing**: a press on a view with `onMouseUp`/`onClick`/`onPress` that
  drags across another such view presses it (menus, list rows), scoped by
  `nativeListGroup`. `nativePressDrag={false}` takes a view and its descendants out of it,
  for drag handles whose child buttons must not fire when the drag crosses them.
- **Colors**: every CSS named color and `transparent` (for `color`, `backgroundColor` and
  `borderColor`).

## Windows

`<Window>` opens a real OS window that this app's React tree renders into. The window is
another GPUI window inside the same service, drawn from the same JavaScript runtime and
reconciler, so its children share every context, store and piece of state with the rest
of the app, and live data (a chat feed, a socket) updates both windows at once.
Mounting opens the window; unmounting closes it.

```tsx
import { useState } from "react";
import { Window, Text, TextInput, View } from "react-native-gpui";

function UserCardHost({ user }: { user: User }) {
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Window
      kind="popup"
      title={`${user.name}'s Usercard`}
      width={420}
      height={470}
      position={{ x: -140, y: -94, relativeTo: "cursor" }}
      closeOnBlur={!pinned}
      onClose={({ reason }) => setOpen(false)}
    >
      <UserCard user={user} pinned={pinned} onPin={setPinned} />
    </Window>
  );
}
```

| Prop | Meaning |
| --- | --- |
| `title`, `width`, `height` | Window title and content size (the platform frame, or the Linux client-side frame, comes on top). |
| `minWidth`, `minHeight` | Minimum content size. |
| `kind` | `"normal"` (default), `"dialog"` (transient for the main window, closes on Escape) or `"popup"` (frameless, closes on Escape and when it loses focus). |
| `position` | `"center"` on the main window (default for normal and dialog windows), `"cursor"` (default for popups), or `{ x, y, relativeTo }` for the content's top-left corner relative to the main window's content (`"parent"`, default), the screen, or the cursor. Windows are kept on the display; a cursor-placed window that would run off the bottom-right corner opens above the cursor. |
| `resizable`, `alwaysOnTop` | Default resizable except popups. `alwaysOnTop` keeps the window above others on macOS and X11. |
| `closeOnBlur`, `closeOnEscape` | Override the kind's defaults. |
| `onClose({ reason })` | The window asked to close: `"system"` (the OS or title-bar close button), `"escape"`, `"blur"` or `"error"` (it could not be created). Unmount the `<Window>` to close it; without `onClose` it closes itself. |
| `onFocus`, `onBlur`, `onResize({ width, height })` | Activation and size changes. |
| `testID` | Names the window for `rngpui --window`. |

Inside a window, `useWindowDimensions()` returns that window's size and
`useWindowFocused()` whether it has focus. A ref (`WindowHandle`) has `windowId` and
`focus()`.

- Each window has its own hit testing, focus, keyboard shortcuts (`AppCommands` bindings
  fire in whichever window has focus), text inputs, `ChatList`s, theme, layout and frame
  pacing: a window repaints only when its own tree, input or animation changes, and the
  main window keeps its retained-layout fast path while secondary windows lay out in full.
- Wayland does not let a client place its toplevel windows, so `position` is ignored
  there and the compositor places the window. X11 and macOS honor it. `alwaysOnTop` has
  no Wayland protocol either.
- On GNOME (no server-side decorations) normal windows and dialogs get the client-side
  title bar, border and resize edges, and its close button reports `reason: "system"`.
  KWin draws server-side decorations. Popups are frameless everywhere.
- Closing the main window quits the app and closes every other window.
- `NativeWindow.open()` still starts a separate process with its own JavaScript state; use
  `<Window>` for windows that belong to the running app.

`AppState.currentState` is `"active"` while one of the app's windows has focus and
`"inactive"` otherwise; `AppState.addEventListener("change" | "focus" | "blur", …)` and
`useAppState()` follow it. `AppState.addEventListener("windowFocus", ({ windowId, focused }))`
reports each window, the main window as id 0.

`bun run conformance:multi-window` opens a dialog, a window with a `ChatList` and a popup
in one service and checks per-window trees, pixels, real clicks and keys, shared state,
Escape / title-bar / focus-loss / unmount closing, and that closing leaks no nodes or
native state.

## Native surfaces

For app chrome that needs native glass or GPUI shader-backed effects, use the
surface components instead of baking app-specific behavior into the renderer:

```tsx
import {
  LiquidGlassBackground,
  SmokeEffectSurface,
  View,
} from "react-native-gpui";

export function Shell({ children }) {
  return (
    <View style={{ flex: 1, borderRadius: 32, overflow: "hidden" }}>
      <LiquidGlassBackground
        radius={32}
        material="underWindowBackground"
        glassVariant="controlCenter"
      />
      <SmokeEffectSurface
        pointerEvents="none"
        radius={32}
        alpha={0.9}
        reach={0.28}
        topClear={0.06}
      />
      {children}
    </View>
  );
}
```

`LiquidGlassBackground` / `LiquidGlassView` wrap native `SystemView` glass.
`EffectSurface` / `SmokeEffectSurface` are ordinary React components that set
`backgroundImage` to renderer effects such as `smoke(...)`. Apps can tune these
from React props while the renderer owns only the generic native primitive.

## Dev loop

`rngpui dev --launch` launches one development renderer, watches every local
module in its dependency graph, and applies edits through React Fast Refresh.
Compatible component state, the native window, focus, scroll position, and
renderer-owned state stay in place. A transform or evaluation error is printed
without killing the running app, so the next valid edit can recover it.

```sh
rngpui dev --launch app/index.tsx --root app --root packages/ui
```

An owned external instance can use the same Fast Refresh path by providing its
control socket, build command, output bundle, and watched roots:

```sh
rngpui dev \
  --socket /tmp/my-app.control.sock \
  --bundle native-shell/.gpui/hot-update.js \
  --build "NODE_ENV=development bun native-shell/scripts/bundle-app-gpui.mjs native-shell/app.tsx native-shell/.gpui/hot-update.js" \
  --root app --root interface --root native-shell
```

There is one development reload contract. RNGPUI does not fall back to process
signals or remount the application when a Fast Refresh update fails.

`rngpui get windows` lists the windows a service shows (id, kind, title, `testID`,
bounds, nodes, frames painted). `--window <id | main | testID | kind | title>` aims
`get`, `do`, `trace` and `reshot` at one of them:

```sh
rngpui get windows --session /tmp/rngpui-cli-abc123
rngpui do tap dialog-increment --window fixture-dialog --session /tmp/rngpui-cli-abc123
rngpui reshot --window popup --session /tmp/rngpui-cli-abc123 --out /tmp/popup.png
```

## Native diff

`Diff` parses and virtualizes a unified patch in the renderer. Large patches do
not create one React node per line.

```tsx
<Diff
  patch={unifiedPatch}
  wordDiff
  scroll
  maxLines={20_000}
  collapsedPaths={["generated/output.ts"]}
  onToggleFile={({ nativeEvent }) => toggle(nativeEvent.value)}
  onShowMore={() => setExpanded(true)}
  onLineClick={({ nativeEvent }) => {
    openLine(nativeEvent.value, nativeEvent.oldLine, nativeEvent.newLine)
  }}
  style={{ height: 520, fontFamily: "Menlo", fontSize: 12 }}
/>
```

## Native chat list

`ChatList` is a virtualized chat log drawn by the renderer, built for Twitch-style
clients. Messages never travel as props: the ref's methods stream them into the native
element, so an append costs only the new messages. The element keeps up to
`maxMessages` (default 1000, oldest dropped), lays out and paints only visible rows,
and caches each message's layout until its width, font, scale or content changes.

```tsx
import { useEffect, useRef } from "react";
import { ChatList, type ChatListHandle, type ChatListMessage } from "react-native-gpui";

const message: ChatListMessage = {
  id: "msg-1",
  timestamp: "12:00",
  marker: "#ff2d2d",
  elements: [
    { kind: "badge", name: "moderator", url: badgeUrl, width: 18, height: 18, tooltip: "Moderator" },
    { kind: "user", text: "alice:", login: "alice", color: "#ff4040" },
    { kind: "text", text: "hello world" },
    { kind: "emote", name: "Kappa", url: kappaUrl, width: 28, height: 28 },
  ],
};

function Channel({ chat }: { chat: ChatSource }) {
  const list = useRef<ChatListHandle>(null);
  useEffect(() => {
    list.current?.prepend(chat.history());
    return chat.onMessages((messages) => list.current?.append(messages));
  }, [chat]);
  return (
    <ChatList
      ref={list}
      style={{ flex: 1, backgroundColor: "#191919" }}
      fontSize={13}
      showTimestamps
      textColor="#ffffff"
      mutedColor="#8c7f7f"
      linkColor="#4286f4"
      pauseOnHover
      onPress={({ nativeEvent }) => {
        if (nativeEvent.target === "user") openUserCard(nativeEvent.login);
        if (nativeEvent.target === "link") openUrl(nativeEvent.url);
        if (nativeEvent.button === "right") showMessageMenu(nativeEvent.messageId, nativeEvent.x, nativeEvent.y);
      }}
      onHover={({ nativeEvent }) => setTooltip(nativeEvent)}
      onScrollState={({ nativeEvent }) => setMoreBelow(nativeEvent.atBottom ? 0 : nativeEvent.unseen)}
    />
  );
}
```

When a moderator deletes the message, patch it in place (`hidden: true` removes it from
the layout instead, like Chatterino's "hide moderated messages"):

```tsx
list.current?.update([{ id: "msg-1", disabled: true }]);
```

- Message flags: `disabled` and `historical` fade a message, `hidden` takes it out of the
  layout until a patch sets it back, `background` fills the row, `marker` colors its
  scrollbar tick. A badge's `background` paints behind its image (FFZ's custom moderator
  badge).

- Handle: `append`, `prepend` (history, oldest first), `update` (patches by `id`; pass
  `""` to clear a string or color field), `clear`, `scrollToBottom`, `scrollToTop`,
  `scrollToMessage(id, { align: "top" | "center" | "bottom" })` (default center),
  `pageUp`, `pageDown` (one viewport, for the app's Page Up / Page Down keys).
- Elements are separated by one space; whitespace inside a text element separates words.
  Set `trailingSpace: false` on an element to glue the next one to it (`@alice` + `,`).
- Layout follows Chatterino: 8/4 px margins, elements bottom-aligned per line, emotes
  count as 4 px shorter than they are (they overhang 2 px above and below), badges are not
  scaled by `emoteScale`, zero-width emotes are centered over the previous emote, and a
  `reply` renders as one truncated line at 0.8× size with a curve.
- Images load through GPUI's image cache (http(s) URLs or file paths). Animated GIF and
  WebP play while visible; the list schedules one repaint for the earliest frame change,
  and an idle list without visible animation does not repaint.
- Scrolling: wheel/trackpad, a thin scrollbar that widens on hover and shows `marker`
  colors. At the bottom the list follows new messages; scrolled up, appends, prepends
  and trimming keep the rows you are reading in place, and `onScrollState` reports
  `{ atBottom, paused, unseen }`. `pauseOnHover` freezes the view while the pointer is
  over the list.
- Interaction: `onHover` fires with the user, link, emote or badge under the pointer, its
  window-space bounds and the pointer position (`pointerX`, `pointerY`), or `null` when
  it leaves, so tooltips can be React overlays. `onPress` fires for user/link/emote/badge,
  or `message` for anything else, with the button, pointer position and modifier keys
  (`shiftKey`, `ctrlKey`, `altKey`, `metaKey`). Left clicks fire on release unless the pointer moved more
  than 15 px (that was a selection); right and middle clicks fire on press.
- Selection: drag selects across messages, double-click selects a word, triple-click
  selects the message body. Ctrl+C (Cmd+C on macOS) copies it, including while a
  `TextInput` is focused, unless that input holds a newer selection of its own. Emotes
  copy as their names, badges copy nothing.

`bun run conformance:chat-list` checks wrapping, emote placement, timestamps, events,
selection, copy and scroll anchoring against real pixels and bounds.
`bun run perf:chat-list` measures 6 lists × 1000 messages at 20 messages/s.

Use `PerformanceHUD.setEnabled(true)` or `rngpui do hud on` for the native
frame/layout/paint overlay. `Renderer.getProvenance()` and
`rngpui get provenance` report the exact renderer, service, GPUI, JavaScriptCore, and
bundle identity.

## Native inspector

Enable the GPUI node inspector for any root:

```tsx
render(<App />, { devtools: { inspector: true } })
```

or set `RNGPUI_INSPECTOR=1` before launching. Hold Option while the window is
focused to highlight the native node under the pointer. Option-click copies a
compact snapshot with node id/type, bounds, event names, accessibility metadata,
text/value snippets, style facts, and the ancestor chain.

## The WebView hybrid

```tsx
<View style={{ flex: 1 }}>
  {/* native shell: sidebar, header, composer … */}
  <WebView style={{ flex: 1 }} source={{ html: myMarkdownHtml }} />
  {/* …or source={{ uri: "https://…" }} */}
</View>
```

The `WebView` is a real native web view composited inside the GPUI window — you get web-grade rendering and **native scroll momentum + selection** for the content area while the shell stays native. Re-render it from React state like any other component.

### Messaging (two-way)

`source` re-renders the whole document, so for live content drive it with messages instead:

```tsx
const ref = useRef<WebViewHandle>(null)

<WebView
  ref={ref}
  source={{ html }}
  onLoad={() => ref.current?.injectJavaScript("startStreaming()")}
  onMessage={(e) => handle(e.nativeEvent.data)}  // page → host
/>

// host → frame:
ref.current?.injectJavaScript("appendToken('…')")  // run JS in the page (no reload)
ref.current?.postMessage("payload")                // → a 'message' event in the page
ref.current?.reload()
```

Inside the page, talk back to the host with the React-Native bridge global (injected automatically):

```js
window.ReactNativeWebView.postMessage("hello from the page")   // → onMessage
window.addEventListener("message", (e) => { /* host postMessage */ })
```

## Platform services

Desktop services an app needs beyond rendering. Each one runs off the JS thread in the
native service and resolves a promise when it is done.

```tsx
import { ImageCache, LocalStorage, Notifications, Processes, Sound, randomUUID } from "react-native-gpui";

localStorage.setItem("accounts", JSON.stringify(accounts)); // survives restarts
await LocalStorage.flush();                                  // optional: write now

const shown = await Notifications.show({ title: "forsen mentioned you", body: message });
await Sound.play();                                // built-in "ping"
await Sound.play("/home/me/sounds/mention.wav", { volume: 0.6 });
await Sound.play("https://example.com/alert.wav");

const streaming = (await Processes.findRunning(["obs", "obs64.exe"])).length > 0;
const nonce = randomUUID();

const cached = await fetch(setUrl, { cache: "only-if-cached" }); // 504 when nothing is stored
const fresh = await fetch(setUrl, { cache: "reload" });           // network, then stored on disk

ImageCache.preconnect(["https://cdn.7tv.app"]);   // open the HTTP/2 connection early
await ImageCache.prefetch(emoteUrls);             // download + decode before the first paint
```

| API | Behavior |
| --- | --- |
| `localStorage` | The synchronous Web Storage API. Loaded once at startup and written back atomically (temp file + rename, 0600) 250ms after the last change, at most 2s late, and again on exit, `SIGTERM`/`SIGINT`/`SIGHUP`, reload, and before `NativeWindow.open()`. Changes from two processes of the same app merge per key. An unreadable file is moved aside as `local-storage.json.corrupt-<ms>` and the store starts empty. |
| `LocalStorage.flush(): Promise<void>` | Writes pending changes now. `LocalStorage.getPath()` returns the backing file (or `null`), `LocalStorage.isPersistent()` whether there is one. |
| `Notifications.show({ title, body? }): Promise<boolean>` | Linux: `org.freedesktop.Notifications` over D-Bus (body markup is escaped when the server renders markup). macOS: `osascript display notification`. Resolves `false` when nothing could show it; rejects without a title. |
| `Sound.play(source = "ping", { volume? }): Promise<void>` | `"ping"` is synthesized; otherwise a file path, `file://` URL, or `http(s)` URL (URL sounds are cached in memory). Sources are capped at 32 MiB and 8 sounds play at once. Decodes WAV (8/16/24/32-bit PCM, 32/64-bit float); other formats reject with the reason. Resolves when playback ends. |
| `Processes.findRunning(names): Promise<string[]>` | The given names that match a running process, compared case-insensitively against the process name and its executable's file name (Linux `/proc/*/comm` and `cmdline`, macOS `ps`). |
| `fetch` | `Response` has `status`, `statusText`, `ok` (2xx), `url` (after redirects), `redirected`, `headers` (`get`/`has`/`forEach`/`entries`/`keys`/`values`, iterable), `text()`, `json()`, `arrayBuffer()`, `clone()`. Bodies may be strings, `URLSearchParams`, `ArrayBuffer`, or any typed array/`DataView`; network errors reject with `TypeError`. |
| `fetch(url, { cache })` | GET requests use the disk cache below only when asked. `"default"` and `"no-store"` go to the network and store nothing. `"reload"` goes to the network and stores a 200. `"force-cache"` returns the stored copy at any age, else fetches and stores. `"only-if-cached"` returns the stored copy or a `504` response without touching the network. `"no-cache"` revalidates a stored copy with `If-None-Match`/`If-Modified-Since` and returns it on `304`. For stale-while-revalidate, start `only-if-cached` and `reload` together and apply each as it arrives. |
| `ImageCache.prefetch(urls): Promise<boolean>` | Downloads and decodes images into the same cache `<Image>` and `ChatList` read, so their first paint already has them. Resolves `true` when every URL loaded. |
| `ImageCache.preconnect(origins)` | Opens the HTTP/2 connection to each origin now (a `HEAD /`), so the first images from it skip the TCP and TLS handshakes. |
| `crypto.getRandomValues`, `crypto.randomUUID` | Backed by the OS random number generator; also exported as `getRandomValues()` / `randomUUID()`. |
| `NativeClipboard.read(): Promise<string>` | The clipboard's text (`""` when it holds none), read on the main thread. `NativeClipboard.setString(text)` writes it. |
| `<Image>` | Animated GIF and WebP play, redrawing only when a frame is due; still images never schedule redraws. Remote images load over HTTP/2 (one connection per host) and are kept in the disk cache, so a relaunch shows them without the network; a stored image past its `Cache-Control`/`Expires` lifetime is shown at once and revalidated in the background for the next launch. |

The data file lives at `$XDG_DATA_HOME/<app id>/local-storage.json` (default
`~/.local/share`) on Linux and `~/Library/Application Support/<app id>/local-storage.json` on
macOS. The app id is `RNGPUI_APP_ID`, else `RNGPUI_APP_NAME`, else `react-native-gpui`.

The HTTP disk cache lives in `$XDG_CACHE_HOME/<app id>/http/` (default `~/.cache`) on Linux and
`~/Library/Caches/<app id>/http/` on macOS, one file per URL named by its SHA-256. It holds 200
responses to GET requests without `Authorization`, `Cookie` or `Range`, skips `no-store`, writes
atomically (temp file + rename) so two processes of one app can share it, and evicts the least
recently used files once it passes 256 MB.

| Variable | Effect |
| --- | --- |
| `RNGPUI_STORAGE_DIR` | directory holding `local-storage.json`, overriding the data dir |
| `RNGPUI_CACHE_DIR` | directory replacing `<cache dir>/<app id>`; the HTTP cache goes in its `http/` folder |
| `RNGPUI_HTTP_CACHE=0` | turns the HTTP disk cache off |
| `RNGPUI_HTTP_CACHE_MAX_MB` | size cap of the HTTP disk cache (default 256) |
| `RNGPUI_HTTP_TRACE=1` | prints one `[rngpui-http]` JSON line per image request (`network`, `cache` or `revalidate`, timings, bytes) |
| `RNGPUI_TEST_MODE` | without `RNGPUI_STORAGE_DIR`, keeps `localStorage` in memory; without `RNGPUI_CACHE_DIR`, disables the HTTP disk cache; also suppresses real notifications and sound output |
| `RNGPUI_FAKE_NOTIFICATIONS=<file>` | append each notification as a JSON line instead of showing it |
| `RNGPUI_FAKE_SOUND_DIR=<dir>` | write each decoded sound as `sound-NNN.wav` instead of playing it |
| `RNGPUI_FAKE_CLIPBOARD=<file>` | `NativeClipboard` reads and writes this file instead of the clipboard (a headless Wayland window never receives the selection) |

## Building from source

Releases ship `rngpui-service` in the platform packages above. In a checkout, `npm run build`
writes it to `native/` instead, and every launcher uses the newer of `native/rngpui-service`
and `../rust/target/release/rngpui-service`, so a plain `cargo build` is picked up too. To
build it yourself you need a Rust toolchain. macOS supplies the JavaScriptCore framework; on Linux,
install a C/C++ toolchain and WebKitGTK's JavaScriptCore headers:

```sh
# Debian/Ubuntu (Fedora: gcc-c++ pkgconf javascriptcoregtk4.1-devel libxkbcommon-x11-devel alsa-lib-devel)
sudo apt install build-essential pkg-config libjavascriptcoregtk-4.1-dev \
  libxkbcommon-x11-dev libasound2-dev libfontconfig-dev libfreetype-dev
```

```sh
npm run build        # builds the Rust service, copies it into native/, then tsc → dist/
npm run build:rust   # just the native binary
npm run typecheck
```

Point the runtime at a specific binary with `RNGPUI_SERVICE=/path/to/rngpui-service`.
Set `RNGPUI_INSPECTOR=1` to force-enable the native inspector for any app.

`npm run npm:pack -- --out /tmp/packs` builds the two tarballs a release would publish for
this machine (the main package and its platform package) so you can install them into a test
project: `bun add react /tmp/packs/felipe-software-react-native-gpui-<version>.tgz
/tmp/packs/felipe-software-react-native-gpui-<platform>-<version>.tgz`. Until that version is
on npm, the install warns that the other platform packages are missing (404); that is
expected.

## Releasing

Releases are automated, the same way as
[react-native-back-gesture](https://github.com/felipe-software/react-native-back-gesture):

1. Merge a pull request with [conventional commits](https://www.conventionalcommits.org/)
   into `main`. `release-main.yaml` runs semantic-release, which turns `feat`, `fix`, `perf`,
   `refactor` and `revert` commits into the next patch version and pushes a `v<version>` tag
   and a GitHub release.
2. The tag starts `publish-npm.yml`. It builds `rngpui-service` on Linux x64, Linux arm64 and
   macOS arm64 (ad-hoc signed with the JIT entitlement), strips its debug info, packs the
   three platform packages and the main package at the tag's version, then publishes the
   platform packages first and the main package last, with npm provenance. Versions already
   on npm are skipped, so a failed run can simply be re-run, or started by hand with
   **Run workflow** and the tag.
3. `test.yaml` checks pull requests: typecheck, the unit tests, and `cargo test` on Linux.

The version in `package.json` is not the release version: CI sets it, and the
`optionalDependencies` on the platform packages, from the tag.

**One-time setup** (maintainers):

1. **npm scope** `@felipe-software`, owned by the `felipe-software` npm account.
2. **GitHub environment** `npm` in this repository (Settings → Environments), holding:
   - `SEMANTIC_RELEASE_GH_TOKEN`: a fine-grained personal access token for this repository with
     *Contents: read and write*. It pushes the release tag and creates the GitHub release; a
     tag pushed with the default `GITHUB_TOKEN` would not start `publish-npm.yml`.
   - `NPM_TOKEN`, for the first release only: an npm granular access token with read and write
     access to the `@felipe-software` scope. npm can only attach a trusted publisher to a
     package that already exists, so the first publish of each package uses this token.
3. **Trusted publishers.** After the first release, open each of the four packages on
   npmjs.com (`@felipe-software/react-native-gpui` and its `-linux-x64`, `-linux-arm64` and
   `-darwin-arm64` packages) → Settings → Trusted publishing → GitHub Actions, with owner
   `felipe-software`, repository `react-native-gpui`, workflow `publish-npm.yml` and
   environment `npm`. Then delete the `NPM_TOKEN` secret. npm drops trusted publisher
   settings that are never used, so set them up shortly before the next release.

## Examples

[chatterino-gpui](https://github.com/felipe-software/chatterino-gpui) is a full app built on
the npm package: a Chatterino-style Twitch chat client. The fixtures below run from a checkout:

```sh
bun run kitchen                      # the full component surface + self-validating layout
bun run conformance:animation        # Animated frame progression fixture
bun run conformance:animation:diff   # deterministic Animated PNG frame diff
bun run conformance:input            # TextInput typing, Return submit, Shift+Return newline
bun run conformance:input-runtime    # nonactivating focus, tab, IME, controlled state, latency
bun run conformance:portal           # Portal overlay and TextInput-in-portal behavior
bun run conformance:native-layout    # native layout override without React width state
bun run conformance:text-lines       # visual fixture for Text numberOfLines
bun run conformance:chat-list        # ChatList layout, events, selection, scroll anchoring
bun run perf:chat-list               # ChatList CPU and frame numbers under load
bun run conformance:local-storage    # localStorage across restarts, SIGTERM, corruption
bun run conformance:platform-services # fetch, crypto, notifications, sound, processes
bun run conformance:http-cache       # fetch cache modes, image disk cache across launches
bun run conformance:animated-image   # GIF/WebP frames advance, still images stay idle
bun run superconductor               # native shell + WebView content hybrid
```

Visual regressions can use the built-in PNG comparator:

```sh
bun run pixel-diff before.png after.png --crop 0,0,540,300 --diff-out /tmp/rngpui-diff.png
```

## Status & platform

macOS (Metal) is the reference target. GPUI builds here with the `runtime_shaders` feature.
Prebuilt renderers exist for Linux x86_64, Linux arm64 and macOS on Apple silicon (see
[Install](#install)).

Linux runs on GPUI's Vulkan renderer under Wayland or X11, picked automatically: Wayland
when `WAYLAND_DISPLAY` answers, otherwise X11. It needs a Vulkan driver (Mesa or the
vendor driver) and WebKitGTK's JavaScriptCore at runtime (`libjavascriptcoregtk-4.1`,
`-6.0` or `-4.0`, whichever is installed). Compositors that leave decorations to the
app, like GNOME, get a client-side title bar with window controls and resize edges.

| Variable | Linux effect |
| --- | --- |
| `RNGPUI_LINUX_BACKEND=wayland\|x11` | force a display backend (default `auto`) |
| `RNGPUI_LINUX_DECORATIONS=client\|server` | force client- or server-side window decorations |
| `RNGPUI_WINDOW_TITLE`, `RNGPUI_APP_ID` | window title and Wayland app id (`.desktop` matching) |
| `RNGPUI_TRANSPARENT_WINDOW=1` | skip the opaque window backdrop |
| `RNGPUI_FRAME_HZ` | `requestAnimationFrame` rate (default 60) |
| `RNGPUI_JSC_LIBRARY` | load JavaScriptCore from a specific shared library |
| `RNGPUI_FRAME_CAPTURE=1` | let the dev CLI capture frames of an app it did not launch |

Not on Linux yet: `<WebView>` renders as an empty view, `<NativeButton>`/`<NativeTextInput>`
and system materials have no AppKit to wrap, in-app backdrop blur draws its tint without the
blur, and there is no accessibility tree or dock badge.

## License

MIT
