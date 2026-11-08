# Chatterino on react-native-gpui

A Twitch chat client that looks and behaves like [Chatterino 2](https://chatterino.com) (2.5.5),
built with react-native-gpui. The chat itself is the native `ChatList` element; tabs, the split
grid, headers, inputs, popups and dialogs are React components in `src/ui`. Data (IRC, history,
emotes, badges, highlights, accounts, settings, layout) comes from `createChatCore()` in
`src/data`.

`docs/chatterino-reference.md` is the source-cited spec this follows, and
`docs/compare-setup.md` explains how to run the real Chatterino side by side for screenshots.

## Run

```sh
npm start            # bundle src/main.tsx and run it in ts/native/rngpui-service
npm run start:dev    # same with a development bundle
npm run bundle       # only write .build/chatterino.js
npm test             # bun test src (data and ui unit tests)
npm run typecheck
```

`RNGPUI_SERVICE=<path>` picks another service binary, for example a fresh
`rust/target/release/rngpui-service`.

Drive it offscreen with the repo CLI from `ts/` (see the root `AGENTS.md`):

```sh
bun run cli/bin.ts shot --bundle ../examples/chatterino/.build/chatterino.js --size 1280x800 --keep
bun run cli/bin.ts do tap settings-button --session <dir>
bun run cli/bin.ts reshot --session <dir>
```

Real keystrokes, clicks and drags go through the control socket (`realKey`, `realtap`, `realdown`,
`realmove`, `realup`, `realcontext`, `realscroll`). `globalThis.__chatterinoDebug()` returns the
app services (core, layout actions, overlays, hit areas) for `evalJs` probes.

## What is implemented

| Area | Behavior |
| --- | --- |
| Window | Settings (gear) and account buttons, tabs with close button, live dot, unread (`#888` line) and highlighted (red line) states, `+` add tab, 2 px divider, Chatterino's colors for all four themes |
| Tabs | Select, add, close (asks first), rename (double-click or menu), reorder by dragging, duplicate, close multiple, unread marking toggle, lock layout, sort, tab visibility (all / live / none, Ctrl+U) |
| Split grid | The `SplitNode` tree from `core.layout` with Chatterino's layout math (48 px minimum before scaling, 1 px borders, last child to the far edge), new splits on the far right, resize handles (thin hover band, all handles while Ctrl is held, double-click or right-click resets), drag a header onto a split's edge zones, container edge strips with `+` markers, a tab (append) or `+` (new tab), focus moves with Alt+arrows, layout saved through `core.layout` |
| Split | Header with title, ` (live)`, live/offline tooltip, room modes, kebab menu (change channel, close, search, open in browser, reconnect, clear), `+` on the top-right split; chat in `ChatList` with settings and theme colors; emote and badge tooltips at the cursor; "More messages below"; "Paused" indicator |
| Input | Placeholder per login state, Enter sends, Ctrl+Enter keeps the text, Up/Down history, Tab/Shift+Tab completion cycling, `:` and `@` completion popup (Up/Down, Tab/Enter, Esc), emote button, optional length counter |
| Popups | User card, emote popup (Subs / Channel / Global / Emojis and search), search popup, channel dialog (Channel and Mentions), settings (General, Accounts, Highlights, Ignores, Hotkeys, Live Notifications), add-account dialog, menus, tooltips |
| Hotkeys | Ctrl+P, Ctrl+T, Ctrl+W, Ctrl+R, Ctrl+G, Ctrl+1..9, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+Shift+T, Ctrl+Shift+W, Ctrl+U, Ctrl+F, Ctrl+Shift+F, Ctrl+E, Ctrl+F5, Ctrl+End, Alt+arrows, Esc |

## Layout of `src/ui`

| Folder | Contents |
| --- | --- |
| `layout/` | Pure split tree, geometry and tab operations with unit tests |
| `input/` | Pure completion and send-history logic with tests |
| `state/` | App context, layout actions, overlays, UI-only preferences, registries for inputs and hit areas |
| `window/` | Main window and tab bar |
| `splits/` | Tab page, split, header, chat view, input, resize handle, drop overlay |
| `overlays/` | Menus, tooltip and every popup or dialog |
| `settings/` | Settings pages |
| `common/` | Shared widgets (buttons, fields, checkbox, window frame, chat feed) |

## Known differences from Chatterino

- Popups and dialogs are panels inside the main window, not separate windows; popup windows,
  overlay windows and streamlink are not available.
- No window activation signal yet, so the focused split's header keeps its focused colors when
  the window is inactive.
- Resize handles also appear when hovering a split border (Chatterino needs Ctrl); Ctrl shows all.
- No Ctrl+Alt split overlay, no middle-click actions, no zoom (Ctrl +/-), no moderation buttons.
- The input is single-line; Tab completion assumes the cursor is at the end.
- Long emote lists open scrolled to the bottom (the `ChatList` has no scroll-to-top yet).
- Whispers, Watching, Live and AutoMod channels are listed but disabled in the channel dialog.
- Block in the user card ignores the user locally; it does not call Twitch's block API.
