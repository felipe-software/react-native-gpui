# react-native-gpui

## Build & test

- Typecheck the TypeScript package from `ts/`: `npm run typecheck`.
- Build the shipped package from `ts/`: `npm run build`. This builds the release
  `rngpui-service`, copies it into `ts/native/`, emits declaration files, and
  bundles `dist/index.js`.
- For runtime validation, bundle an example to JavaScript source and launch the
  single-process host. The app runtime is always `rngpui-service`; Bun is only
  the dev bundler:

```sh
cd ts
bun run scripts/bundle-app.mjs examples/kitchen-sink.tsx /tmp/kitchen.js
RNGPUI_BUNDLE=/tmp/kitchen.js RNGPUI_NO_ACTIVATE=1 ../rust/target/release/rngpui-service
```

- Every launcher finds the binary through `ts/scripts/service-binary.mjs`
  (`resolveServiceBinary()`): `RNGPUI_SERVICE`, then the installed platform package
  (`@felipe-software/react-native-gpui-<os>-<cpu>`), then, in a repo checkout, the newer of
  `ts/native/rngpui-service` (`npm run build:native`) and `rust/target/release/rngpui-service`
  (`cargo build`), then `rust/target/debug`. Add new launchers through it, never a hardcoded
  path: a stale `ts/native` binary once rendered `nativebutton` as an empty div.

## Linux

The same service runs on Linux through GPUI's Vulkan (blade) renderer, under Wayland or X11.

- Build deps: a C/C++ toolchain, `pkg-config`, WebKitGTK's JavaScriptCore headers
  (`libjavascriptcoregtk-4.1-dev`), `libxkbcommon-x11-dev`, `libasound2-dev`, and Zig 0.15.2.
  `npm run build:rust` (scripts/build-rust.mjs) checks out the Ghostty commit that
  `libghostty-vt-sys` pins into `~/.cache/rngpui/` unless `GHOSTTY_SOURCE_DIR` is set; the
  crate's own fetch cannot be used because it patches `build.zig` text that commit lacks.
- Runtime: JavaScriptCore is resolved with `dlopen` (rust/jsc_shim/jsc_loader_linux.cpp), so
  any of `libjavascriptcoregtk-4.1/6.0/4.0` works and a missing one prints install hints.
  `libghostty-vt.so.0` ships beside the binary and is found through an `$ORIGIN` rpath.
- Display: rust/src/linux_display.rs picks Wayland when its socket answers, else X11
  (`RNGPUI_LINUX_BACKEND` overrides). It probes the Wayland registry for
  `zxdg_decoration_manager_v1`; without it (GNOME) rust/src/linux_frame.rs draws the title bar
  (gpui-component `TitleBar`), border, shadow and resize edges, and the window opens larger by
  that frame so the app keeps its requested content size. Test and borderless windows skip it.
- The frame's app content must stay the FIRST child that requests layout: the retained-layout
  fast path resets the layout tree when the app view renders, so any layout node created
  before it in the same frame is invalidated (a taffy "invalid SlotMap key" panic).
- Capture: there is no CGWindowList, so the renderer reads back its own swapchain image
  (`Window::capture_next_frame`, enabled by `RNGPUI_CAPTURE_PNG`, `RNGPUI_FRAME_CAPTURE` or
  `RNGPUI_TEST_MODE`). Wayland cannot list other clients' windows either: each service writes
  `$XDG_RUNTIME_DIR/rngpui-windows/<pid>.json` after its first painted tree, and
  `conformance-utils.listWindows()` reads those. `captureWindow()` asks a service for a frame by
  writing the target path to `<pid>.capture`.
- Windows cannot be placed offscreen on Wayland. To run the suite without windows on your
  desktop, start a private compositor and point the tests at it:
  `dbus-run-session -- mutter --headless --wayland --no-x11 --wayland-display=rngpui-headless-0
  --virtual-monitor 1920x1080 &` then `WAYLAND_DISPLAY=rngpui-headless-0 bun run test`.
  Headless Mutter sends no frame callback without damage, so `native-layout` stalls there
  while passing on a real session.
