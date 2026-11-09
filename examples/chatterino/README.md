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
| Window | Settings (gear) and account buttons, tabs with close button, live dot, unread (`#888` line) and highlighted (red line) states, `+` add tab, 2 px divider, Chatterino's colors for all four themes; Chatterino's button effect (hover glow at the pointer, click ripple) on tabs, corner, header and input buttons |
| Tabs | Select, add, close (asks first), rename (double-click or menu), reorder by dragging, duplicate, close multiple, unread marking toggle, lock layout, sort, tab visibility (all / live / none, Ctrl+U) |
| Split grid | The `SplitNode` tree from `core.layout` with Chatterino's layout math (48 px minimum before scaling, 1 px borders, last child to the far edge), new splits on the far right, resize handles (thin hover band, all handles while Ctrl is held, double-click or right-click resets), drag a header onto a split's edge zones, container edge strips with `+` markers, a tab (append) or `+` (new tab), focus moves with Alt+arrows, layout saved through `core.layout`; Ctrl+Alt overlay (move, left/right/up/down with half previews, clickable `+` strips) |
| Split | Header with title, ` (live)` plus the optional uptime/viewers/game/title parts, Chatterino's live tooltip (title, 160x90 thumbnail, game, "Live for ... with ... viewers") or offline tooltip, room modes, moderation-mode button for mods, kebab menu in Chatterino's order (popup, search, browser, reconnect, More: moderation mode, subscribe, notify when live, mute sounds, clear), `+` on the top-right split; chat in `ChatList` with settings and theme colors; reply buttons (`showReplyButton`); message context menu (image Open/Copy submenus, link items, copy message/full message, reply/thread items, Moderate, Twitch channel link items, Shift: message ID/JSON); username right-click mention or reply (Shift); middle click opens the web viewer card or the link; emote and badge tooltips at the cursor; "More messages below"; "Paused" indicator |
| Input | Placeholder per login state, Enter sends, Ctrl+Enter keeps the text, Shift+Enter inserts a line break, grows to several lines up to 150 px (250 px with a reply), characters past 500 drawn red, Up/Down history, Tab/Shift+Tab completion at the cursor, `:` and `@` completion popup (Up/Down, Tab/Enter, Esc), reply mode ("Replying to @name" bar with the replied text and cancel, `@name` prefix, sends with `reply-parent-msg-id`), emote button, optional length counter |
| Popups | User card, emote popup (opens on Subs at the top, centered sections per provider, search that hides the tabs, Ctrl+1..9/Ctrl+Tab/Ctrl+F), reply-thread popup (root and replies, live, subscribe checkbox, replies to the root), split popup window (Ctrl+N), quick switcher (Ctrl+K), search popup, channel dialog (special channels enabled when `core` provides them), settings, add-account dialog, menus, tooltips |
| Hotkeys | Ctrl+P, Ctrl+T, Ctrl+W, Ctrl+R, Ctrl+G, Ctrl+N, Ctrl+K, Ctrl+1..9, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+Shift+T, Ctrl+Shift+W, Ctrl+U, Ctrl+F, Ctrl+Shift+F, Ctrl+E, Ctrl+F5, Ctrl+End, Ctrl++ / Ctrl+- / Ctrl+0 and Ctrl+wheel (zoom: chat font and emotes, ±0.1 in 0.2..10), Alt+arrows, Esc |

## Layout of `src/ui`

| Folder | Contents |
| --- | --- |
| `layout/` | Pure split tree, geometry and tab operations with unit tests |
| `input/` | Pure completion, caret, reply and send-history logic with tests |
| `state/` | App context, layout actions, overlays, UI-only preferences, registries for inputs and hit areas |
| `window/` | Main window and tab bar |
| `splits/` | Tab page, split, header, chat view, input, resize handle, drop overlay |
| `overlays/` | Menus, tooltip and every popup or dialog |
| `settings/` | Settings pages |
| `common/` | Shared widgets (buttons, button effect, fields, checkbox, window frame, chat feed) |
| `assets/` | Chatterino 2.5.5 button icons (MIT) used by the UI |

## Known differences from Chatterino

- The user card, emote popup, search popup, reply-thread popup, split popups and every dialog
  (settings, add account, select channel, rename, confirm) are real windows opened with
  `<Window>` (`src/ui/overlays/overlayWindows.ts` maps each overlay to a window kind). Menus,
  tooltips and the quick switcher stay inside the main window. Wayland does not let apps place
  windows, so there the compositor picks the position of the user card and the others.
  Overlay windows and streamlink are not available.
- No window activation signal yet, so the focused split's header keeps its focused colors when
  the window is inactive.
- Resize handles also appear when hovering a split border (Chatterino needs Ctrl); Ctrl shows all.
- Modifier state only reaches JS with mouse events, so the Ctrl+Alt overlay, the Ctrl resize
  handles and the Ctrl+wheel zoom catcher appear on the first mouse move after the keys go
  down and stay until the next move after they are released.
- Middle click works only inside the chat: views get no middle-button events, so it does
  nothing on tabs and headers, and middle-click autoscroll is missing (no scroll API).
- The input never reports its caret, so completion at the cursor follows the caret from edits
  and arrow keys, and setting the text moves the caret to the end.
- Zoom scales the chat font and emotes; tabs, headers and other chrome keep their size.
- The emote popup has one Emojis section (no categories in the emoji data) and Twitch
  subscriber emotes are grouped as `Twitch`.
- Ctrl+Shift+N, F5, Alt+X, PgUp/PgDown, Ctrl+Home, Ctrl+H, F10 and Ctrl+Alt+N are not bound.
- Whispers, Watching, Live and AutoMod stay disabled in the channel dialog until `core`
  provides those channels.
- Block in the user card ignores the user locally; it does not call Twitch's block API.