- Fonts: a family Linux lacks (SF Pro, Menlo, gpui's IBM Plex Sans system font) resolves
  through `fc-match` to `system-ui` or `monospace` (vendor divergence 12), so bold and
  monospace text survive. Glyphs still differ from macOS because the faces differ; register the
  app's own fonts with `RNGPUI_FONT_DIR` when text must match pixel for pixel.
- Gates that drive macOS-only tools (cua-driver, pbcopy, swift/sips) or WKWebView are marked
  `platforms: ["darwin"]` in scripts/test-suite.mjs and skipped elsewhere.
- Not on Linux yet: `<WebView>` (wry can only embed into X11 windows), AppKit native controls,
  system materials, in-app backdrop blur (the tint draws, the blur does not), accessibility.

## Platform services (localStorage, notifications, sound, processes, fetch, crypto)

TS surface: `ts/src/platform-services.ts` (`LocalStorage`, `Notifications`, `Sound`,
`Processes`, `getRandomValues`, `randomUUID`); the web globals live in
`rust/src/jsc_preamble.js`. User docs: the "Platform services" section of `ts/README.md`.

- **One async bridge.** `globalThis.__rngpui_platformRequest(op, args)` (preamble) calls the
  host fn `__rngpui_platformCall({id, op, args})`; `rust/src/platform_services.rs` runs the op
  on its own thread and answers through `__rngpui_platformDone`, which `jsc::queue_class`
  files as an async completion. Ops: `notifications.show`, `sound.play`,
  `processes.findRunning`, `storage.flush`, `clipboard.read`. Add a service by adding an op
  there, not a new host fn. `clipboard.read` is the one op that hops to the main thread
  (`Incoming::ClipboardRead` through `crate::send_incoming`), because the clipboard belongs
  to the windowing system; `RNGPUI_FAKE_CLIPBOARD=<file>` reads and writes a file instead.
- **localStorage** (`rust/src/storage.rs`). The React runtime gets the parsed file as
  `globalThis.__rngpuiStorage` in the env script, and every mutation crosses
  `__rngpui_storageWrite(["set"|"remove"|"clear", ...])` into a per-key pending map. A writer
  thread commits 250ms after the last change (2s at most) under an `flock` on
  `local-storage.json.lock`: re-read the file, apply the pending map, write a 0600 temp file,
  fsync, rename. Re-reading is what lets two processes of one app (`NativeWindow.open()`)
  keep each other's keys. Commits also run from `atexit` (covers `process.exit`, `cx.quit()`,
  the orphan watchdog), from a self-pipe thread on SIGTERM/SIGINT/SIGHUP (which then
  re-raises the signal so exit status is unchanged), before the reload `exec`, and before
  `OpenWindow` spawns. A file that fails to parse is renamed to
  `local-storage.json.corrupt-<ms>`, never overwritten. `RNGPUI_TEST_MODE` without
  `RNGPUI_STORAGE_DIR` keeps it in memory, so no harness launch (the CLI, `run-example`,
  `conformanceEnv`) can touch a real data dir. The worklet runtime's `localStorage` is
  always in-memory.
- **Notifications** use zbus 5's async API under `futures::executor::block_on` (zbus is
  built without `blocking-api`, the same build ashpd uses), with an 8s timeout. Body text is
  markup-escaped only when `GetCapabilities` lists `body-markup`. The unit test starts a
  private `dbus-daemon` with a fake server; never point tests at the session bus. macOS
  passes title/body as `osascript` arguments (`item n of argv`), so no AppleScript quoting.
- **Sound** decodes WAV only (no decoder crates in the tree); MP3/Ogg/FLAC reject with a
  named reason. Playback opens a cpal output stream per sound at the device's default
  config (resampled and channel-mapped in `render`), at most 8 at once.
- **Test seams.** `RNGPUI_TEST_MODE` never shows a notification (resolves `false`) or opens
  an output device. `RNGPUI_FAKE_NOTIFICATIONS=<file>` and `RNGPUI_FAKE_SOUND_DIR=<dir>`
  record what would have been shown or played.
- **Processes** match case-insensitively on `/proc/<pid>/comm` and the basename of argv[0].
  `comm` is cut to 15 bytes, so a longer name also matches a 15-byte comm it starts with.
- **fetch** returns every response header (repeated ones joined with ", "), `statusText`,
  the post-redirect `url`, and the body as text, or as base64 when it is not UTF-8. `ok` is
  2xx only and network failures reject with `TypeError`, as in browsers. It runs on ureq
  (gzip) through one shared agent, and honors `cache` modes against the HTTP disk cache (see
  "HTTP: image client, disk cache, fetch cache modes" below).
- **crypto** reads 32 bits per `__rngpui_random32` call from a getrandom-filled pool.
- **Animated `<Image>`.** GPUI keeps GIF/WebP frame state only for an `img` with an element
  id, so `rust/src/elements/image.rs` gives the inner img one keyed by a hash of the source.
  A source change then starts fresh frame state, so a stale frame index cannot outrun a
  shorter animation. Vendored GPUI divergence 13 (`rust/Cargo.toml`) paces redraws to frame
  delays: without it a visible GIF repainted at ~400fps under headless Mutter; with it, a
  150ms-per-frame GIF paints ~7fps and a still image paints nothing while idle.

Gates: `bun run conformance:local-storage`, `conformance:platform-services` (local HTTP server,
fake sound/notification sinks, a copied `sleep` as the probe process),
`conformance:animated-image` (`shot --keep`, `reshot`, `diff`, `get frames`) and
`conformance:http-cache`, all in `bun run test`.

## HTTP: image client, disk cache, fetch cache modes (2026-11-08)

- **Image client.** `rust/src/http.rs` (`AppHttpClient`) is the GPUI `HttpClient` behind
  `ImgResourceLoader`, so it serves both `<Image>` and `ChatList`. It is zed-reqwest (the build
  `gpui_http_client` already compiles, so no new crates) on a current-thread tokio runtime on the
  `rngpui-net` thread, HTTP/2 through ALPN with one pooled connection per host. The old pool was
  6 blocking ureq workers on HTTP/1.1, which paid a round trip per image per connection.
- **The HTTP/2 windows must be set.** With hyper's defaults, two 190 KB animated emotes from
  `cdn.7tv.app` (280 ms RTT from roberto) took 7-12 s against 2 s for curl; 6 MB per stream and
  15 MB per connection (Chrome's values) brought them to 2 s.
- **Host gate.** hyper-util starts one connection per concurrent request until the first one
  is pooled, so a burst of 90 cold images would open 90 TLS connections. Each origin starts at 6
  requests in flight; the first response widens it to 128 when it was HTTP/2.
- **Preconnect.** `ImageCache.preconnect(origins)` (`$cmd: "httpPreconnect"`) sends `HEAD /`
  outside the gate on the image client (`client(FOLLOW_ALL_LIMIT)`: each redirect limit is its own
  `reqwest::Client` and pool, so preconnecting on another one warms nothing).
- **Disk cache.** `rust/src/http_cache.rs`, one file per URL at
  `<cache dir>/<app id>/http/<2 hex>/<sha256(url)>`; cache dir is `$XDG_CACHE_HOME` or `~/.cache`
  on Linux, `~/Library/Caches` on macOS, the app id as in `storage.rs`. `RNGPUI_CACHE_DIR`
  replaces `<cache dir>/<app id>`, `RNGPUI_TEST_MODE` without it disables the cache (every harness
  launch stays isolated), `RNGPUI_HTTP_CACHE=0` turns it off, `RNGPUI_HTTP_CACHE_MAX_MB` caps it
  (256). A file is `RNGHTTP1`, a u32 LE length, JSON metadata (url, final url, status, headers,
  stored/fresh-until ms, body length) and the body; a read that finds the wrong magic, url or
  length deletes the file and misses. Writes go to `http/tmp/<key>.<pid>.<seq>` and are renamed
  into place (no fsync: a torn file fails the length check), so two processes can share the
  directory. Reads bump the mtime at most hourly; 20 s after first use and after every 10% of the
  cap written, a scan under a non-blocking `flock` on `http/.scan.lock` deletes the oldest mtimes
  down to 80% and temp files older than an hour.
- **What is stored**: 200 responses to GETs without `Authorization`, `Cookie` or `Range`.
  Freshness: `no-store` is not stored, `no-cache` is stored already stale, then `max-age` minus
  `Age`, `Expires` minus `Date`, 10% of the `Last-Modified` age (at most 7 days), else 1 hour.
  Images use any stored copy at once and revalidate a stale one in the background (`ETag` /
  `Last-Modified`), so the next load gets the new one.
- **fetch `cache` modes** (`jsc.rs` `do_fetch`): `default` and `no-store` are unchanged (network,
  nothing stored); `reload` stores; `force-cache` returns any stored copy, else fetches and
  stores; `only-if-cached` returns the stored copy or a 504 without the network; `no-cache`
  sends a conditional request and returns the stored body on 304. Stale-while-revalidate is two
  requests started together, `only-if-cached` and `reload` (`requestCachedJson` in
  [chatterino-gpui](https://github.com/felipe-software/chatterino-gpui)).
- **`ImageCache.prefetch(urls)`** (`rust/src/image_prefetch.rs`) calls
  `cx.fetch_asset::<ImgResourceLoader>` on the main thread, so the first paint finds the image
  downloaded and decoded; the promise resolves through a `{"type":"imagePrefetch"}` bridge event.
  The ChatList image map adopts a prefetched URL when it paints it; unadopted ones are dropped
  from GPUI's asset cache after 5 minutes.
- **Decoding is not the bottleneck.** GPUI decodes every GIF/WebP frame before the first can
  paint; measured with image 0.25.10, 1x emotes (up to 158 frames) take at most 5 ms and the first
  frame under 0.2 ms, 3x/4x tooltip images about 28 ms. GPUI's loader was left as it is.
- **Debugging**: `RNGPUI_HTTP_TRACE=1` prints `[rngpui-http] {url, source: network|cache|
  revalidate, status, startMs, endMs, bytes}` per image request. `chatListState` takes
  `images: true` (per-list `visibleImages` with state, `visibleIds`, and `visibleHistorical`) and
  `timings: true` (`imageTimings`: requested, settled and first-painted wall-clock ms per URL).
- **Timing harness**: `scripts/emote-timing.mjs` in
  [chatterino-gpui](https://github.com/felipe-software/chatterino-gpui) times cold and warm
  launches of that app and of the Flatpak Chatterino 2.5.5 (Xvfb `:98`, logs via
  `QT_LOGGING_RULES`, `xwd` frames). It replays a recorded history to both apps and can drop live
  chat through a local IRC proxy; see its README.

Gate: `bun run conformance:http-cache` (two launches sharing one `RNGPUI_CACHE_DIR` against a
local server that counts hits: cache modes, 304 revalidation, images downloaded once across
launches, sha256 file layout, no leftover temp files, test mode without a dir stores nothing).
Rust unit tests in `http_cache.rs` cover freshness, HTTP dates, corruption, eviction order and
concurrent writers.

## Secondary windows: `<Window>` (2026-11-08)

`<Window>` (ts/src/Window.tsx) opens another GPUI window in the same `rngpui-service` and
renders its children there through the same reconciler and JavaScriptCore runtime, so all
windows share React state. Rust side: rust/src/windows.rs (registry, open/update/close,
placement, activation, routing helpers); TS side: ts/src/window-host.ts (portal container,
delta wire, lifecycle commands).

- **One portal container per window.** `<Window>` is `createPortal(children, container)`;
  the container's root has its own globalId. `resetAfterCommit` serializes the main
  container and then every open window container; each window keeps its own
  `sameTopLevelTree` check and delta caches (`sharedWireSources` is shared, because the
  host keeps one file-id table). A window tree carries `$window: <id>` on its root and is
  parsed against that window's own prior index (`PRIOR_WINDOW_TREE_INDEX`).
- **Order.** The window opens in a layout effect (`windowOpen`), which runs after the commit
  that serialized the main tree, so it pushes its own first tree right after the open
  command. The host still holds a tree that arrives before its window (`PENDING_TREES`).
  Unmount sends `windowClose`; the host drops the window, its input entities, webviews,
  pointer spans, GIF wakes and registry files, then re-runs the union retain.
- **Every window is a `ServiceApp`** (`window_id`, `role`, `chrome`). Main-only work stays
  main-only: the paint-only / incremental flags, `anim_trace` frame counter (`get frames`),
  frame_trace, inspector, perf HUD, AX sync, startup marks and the main registry record.
  Secondary windows call `window.prepare_layout_frame(false, false)` every render: the
  vendored taffy engine is only cleared there, so skipping it grows the tree forever.
- **Per-window state that used to be global**: pointer spans (`div::with_pointer_frame`,
  keyed by GPUI window id — a mouse event must be resolved against its own window's last
  frame, not whichever window painted after it), macOS hit passthrough rects (keyed by
  GPUIView), input entities and webviews (published per owner), ChatList GIF wakes.
  Id-keyed state (scroll, chat lists, layout cache, tweens) stays global because globalIds
  are unique, but **retain must use the union of every window's tree**
  (`windows::retain_all_with`); retaining one window's ids drops the others' state.
- **The pump** unwraps `Incoming::ForWindow` (debug requests with `"window": <id>`) and routes
  node commands (`focusInput`, `chatList`, `scrollTo`, `eval`, …) to the window that owns
  the node. Window-update failures go through `window_gone!()`: a closed secondary window
  skips the message, only the main window closing stops the pump. `SetNodeStyle` and tween
  ticks repaint only the windows that own the animated nodes.
- **Keys.** One `intercept_keystrokes` serves every window and resolves the window's
  `ServiceApp` (`windows::app_for`); Escape asks a `closeOnEscape` window to close.
  `AppCommands` bindings are app-global, so they fire in whichever window has focus.
  Modifier-only presses/releases come from the root frame's `on_modifiers_changed`.
- **Closing.** The OS close button (`on_window_should_close` returns false), the Linux client
  title bar's X, Escape and focus loss all emit `{ type: "window", event: "close", reason }`;
  JS calls `onClose` and the unmount closes the window. Closing the main window quits.
- **Activation.** Each window's `observe_window_activation` emits focus/blur; the app state
  goes inactive only if no window is active 60 ms later (focus moving between two of our
  windows deactivates one before the other activates).
- **Linux.** Normal windows and dialogs draw the client frame when the compositor expects
  client decorations (GNOME, headless Mutter); popups request client decorations and draw
  nothing (frameless on KWin too). Wayland ignores `position`; X11 and macOS honor it. The
  content area is 2px smaller than requested inside the client frame, as for the main
  window (the 1px surface border).
- **Debug socket**: `windows` lists them; any request takes `"window": <id>`;
  `systemClose` emits the OS close request; `activate {active}` drives the activation path
  (headless Mutter never focuses a window); `realModifiers {modifiers}` dispatches a real
  `ModifiersChanged`; `realtap` takes `button` and `modifiers`. CLI: `rngpui get windows`,
  `--window <id|main|testID|kind|title>` on get/do/trace/reshot.
- **Capture**: a capture trigger file may say `window=<id>`; on Linux each window has
  `<pid>.w<id>.json` (with `secondary: true`, `windowId`, `capture_request`) and answers
  `<pid>.w<id>.capture`; continuous `RNGPUI_CAPTURE_PNG` also writes `<name>.window-<id>.png`.

Gate: `bun run conformance:multi-window` (47 checks, Linux: it captures through the
registry's per-window request files). It also covers `NativeClipboard.read`, `AppState`,
modifier-only keys, `onAuxClick`, `transparent`, `nativePressDrag={false}` and the ChatList
scroll API. Not done: macOS capture of secondary windows is unvalidated, AX children of
secondary windows are not synced, and WebView inside a secondary window is untested.

Small fixes landed alongside: `NativeLayout` overrides now clear the paint-only flag (a
coalesced paint-only commit replayed the old layout and ignored the override — headless
Mutter's startup appearance flip made `native-layout` fail every run); the JS dispatch
plan delivers a batch's pointer moves before the release that follows them
(`plan_dispatch`); `parse_css_color` knows `transparent` and every CSS named color
(`borderColor: "transparent"` used to draw black, `color: "transparent"` white).

## Releasing into Team Machine

`~/team-machine/gui` consumes this package locally, but it is not symlinked. The
Team Machine native shell deliberately copies this package into
`~/team-machine/gui/node_modules/react-native-gpui` as a real directory so the app and
renderer share one React instance.

Do not manually copy this repo into Team Machine. Use the Team Machine-side release script:

```sh
cd ~/team-machine/gui
bun run release:gpui
```

That script:

- bumps this repo's root, `ts/`, and Rust crate versions;
- builds the package and native `rngpui-service`;
- copies `dist/`, `native/`, `package.json`, and `README.md` into Team Machine;
- writes `~/team-machine/gui/native-shell/react-native-gpui-release.json`;
- commits the version bump in this repo;
- commits the version marker in `~/team-machine`.

Use `bun run sync:gpui` in `~/team-machine/gui` only for quick local iteration. It
refreshes the copied package but does not create a version-history marker.

The package is named `@felipe-software/react-native-gpui` since the npm release flow
landed; the copy still lives at `node_modules/react-native-gpui`, and module resolution
goes by directory, so Team Machine imports are unchanged. The `version` fields stay plain
versions that the script bumps in place. The checked-in `ts/package.json` has no
`optionalDependencies`: npm releases add them at publish time (next section), so
`bun install` here and in Team Machine never fetches platform packages.

## Releasing to npm

`@felipe-software/react-native-gpui` and its platform packages
(`@felipe-software/react-native-gpui-linux-x64`, `-linux-arm64`, `-darwin-arm64`, each
`rngpui-service` + libghostty-vt + `ui-runtime.js`) are released from CI, the same way as
`felipe-software/react-native-back-gesture`. Never `npm publish` from a laptop.

1. A merge to `main` runs `.github/workflows/release-main.yaml` →
   `version-bump.yaml`: semantic-release (`.releaserc.json`, root `package.json`) reads the
   conventional commits since the last `v*` tag (`feat`, `fix`, `perf`, `refactor`,
   `revert` → patch) and pushes the next `v<version>` tag plus a GitHub release. It
   refuses to run while no `v*` tag exists (it would start at 1.0.0); the baseline is
   `v0.1.39` on 89ac9d6, upstream's 0.1.39 release commit.
2. The tag runs `publish-npm.yml`: a native matrix (ubuntu-24.04, ubuntu-24.04-arm,
   macos-14) builds `rngpui-service` with `.github/actions/native-toolchain`, and
   `scripts/npm-packages.mjs stage-platform` strips debug info (macOS re-signs with
   `rust/jsc.entitlements`) and writes the platform package. A second job builds `dist/`
   and runs `npm-packages.mjs set-version <tag version>`, which also writes the exact-version
   `optionalDependencies`. The publish job (environment `npm`, OIDC trusted publishing)
   publishes the platform packages first, then the main package, skipping versions npm
   already has, so a rerun is safe.
3. `npm run npm:pack -- --out <dir>` (`npm-packages.mjs pack`) builds the same two
   tarballs for this machine's platform locally, for install tests.

npm attaches a trusted publisher only to a package that already exists, so the first release
of each package publishes with the `NPM_TOKEN` secret of the `npm` environment; the one-time
setup list is in `ts/README.md` ("Releasing").

Outside this repo the published package bundles and runs apps itself: `rngpui bundle
<entry> <out.js>`, `rngpui run <entry>` (cli/bundle.ts, cli/run.ts). `bundle-app.mjs` resolves
packages from the entry's directory upward, aliases `react-native`, `react-native-gpui` and
`@felipe-software/react-native-gpui` to one library entry (`src/index.ts` in a checkout,
`dist/index.js`, or `dist/index.development.js` for development bundles, whose reconciler must
be the development build React's dev runtime expects), skips the worklets Babel pass for the
package's own `dist/`, and only rebuilds `ui-runtime.js` in a checkout.

`.github/workflows/test.yaml` runs on pull requests: typecheck, `npm run test:unit`, and
`cargo test` on Linux.

## Developer CLI: `rngpui` (inspect + drive a GPUI app)

`rngpui` is the in-repo devtool for inspecting and driving a running react-native-gpui
app **without screenshots** — modeled on soot's `sootsim` CLI. It uses the
single-process JavaScriptCore host only: `--launch` bundles an entry to source, starts
`rngpui-service`, and talks to its native debug socket. Run it from `ts/`:

```sh
bun run cli/bin.ts <get|do> <subcommand> [selector] [target] [--json]
# or, after build, the `rngpui` bin / `npm run rngpui`
```

It is the answer to "is this element actually visible / what color is it really /
where is it" — questions the static React tree dump alone can't answer. Every value
is **measured at runtime**: computed window-coordinate bounds (from the paint pass)
and the **actual sampled pixel color** within those bounds.

**The fast loop — `shot` / `dev` / `reshot` / `diff`:**

`shot` is the one-command iteration primitive: launch a bundle/entry offscreen, wait
for a stable frame, write a PNG + tree dump, and print the PNG path plus the bounds +
sampled color of every `--select`'d node — no second command, no flag archaeology.

```sh
# one shot: realistic size, forced theme, measured nodes (cold ≈ 2s on the Team Machine app)
rngpui shot --bundle native-shell/.gpui/app.js --size 1360x880 --fixture \
  --appearance dark --select stage --select trees-pane
#   png: /tmp/rngpui-shot.png (2720x1760) appearance=dark
#   measurements:
#     "stage" → div stage-mode-bar #454 [259,43 792x34]  dominant=#282828 (48%) avg=#1b1b21

# persistent instance: keep one alive, re-capture in ~1s after a state/data change
rngpui dev --bundle native-shell/.gpui/app.js --fixture     # → prints the session dir
rngpui reshot --session <dir> --select composer                     # sub-second, no relaunch
rngpui close --session <dir>

# pixel diff two captures: changed ratio + changed-region bounding box (+ highlight png)
rngpui diff /tmp/before.png /tmp/rngpui-shot.png --out /tmp/diff.png
```

- `--appearance light|dark` forces the app theme via `RNGPUI_FORCE_APPEARANCE` (flows
  through the native bridge so tamagui re-themes; no system toggle, no system mutation).
- `--size WxH` is honored end-to-end — the capture PNG comes back at that logical size ×
  the backing scale (1360x880 → 2720x1760). (The old LaunchServices `.app` capture path
  produced a wrongly-clamped ~784x507; the CLI direct-spawn path used by `shot` is correct.)
- `--fixture` loads deterministic demo data (`TM_FIXTURE_ONLY=1`); without it the
  Team Machine app paints an empty "connecting…" shell when no daemon is reachable.
- `--select <selector>` is repeatable; `--json` for machine output; `--out` to place the PNG.
- `reshot` only re-reads the **current** frame of a kept session — it does not re-bundle
  or change the theme. After editing JS, re-`shot` (re-launches against the rebuilt bundle).

**`get` (read-only introspection):**

- `get tree` — full annotated node tree (type, ids, computed bounds).
- `get stats [selector]` — aggregate node counts, visible/hidden counts,
  interactive count, max depth, duplicate `globalId`s, type counts, native list
  group counts, and WebView totals. Use this first when checking leaks or drift:
  repeated interactions should not make `nodes` or duplicate IDs climb.
- `get webviews` — WebView inventory with inline/html source size, bounds,
  `visible`, and `display`; use this to verify hidden kept-mounted WebViews are
  retained but not painted.
- `get describe [selector]` — per node: path, ids, **computed bounds**, resolved
  style, and **sampled dominant/average color** inside the bounds (+ `visible`).
- `get layout [selector]` — computed bounds per node.
- `get style <selector>` — resolved style (incl. background/border/color).
- `get color <selector|x,y>` — sampled color in a node region or at a point.
- `get point <x,y>` — topmost node + pixel color at a window point.

**`do` (drive — needs an owned/launched instance):**

- `do tap <selector|x,y>`, `do type <text>`, `do key <key>`, `do scroll <sel|x,y> <dx,dy>`.

**Targeting:**

- `--launch <entry.tsx>` — bundle the entry to JavaScript source, spawn
  `rngpui-service` offscreen + non-activating, and own its debug socket.
- `--bundle <app.js>` — spawn `rngpui-service` against an existing JavaScript source
  bundle, useful for apps with their own bundler such as Team Machine.
- `--keep` — leave the launched service running and print a session directory on stderr.
- `--session <dir>` or `RNGPUI_SESSION=<dir>` — reuse a kept driveable session for
  do-then-get workflows.
- `close --session <dir>` — terminate the owned service and remove its session dir.
- `--attach` — target a running rngpui window (the largest, driveable-first). This
  **includes** the user's `team-machine-gpui-user` window — it is not skipped. `get *`
  is read-only and safe against it (CGWindowList capture + a read-only tree dump, no
  focus theft, no input). **Never** run `do`/`flow` with `--attach`: those inject
  synthetic taps/keys and would drive the user's window. To drive, `--launch`/`--bundle`
  your own offscreen instance.

**Selectors:** `#42` (globalId), substring match on testID/identifier/nativeID/label/text/type,
or `200,300` (literal window point).

**How it works:** native `dump::dump_tree` (rust/src/dump.rs) emits authored facts +
post-layout bounds; an on-demand dump is requested over `RNGPUI_CONTROL_SOCKET`
(`Incoming::DebugDump`); `do *` inject synthetic input
(`Incoming::DebugTap/DebugScrollAt/DebugTypeText/DebugKeyPress` →
`inspector::tap_target_at` + `elements::synth_tap`); colors come from the in-service
full-opacity CGWindowList capture (rust/src/capture_png.rs) sampled via
`scripts/pixel.mjs`. **Always offscreen + non-activating** — never bring a window to
front. Owned sessions write `RNGPUI_SERVICE_PID_FILE`; `close()` kills exactly that
pid and removes the session dir.

**Validation:** `node scripts/describe-conformance.mjs` (also `npm run conformance:describe`)
launches `examples/describe-fixture.tsx` and asserts computed bounds + sampled colors
for known boxes. `node scripts/drive-conformance.mjs` (also `npm run conformance:drive`)
keeps one session alive, taps a stateful fixture, re-describes it through `--session`,
and asserts the sampled color changed. Keep both green.

## Animation forensics: `rngpui trace` + `get frames` (2026-06-11)

`rngpui trace <selector ...|--all> [--keys k,k] [--ms n] [--action "tap <sel>"]` records
every off-thread reanimated style write (`anim_overlay::apply_ops`) and NativeLayout
tween tick under the matched subtrees, with timestamps + the painted-frame counter, then
reports per-key curves: sparkline, endpoints, min/max, sample cadence, dropped-frame
gaps, and spring-overshoot count — values-level animation proof with NO screenshots.
`rngpui get frames` returns the always-on painted-frame counter + fps + frame-gap stats
(`{"$cmd":"frameStats"}`). Rust side: `rust/src/anim_trace.rs`; the three commands are
answered inline in `debug_control.rs` (no main-loop round-trip). `examples/trace-fixture.tsx`
is the interactive fixture (tap `go-button` → reanimated card spring + NativeLayout pane
tween at once).

Landed alongside (see plans/production-ready.md P0.1): the element-transform stack in
the vendored gpui — `transform` now actually paints (translate/scale/rotate about the
element center; quads, shadows, glyphs, images, svg) with fragment SDF/gradient math
inverse-mapped into local space; and CSS-correct shadow occlusion (outer box-shadows cut
the casting element's own rect out, so opacity fades never reveal a "shadow underneath").
Pixel gates: `conformance:transform`, the shadow-under guard inside `conformance:opacity`.
`rngpui do key enter` now emits gpui-component's `PressEnter` so `onSubmitEditing` fires
like a real keystroke.

## Native AppKit controls: `<NativeButton>` / `<NativeTextInput>` (2026-06-13, spike)

Real `NSButton` / `NSTextField` (`NSSecureTextField` when `secureTextEntry`) hole-punched
through the gpui Metal layer — the macOS-native counterpart to the gpui-drawn `<Button>` /
`<TextInput>`. `rust/src/elements/native_control.rs` is the whole implementation; TS surface
is `NativeButton` / `NativeTextInput` in `ts/src/components.tsx` → host types
`nativebutton` / `nativeinput` (reconciler switch) → `create_element` in `elements/mod.rs`.
Props reuse existing wire fields: button title rides `text`; input uses
`value`/`placeholder`/`editable`/`secureTextEntry`. Events come back through the normal
bridge (`event(id,"press")`, `change_text`/`change`, `submit`, `focus`/`blur`) via a single
shared target/delegate object that routes by the control's `tag` (= node id).

Non-obvious facts (these cost real debugging — don't relearn them):

- **Native controls sit ABOVE the Metal layer** (`positioned: NSWindowAbove relativeTo:
  gpui_view`), unlike `<WebView>`/`<SystemView>` which sit BELOW it. Interactive chrome must
  paint over app content (so its bezel/field isn't occluded by an opaque app background) and
  takes the real click/keystroke directly — no `hit_passthrough` needed for routing (the
  control is topmost). The tradeoff: gpui overlays can't paint over a native control, and
  there's no gpui clip/transform/animation on it (same as WebView). Use for chrome/forms,
  not dense scroll lists.
- **The offscreen `rngpui shot` capture does NOT composite native AppKit controls** — their
  region comes back fully transparent (CGWindowList in-service capture only sees gpui's Metal
  output + WKWebView, not sibling NSViews). Visual validation MUST be an on-screen
  `screencapture` of a real launched window. Don't be fooled: the stale packaged
  `ts/native/rngpui-service` renders an unknown `nativebutton` type as an empty div, so a
  shot can look like a positioned box with the page-bg color — that's NOT the native control.
  Force the fresh binary with `RNGPUI_SERVICE=…/target/release/rngpui-service`.
- **`do tap` must agree with a real click, and `conformance:hit-test` is what proves it.**
  `do tap` resolves its target through `inspector::tap_target_at`, which is a *separate*
  resolver from gpui's own mouse dispatch — so it can silently disagree with what a user's
  click does, and has. It stays honest by mirroring paint order: `collect_hits` walks
  children back-to-front in the same z-index-aware stacking order `paint` uses, and the
  first hit that registers a pointer-down listener wins, because gpui runs bubble-phase
  mouse listeners in reverse registration order. Change either side and run
  `bun run conformance:hit-test`, which presses the same point via `realtap` (a genuine
  `PlatformInput::MouseDown`) and via `tap`, and fails unless both reach the covering node.
  Overlap bugs are invisible to painting checks — the pixels are identical either way.
- **`hitbox.is_hovered(window)` does not mean "the pointer reaches this node" here.** Every
  rngpui hitbox goes in as `HitboxBehavior::Normal`, so gpui's hit test reports every hitbox
  containing the pointer, and a node buried under an overlay reads as hovered. Occluding is
  not the fix: `BlockMouse` hides the hitboxes inserted *before* it, which are exactly the
  node's ancestors, and ancestors must keep hearing the event because the JS side does not
  bubble (`dispatchEvent` calls the one id the renderer names). Every pointer listener
  instead resolves through `div::pointer_reaches`, which reads the frame's `POINTER_SPANS` —
  one DFS span per hitbox, in prepaint order — and admits only the front-most hovered node
  and its ancestors. Gated by `bun run conformance:occlusion`, which asserts the *side
  effect*: a covered node must receive no `mouseDown`/`pressIn`/`mouseEnter` at all. That is
  the half `conformance:hit-test` cannot see, since it only checks where a press resolves.
  The spans only cover elements that get a hitbox (interactive, scrollable, or custom
  cursor), so a purely decorative overlay with no listeners still does not occlude.
- **Captured PNGs carry Display P3 values with no ICC profile, so raw bytes are not the
  sRGB you declared.** `rngpui shot` writes what the display composited, untagged, and
  `pixel-sample` reads bytes. Neutrals drift a couple of units (`#050507` reads `#050505`,
  `#18181bfa` reads `#181818`) and saturated colors move a lot: `#39ac75` reads `#5aaa78`,
  because matching that green in P3 needs more red. Judge a saturated color by converting
  first or by comparing two captures; a `--expect` on a raw hex only holds for near-greys.
- **Validate the event round trip with `do tap <native-selector>`**: the `DebugTap` handler
  routes a tapped native control to `native_control::perform_native_click` (real
  `performClick:` → target/action → bridge → JS) instead of a gpui synth-tap. Proven via
  `examples/native-controls.tsx`: each tap bumps a gpui `presses:` counter (which DOES
  capture), so `do tap native-btn` then `get tree` shows the count climb.

Native controls carry no appearance of their own: they inherit the window's
`effectiveAppearance`, which `liquid_glass::install` pins from `RNGPUI_FORCE_APPEARANCE`.
Don't set `NSAppearance` on an individual control — that override is what used to make
them render light inside a dark window.

Known gaps (spike follow-ups): native controls aren't in the AX tree because gpui's
`RNGPUIAccessibilityView.accessibilityChildren` returns only synthetic children (so VoiceOver
/ cua-driver can't see them); no gpui-layout measurement of the AppKit intrinsic size, so
native controls need explicit `style` sizing; Windows/Linux backends are unimplemented (the
TS API is platform-agnostic; only the per-OS Rust element backend differs).

## Native chat list: `<ChatList>` (2026-11-08)

A virtualized Twitch-style message log drawn entirely by one native element, written for
[chatterino-gpui](https://github.com/felipe-software/chatterino-gpui). TS: `ts/src/ChatList.tsx`
(forwardRef + `ChatListHandle`), contract in `ts/src/chat-list-types.ts`, host type `chatlist`. Rust: `rust/src/elements/chat_list/`
(`model` parsing, `layout` per-message layout, `state` buffer/scroll/selection, `element`
gpui Element, `images` loading + animation clock, `events`, `debug` dump/tap).

- **Data never rides the React tree.** Props carry only options and colors
  (`SpecializedElement::ChatList`, paint-only for the retained-layout gate). Messages go
  through `$cmd: "chatList"` (`append|prepend|update|clear|scrollToBottom`), parsed on the
  `jsc-tree-parser` thread into structs, then applied on the main thread to a thread-local
  `ListState` keyed by the `__rngpuiHostId`. An append arms a paint-only frame and lays out
  only the new message; state is dropped by `TreeMetadata::retain_native_state`.
- **Scroll position is a message anchor, not a pixel offset**: `(seq, px into that
  message)`. Appends get increasing seqs and prepends decreasing ones, so the deque stays
  contiguous and `index = seq - front.seq`. That is why append, prepend and `maxMessages`
  trimming do not move a scrolled-up view, and why the scrollbar counts messages (Chatterino's
  thumb math: `y = rel/n·(h−11)+1`, `height = page/n·(h−11)+10`).
- **Paint inside `window.paint_layer`.** gpui inserts every primitive painted outside a
  layer into the scene's BoundsTree; `paint_line` avoids that with one layer per line. The
  first version called `paint_glyph` per glyph with no layer and paint cost 3.3 ms/frame for
  ~7k glyphs; three layers per list (content, zero-width overlays, selection + scrollbar) cut
  it to ~1 ms. Inside one layer sprites sort by atlas tile id, not insertion order, which is
  why zero-width emotes get their own layer.
- **Never call `div::pointer_reaches` during prepaint.** Spans painted after you are not
  registered yet, and its per-position memo (`FRONT_MOST`) caches the wrong answer for the
  rest of the frame, breaking every later element. The chat list records `pointer_inside`
  from its mouse handlers and reads that in prepaint.
- **Animation**: images load with `cx.fetch_asset::<ImgResourceLoader>` (shared with
  `<Image>` and `ImageCache.prefetch`, through the HTTP/2 client and disk cache), and a load
  completion arms a paint-only refresh instead of notifying the root.
  Frame index comes from one global epoch (all copies in sync, delays ≤10 ms play as 100 ms,
  minimum 20 ms, like Chatterino). Only painted emotes compute a deadline, and
  `images::request_wake` keeps a single timer for the earliest one, so a visible 200 ms GIF
  repaints at 5 fps and a list with no visible animation never repaints.
- **Copy is routed at the root frame, not by focusing the list** (Chatterino hands focus to
  the input): a capture-phase `Copy` action copies the chat selection unless the focused
  `TextInput` holds a newer selection (`input_selection_at` vs
  `chat_list::selection_changed_at`), and a root `on_key_down` handles secondary-c when no
  input is focused. On Wayland gpui writes the clipboard only while the window has pointer or
  keyboard focus, so a no-activate headless test window never gets it; the `clipboard` debug
  command also returns `lastCopy`, the text the app last tried to copy.
- **Debugging**: `get tree`/`get stats` show one synthetic node per visible message
  (`chatlist-message`, `nativeID` = message id) with children `chatlist-user|text|link|emote|
  badge|timestamp|reply-curve` and window-space bounds; ids are negative and stable per
  visible row. The `chatlist` node carries a `chatList` summary (counts, scroll state,
  selection, image and wake counters). `do tap` resolves the list with
  `inspector::tap_target_at` and runs the list's own hit test (`chat_list::debug_tap`), so it
  agrees with `realtap`. Debug socket commands: `chatListState`, `realscroll` (a real
  ScrollWheel event), `clipboard`; `scrollAt` routes to a chat list under the point.
- **Gates**: `bun run conformance:chat-list` (51 checks: wrapping, compact-emote alignment,
  zero-width overlay pixels, timestamp color, GIF cadence, realtap vs tap, an interactive
  overlay occluding the list, hover bounds, underline, drag selection + copy,
  append/prepend/trim anchoring, pause on hover, thumb drag, idle no-repaint). `bun run perf:chat-list [--seconds 10] [--warmup 4]
  [--max-main-cpu 15] [--json]` (Linux, reads `/proc/<pid>/task`) runs
  `examples/chat-list-stress.tsx`; tune it with `CHAT_STRESS_LISTS`, `CHAT_STRESS_PREFILL`,
  `CHAT_STRESS_RATE`, `CHAT_STRESS_ANIMATED_EVERY`, `CHAT_STRESS_ANIMATE=0`. On this machine,
  headless Mutter, 6 lists × 1000 messages: 20 msg/s with 11 visible GIFs = 7.8% of one core
  on the main thread at 24 frames/s; GIFs only = 2.0% at 5 frames/s; idle = 0.1 frames/s.
