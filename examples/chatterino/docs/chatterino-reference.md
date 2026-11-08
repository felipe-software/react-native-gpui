# Chatterino 2 reference for the react-native-gpui rebuild

Source-cited facts about how Chatterino 2 looks and behaves, written so `examples/chatterino`
can match it. Every value comes from the Chatterino source unless marked **measured**
(pixel measurements of the installed app, see the appendix) or **inference**.

## Conventions

- **Version.** The installed app is the Flathub build **2.5.5** (tag `v2.5.5`, commit `2c1e9ffb`).
  All `path:line` citations point into the Chatterino repo at tag `v2.5.5`
  (`git -C ~/.cache/chatterino-knower/chatterino2 show v2.5.5:<path>`). Where `master`
  (checked out at `24632fe6`, 2026-11-07) differs in a way that matters, it is called out with
  **master:**. Section 8 lists those differences.
- **Colors.** Theme files use Qt color strings. An 8-digit value is **`#AARRGGBB`**, not CSS
  `#RRGGBBAA`: Dark `"disabled": "#99191919"` is `rgba(25,25,25,0.6)`. Convert before use.
- **Units.** Chatterino lays out in logical pixels times a UI scale (`/appearance/uiScale2`,
  default 1, `src/singletons/Settings.hpp:151`). Font sizes are **points** passed to `QFont`
  (`src/singletons/Fonts.cpp:240-245`), so 11 pt is about 14.67 px at 96 dpi (Linux, Windows) and
  11 px on macOS's 72-dpi logical scale. Every pixel value below is at scale 1.
- "Scale" in formulas = UI scale; "DPR" = device pixel ratio.

## Quick reference (the numbers people get wrong)

| What | Value | Source |
| --- | --- | --- |
| Chat font default | Linux `Arial` 11 pt, Windows `Segoe UI` 10 pt, macOS `Helvetica Neue` 12 pt | `src/singletons/Settings.hpp:44-52` |
| UI font (tabs, header, buttons) | default family above at **9 pt**, normal weight | `src/singletons/Fonts.cpp:84-91,170-174` |
| Username weight | `boldScale` 63 maps to `QFont::DemiBold` (600) | `src/singletons/Settings.hpp:221`, `src/singletons/Fonts.cpp:19-61` |
| Message padding | left 8, top 4, right 8, bottom 4 | `src/messages/layouts/MessageLayoutContainer.cpp:29` |
| One-line text message height | 4 + font line height + 4, truncated: **24 px** with Arimo 11 pt (measured) | `MessageLayoutContainer.cpp:61,230`, `MessageLayout.cpp:63-66` |
| Message with a 28 px emote | **32 px** (emotes count 4 px less toward line height) (measured) | `MessageLayoutContainer.cpp:30,674-685` |
| Tab height / divider | 28 px tabs, 2 px divider line under the tab row | `src/widgets/helper/NotebookTab.hpp:19`, `src/widgets/Notebook.cpp:765,1147` |
| Split header height | 28 px | `src/widgets/splits/SplitHeader.cpp:51,845-848` |
| Scrollbar | 16 px wide overlay, 4 px thumb unless hovered, min thumb 10 px | `src/widgets/Scrollbar.cpp:21,40,294-295` |
| Messages per split | 1000 | `src/singletons/Settings.hpp:718-721` |
| History on join | 800 messages from `recent-messages.robotty.de` | `Settings.hpp:712-717`, `src/common/Env.cpp:76-79` |
| Pause on hover | **off** by default (`pauseOnHoverDuration` 0) | `Settings.hpp:396` |
| Timestamp format | `h:mm` via `QLocale("en_US")` = 24-hour `17:04` | `Settings.hpp:161-162`, `src/messages/MessageElement.cpp:1178-1186` |
| Faded history / deleted | overlay of the theme `disabled` color (60 % split background), not opacity; they stack | `src/messages/layouts/MessageLayout.cpp:249-273` |

---

## 1. Window, tabs and the split grid

### 1.1 Window

| Fact | Value | Source |
| --- | --- | --- |
| Main window size without a layout file | 600 x 500 (times scale) | `src/widgets/Window.cpp:82` |
| Popup window size | `/appearance/lastPopup/size`, default 300 x 500 | `Window.cpp:92-99`, `Settings.hpp:284-287` |
| Title (Linux, macOS) | `Chatterino 2.5.5 - not logged in` or `Chatterino 2.5.5 - <login>` | `Window.cpp:790-808`, `src/common/Version.cpp:21-27` |
| Frame | native window frame on Linux and macOS; custom frame only on Windows 8+ | `src/widgets/BaseWindow.cpp:474-487` |
| Buttons left of the tabs (Linux, macOS) | settings (gear SVG), account (person SVG), update (hidden unless an update exists), streamer-mode icon (hidden unless active); each 28 x 27 | `src/widgets/Notebook.cpp:1463-1547,767-768,807-821` |
| Window background | theme `window.background` (Dark `#111111`) | `resources/themes/Dark.json:126-129` |

On Windows the gear, update button and a user label ("anonymous" or the login) live in the custom
title bar instead (`Window.cpp:207-240,812-822`).

### 1.2 Tab bar look (tabs on top, the default)

Tabs can sit top, bottom, left or right (`/appearance/tabDirection`, default top,
`Settings.hpp:193`). Values for the top layout:

| Element | Value | Source |
| --- | --- | --- |
| Row origin | tabs start at x = 2 + 28 per visible custom button (x = 58 with gear + account, measured) | `Notebook.cpp:757-768,802-821` |
| Tab height | 28 | `NotebookTab.hpp:19`, `NotebookTab.cpp:450-466` |
| Tab width | text width + 32 (with close button) or + 16 (without), clamped to [28, 150] | `NotebookTab.cpp:418-448` |
| Gap between tabs | `max(1, scale)` = 1 px | `Notebook.cpp:766,849` |
| Wrapping | a tab that doesn't fit starts a new row; the last tab also needs room for the add button | `Notebook.cpp:830-850` |
| Add-tab button | `+` drawn button, 27 x 27, padding 7, 1 px stroke, right after the last tab | `Notebook.cpp:46-51,711-715,864-867` |
| Divider line | 2 px under the last row in `tabs.dividerLine` (Dark `#555555`) | `Notebook.cpp:1146-1148` |
| Page start | y = tab rows + 2 (y = 30 with one row, measured) | `Notebook.cpp:897-914` |
| Tab title font | default family 9 pt (`FontStyle::UiTabs`) | `NotebookTab.cpp:869`, `Fonts.cpp:84-91` |
| Title alignment | centered; left-aligned when wider than the text area; shifted down 1 px (selected) or 2 px (unselected) | `NotebookTab.cpp:991-1009` |
| Selected tab | background from y = 0, **2 px** top line in `selected.line` (`#00aeef`) | `NotebookTab.cpp:901,924-950` |
| Unselected tab | background from y = 1, **1 px** top line in the state's line color, 1 px `window.background` line at the bottom when in the last row | `NotebookTab.cpp:901-921,1046-1066` |
| Background when the window is unfocused | `backgrounds.unfocused` (same values in the built-in themes) | `NotebookTab.cpp:894-899` |
| Close `x` | 16 x 16 box at right − 20, drawn only on the selected or hovered tab; two lines inset 4 px in the text color; hover fills `rgba(0,0,0,64)`; setting `showTabCloseButton` (default on) | `NotebookTab.cpp:1011-1038,1069-1078,1307-1327`, `Settings.hpp:222` |
| Hover effect | radial gradient at the mouse, radius width/2, alpha 50 to 40 x hover factor (factor +0.5 per 20 ms in, −0.3 out), in `tabs.regular.text`; click ripple alpha `(1-p)*95` | `src/widgets/buttons/Button.cpp:298-319,422-464`, `NotebookTab.cpp:392-398` |
| Compact style | `/appearance/tabStyle` = Compact divides the padding by 1.5 and shifts the `x` by 4 | `NotebookTab.cpp:63-85` |

### 1.3 Tab interactions

| Action | Behavior | Source |
| --- | --- | --- |
| Add | `+` button (80 ms delay) or Ctrl+Shift+T adds an empty tab and selects it | `Notebook.cpp:1269-1273`, `HotkeyController.cpp:530-532` |
| Empty tab | fills `splits.background`, centered text "Click to add a split" (ChatMedium font, header text color); with more than one tab adds "\n\nAfter adding hold <Ctrl+Alt> to move or split it."; a left click opens the channel dialog | `src/widgets/splits/SplitContainer.cpp:599-624,651-678` |
| Close | `x`, middle click, or context menu; `x` and middle click ask "Are you sure that you want to remove this tab?"; Ctrl+Shift+W closes the current tab without asking | `NotebookTab.cpp:1119-1157`, `HotkeyController.cpp:534-536` |
| Which tab gets selected after closing | the next visible tab; the previous one if the closed tab was last | `Notebook.cpp:169-200` |
| Rename | double-click (unless `disableTabRenamingOnClick`) or "Rename Tab": dialog "Rename Tab" with a "Name:" field, placeholder = default title; empty = back to the default title | `NotebookTab.cpp:344-390,1159-1168` |
| Default title | display names of the tab's splits joined with ", ", or `empty` | `SplitContainer.cpp:983-1016` |
| Reorder | drag a tab with the left button; it swaps with the tab under the cursor; moves animate 75 ms `InCubic`; blocked by "Lock Tab Layout" | `NotebookTab.cpp:97-98,839-861,1242-1274`, `Notebook.cpp:589-602` |
| Wheel over a tab | previous tab on wheel up, next on wheel down (trackpad deltas accumulate to 120) | `NotebookTab.cpp:1276-1300` |
| Switch | Ctrl+1..8 = visible tab 1..8, Ctrl+9 = last, Ctrl+Tab / Ctrl+Shift+Tab = next / previous (wraps) | `HotkeyController.cpp:494-511`, `Notebook.cpp:446-537` |
| Tab context menu | Rename Tab, Close Tab, Close Multiple Tabs (All Visible / to Left / to Right / Other Visible, each asks first), Popup Tab, Duplicate Tab, Mark Tab as Unread on New Messages (checkbox), separator, Lock Tab Layout, Top most window, Sort Tabs Alphabetically, Tab visibility (Show all tabs / Only show live tabs / Hide all tabs) | `NotebookTab.cpp:118-169,171-342`, `Notebook.cpp:1188-1193,1422-1432` |
| Tab-strip context menu | same notebook part (lock, top most, sort, visibility) | `Notebook.cpp:1100-1120` |
| Hide tabs | Ctrl+U toggles; first time shows "You've just hidden your tabs." | `HotkeyController.cpp:552-554`, `Notebook.cpp:635-675` |

### 1.4 Tab states: new messages, mentions, live

Colors per state are in section 3.8. Rules:

- A tab's state is **Selected**, **Highlighted** (mention or highlight), **NewMessage** or
  **Regular**, painted in that priority (`NotebookTab.cpp:874-892`).
- A split posts `Highlighted` when a message has `Highlighted` + `ShowInMentions` and is not a
  subscription (or any message in the AutoMod channel), otherwise `NewMessage`
  (`src/widgets/helper/ChannelView.cpp:1213-1229`). Messages flagged `DoNotTriggerNotification`
  (system messages) post nothing.
- A tab ignores the update if it is selected or if the source split is visible in the selected
  tab (`NotebookTab.cpp:742-815`). `NewMessage` is ignored unless "Mark Tab as Unread on New
  Messages" (`highlightsEnabled`, default **true** in layout files) is on (`NotebookTab.cpp:757-761`).
- `Highlighted` overrides `NewMessage` and is never downgraded until the tab is selected; selecting
  clears the state (`NotebookTab.cpp:630-661,786-793`).
- **Live indicator**: when any split in the tab is live and `showTabLive` (default on,
  `Settings.hpp:223`), a filled circle of diameter 4 at (width − 7, 4), 1 px lower on unselected
  tabs, in `tabs.liveIndicator` (`#ff0000`); reruns use `tabs.rerunIndicator` (`#c7c715`); live
  wins over rerun (`NotebookTab.cpp:952-979`, `SplitContainer.cpp:1018-1050`).
- "Only show live tabs" hides non-live tabs but always shows the selected tab
  (`Notebook.cpp:1221-1235,1351-1371`).

### 1.5 The split tree (`SplitContainer::Node`)

Each tab owns one `SplitContainer` with a tree of `Node`s (`src/widgets/splits/SplitContainer.hpp:85-133`):

| Node type | Meaning |
| --- | --- |
| `EmptyRoot` | the root of an empty tab |
| `Split` | a leaf holding one split |
| `HorizontalContainer` | children laid out left to right |
| `VerticalContainer` | children laid out top to bottom |

- Every node has `flexH` and `flexV` (default 1). Inside a horizontal container only `flexH`
  matters, inside a vertical one only `flexV`.
- After every layout pass the children's flex along the axis is **normalized so it sums to the
  child count** and the cross-axis flex is reset to 1 (`SplitContainer.cpp:1476-1488`). Saved
  layouts therefore contain values like `0.6, 1.4`.
- A container with one child is not collapsed on load; removal collapses a container that drops to
  one child into its parent (`SplitContainer.cpp:1266-1295`).
- Direction helpers: Left/Right map to horizontal containers, Above/Below to vertical
  (`SplitContainer.cpp:1503-1509`).

**Layout of a container** (`SplitContainer.cpp:1339-1495`):

```
minSize      = 48 * scale
want(child)  = max(containerSize / totalFlex * child.flex, minSize)
multiplier   = containerSize / sum(want)
child size   = want(child) * multiplier          (positions are int-truncated)
last child   extends to the container's far edge
```

The 48 px minimum is applied before scaling down, so it is not a hard minimum when space runs out.
The root geometry is the page rect grown 1 px left and up, and each split widget is its node rect
minus 1 px on the left and top (`SplitContainer.cpp:509,1350-1354`). Those 1 px gaps show the
container's border paint (section 1.12).

### 1.6 Where a new split goes

`insertSplit(split, options)`; with no options the direction is **Right**
(`SplitContainer.cpp:142-198`):

| Root before | Result |
| --- | --- |
| EmptyRoot | root becomes the split |
| a Split | root becomes `Horizontal[old, new]` |
| Horizontal container | new split appended as the last child |
| Vertical container | root becomes `Horizontal[Vertical(old children), new]` |

So Ctrl+T, the header `+` button and "Open in new split" always add a full-height column on the
right of everything (`SplitContainer.cpp:1133-1200`). With a relative split and direction (Ctrl+Alt
arrows, drops): if the split's parent already runs in that direction the new split is inserted
next to it, otherwise the split's node becomes a container of the right direction
(`SplitContainer.cpp:1160-1232`). Newly inserted siblings start with flex 1.

- `appendNewSplit(true)` (Ctrl+T, header `+`, empty-tab click) inserts an empty split and opens
  the "Open channel" dialog; cancelling deletes the split again (`SplitContainer.cpp:122-140`).
- The header `+` (16 px wide) is shown **only on the top-right split** (the last child of
  horizontal containers, the first child of vertical ones) (`SplitContainer.cpp:466-506`,
  `src/widgets/splits/Split.cpp:1042-1046`).
- Closing a split (Ctrl+W, header menu "Close") pushes it onto a reopen stack; Ctrl+G reopens it in
  its old tab (`SplitContainer.cpp:270-279`, `Window.cpp` action `reopenSplit`).

### 1.7 Drag and drop

| Step | Behavior | Source |
| --- | --- | --- |
| Start | press on the header and move more than 15 px, or press the center "move" icon of the Ctrl+Alt overlay | `SplitHeader.cpp:1048-1058`, `SplitOverlay.cpp:75-86` |
| During the drag | the split is removed from the tree first; dropping nowhere puts it back where it was | `Split.cpp:1299-1327` |
| Drop zones per split | left third → Left, right third → Right, top half → Above, bottom half → Below; zones overlap and the first match in that order wins, so the side thirds win over the halves | `SplitContainer.cpp:520-543` |
| Extra zones while dragging | every container gets strips on its two cross-axis edges, `min(10 % of the cross size, 24)` thick (top/bottom strips for horizontal containers, left/right for vertical ones); dropping there wraps the whole container; children shrink by the strip | `SplitContainer.cpp:1380-1426` |
| Empty tab | one zone covering everything | `SplitContainer.cpp:545-551` |
| Indicator | only the zone under the cursor is painted: fill `splits.dropPreview` (`#300094ff` = `rgba(0,148,255,0.19)`), 1 px border `splits.dropPreviewBorder` (`#0094ff`) | `SplitContainer.cpp:1532-1557` |
| Over a tab | dragging over a tab selects it; dropping on the tab appends the split to that tab (Right) | `NotebookTab.cpp:1193-1240` |
| On the add-tab `+` | creates a new tab containing the split | `Notebook.cpp:54-74` |

### 1.8 Ctrl+Alt overlay

Holding **Ctrl+Alt** over a split shows a translucent overlay (`src/widgets/splits/SplitOverlay.cpp`):

- Fill `rgba(0,0,0,150)` in dark themes, `rgba(255,255,255,200)` in light ones (`:223-235`).
- Five flat icon buttons, 30 px icons: move (center), left, right, up, down at the edges
  (`:131-162,210-221`); 0.7 opacity, 0.99 on hover (`:45-72`).
- Hovering an arrow previews the half of the split where the new split will appear with the
  drop-preview colors (`:242-278`); clicking inserts an empty split in that direction (`:204-208`).
- Left/right arrows hide when the split is 150 px wide or less, up/down when 150 px tall or less
  (`:281-294`).
- While Ctrl+Alt is held, the container edge strips (1.7) appear between splits as boxes with a
  centered `+` cross (white in dark themes, black in light ones; `dropTargetRect` fill, border
  opaque on hover); clicking one inserts an empty split there
  (`SplitContainer.cpp:514-518,599-624,684-726`).

### 1.9 Resize handles and sizes

- Handles exist between every pair of siblings and are **shown only while Ctrl alone is held**
  (`src/common/Common.hpp:35-36`, `SplitContainer.cpp:44-66`).
- Hit area: 8 px band centered on the boundary (child edge − 4) (`SplitContainer.cpp:1463-1474`).
- Paint: fill `splits.resizeHandleBackground` (Dark `#200094ff`) plus a 2 px center line in
  `splits.resizeHandle` (Dark `#700094ff`) (`SplitContainer.cpp:1631-1649`).
- Dragging moves flex between the two neighbors only, clamped to their combined span
  (`SplitContainer.cpp:1666-1725`). Double-click or right-click resets every sibling to flex 1
  (`:1651-1659,1727-1743`).

### 1.10 Focus

- A split's focus proxy is its input box, so clicking anywhere in a split focuses its input
  (`Split.cpp:99-100`). The container remembers the selected split and refocuses it when the tab
  is shown (`SplitContainer.cpp:307-333,772-784`, `Notebook.cpp:337-370`).
- The focused split's header uses the `focused*` colors (section 3.8) (`SplitHeader.cpp:991-1008,1113-1126`).
- Alt+Left/Right/Up/Down (not on macOS) move focus: walk up to the nearest container in that
  direction, take the neighbor, then descend using each container's last focused child
  (`SplitContainer.cpp:376-464`, `HotkeyController.cpp:400-412`).
- When the window loses focus, all splits unpause and the "last read" marker updates (`Window.cpp:135-150`).

### 1.11 Split anatomy

A split is a vertical stack with **1 px margins**: header (28), message view (stretch), input
(`Split.cpp:102-107`). The split paints `splits.background` behind everything (`Split.cpp:966-972`).
The input hides when empty only if `showEmptyInput` is off (default on) (`Split.cpp:169-202`,
`Settings.hpp:171`).

### 1.12 Borders between splits

The container strokes every split node's rect with `tabs.dividerLine` (Dark `#555555`), so a
**1 px line** separates splits (measured at x = 639 between xqc and forsen), and paints a 1 px line
at its own top in the selected-tab color (hidden under the splits) (`SplitContainer.cpp:626-649,728-732`).

### 1.13 `window-layout.json`

Location: `<settings dir>/window-layout.json`, Flatpak path
`~/.var/app/com.chatterino.chatterino/data/chatterino/Settings/window-layout.json`
(`src/singletons/WindowManager.cpp:71-72,114-115`). Written 10 s after a change and on exit with
9 rotating backups `window-layout.json.bkp-N` (`WindowManager.cpp:464-577,589-594`).

```jsonc
{
  "windows": [{
    "type": "main",                 // "main" | "popup"; only the first "main" stays main
    "state": "maximized",           // optional: "maximized" | "minimized"
    "x": 0, "y": 0, "width": 1280, "height": 800,   // client-area geometry; -1 = unset
    "emotePopup": { "x": 0, "y": 0, "width": 0, "height": 0 },
    "tabs": [{
      "title": "Main",              // optional custom title
      "selected": true,             // optional; at most one per window
      "highlightsEnabled": true,    // "Mark Tab as Unread on New Messages"; default true
      "splits2": {                  // root node, or absent for an empty tab
        "type": "horizontal",       // "split" | "horizontal" | "vertical"
        "flexh": 1, "flexv": 1,
        "items": [
          { "type": "split", "moderationMode": false,
            "data": { "type": "twitch", "name": "xqc" },
            "filters": [],          // filter UUIDs
            "checkSpelling": true,  // optional per-split override
            "flexh": 1, "flexv": 1 }
        ]
      }
    }]
  }]
}
```

| Key | Read as | Source |
| --- | --- | --- |
| `windows[].type` | `"main"` is main, anything else popup; a second main is demoted | `src/common/WindowDescriptors.cpp:176-191` |
| `x/y/width/height` | ints, default −1; applied only when all four are set; out-of-screen windows prompt "Windows out of bounds" | `WindowDescriptors.cpp:205-210`, `WindowManager.cpp:866-906` |
| `tabs[].selected` | first `true` wins | `WindowDescriptors.cpp:213-232` |
| `highlightsEnabled` | default `true` | `WindowDescriptors.cpp:140` |
| `splits2.type` | `"split"`, or `"horizontal"`/`"vertical"` | `WindowDescriptors.cpp:142-157` |
| container `items` | any `type` other than `"split"` is read as a container | `WindowDescriptors.cpp:63-78` |
| `flexh/flexv` | double, default 1.0 | `WindowDescriptors.cpp:43-44,58-59` |
| split `data.type` | `twitch` (needs `name`), `mentions`, `whispers`, `watching`, `live`, `automod`, `misc` (`name`) | `WindowManager.cpp:723-811` |
| split `data.name` | channel login; `data.channel` is accepted as an alias | `WindowDescriptors.cpp:106-116` |

The file in `docs/compare/window-layout.json` was loaded by 2.5.5 and written back with the same
content (verified; see `compare-setup.md`). **master** writes the same keys (`src/common/WindowDescriptors.cpp`
at master: 86-125,203-262).

---

## 2. Split header, input and hotkeys

### 2.1 Header layout

Left to right (`src/widgets/splits/SplitHeader.cpp:293-415`):

| Part | Size / content | Source |
| --- | --- | --- |
| spacer | 8 px | `:328-331` |
| title | centered `Label`, default family 9 pt (`UiMedium`), expands | `:333-338`, `src/widgets/Label.hpp:20` |
| spacer | 8 px | `:340-342` |
| room-mode button | text, hidden when empty; clickable only with mod rights | `:344-348,776-817` |
| moderation button | 28 px, SVG; shown only with mod rights or when mod mode is on | `:297-302,941-989` |
| chatters button | 28 px, shown only with mod rights | `:304-309,975-982` |
| menu (kebab) | 28 px | `:318-325` |
| add split `+` | 16 px, top-right split only | `:56,311-316,414` |

Height 28 (`:845-848`). Paint: fill `header.background`, a 1 px rect in `header.border` from
(0,0) to (w−1, h−2), and the last row repainted with the background, so the border shows on the
top, left and right with no bottom line (`:991-1008`; measured). Focused split: `focusedBackground`,
`focusedBorder`, `focusedText`.

### 2.2 Title, live status and tooltip

- Title = channel display name; `watching: <name>` for /watching; plus ` - filtered` when filters
  are set; `<empty>` for no channel (`SplitHeader.cpp:861-939`).
- When live it appends ` (live)` (` (rerun)` for reruns), then optional ` - <uptime>`,
  ` - <viewers>`, ` - <game>`, ` - <title>` controlled by the "split header" settings, all off by
  default (`:187-224`, `Settings.hpp:239-244`).
- Tooltip on hover, centered under the header, word-wrapped HTML (`:1070-1104`):
  - Live: `<title><br><br>` + 160x90 thumbnail (`thumbnailSizeStream` default 2) + `<game><br>` +
    `Live for <uptime> with <viewers> viewers` (`Vod-casting for ...` on reruns), centered
    (`:123-179`, `Settings.hpp:445`). Thumbnail URL
    `https://static-cdn.jtvnw.net/previews-ttv/live_user_<login>-160x90.jpg`, refetched after 5 min
    (`:59,883-923`).
  - Offline: `Offline<br><title>` (`:181-185`).
- Uptime string: `<h>h <m>m` (`src/providers/twitch/TwitchChannel.cpp:604-605`).

### 2.3 Room modes

Text built in this order, joined with `, ` (`SplitHeader.cpp:61-121`):

| Mode | Text |
| --- | --- |
| r9k / unique chat | `r9k` |
| slow N s | `slow(N)` |
| emote only | `emote` |
| subscribers only | `sub` |
| followers only, N minutes | `follow(1d)`, `follow(10m)` (exact duration), or `follow` for 0 |

After the second item a line break is inserted ("a, b,\nc"); with mod rights and no modes the
text is `none`. The mode menu (mods only) toggles Emote only, Subscriber only, Slow (asks
"Seconds:", default 10), R9K, Followers only (asks "Time:", default `15m`) (`:678-777`).

### 2.4 Header menu (kebab, or right-click on the header)

`SplitHeader.cpp:417-676`, in order:

1. Change channel (Ctrl+R) · Close (Ctrl+W)
2. Popup (Ctrl+N) · Popup overlay (Ctrl+Alt+N) · Search (Ctrl+F) · Set filters
3. Twitch channels: Open stream in browser · Open player in browser · Open in streamlink ·
   Open in custom player (if a scheme is set) · Open mod view in browser (mods) · Create a clip
   (Alt+X, only while live) · Reset /watching (watching split)
4. Whispers split: Open whispers in browser
5. Reconnect (Ctrl+F5) · Reload channel emotes (F5) · Reload subscriber emotes (F5); each reload
   is throttled to once per 30 s (`:1137-1174`)
6. How to... → move split, add/split
7. More → Toggle moderation mode · Enable /mention tab highlights (mentions split) · Show chatter
   list (mods) · Subscribe · Notify when live (checkbox) · Mute highlight sounds (checkbox) ·
   separator · Clear messages

Mouse: left press focuses and can start a drag; double-click opens "Change channel"; middle click
opens the stream in the browser (`:1010-1067`).

### 2.5 Input box

Layout (`src/widgets/splits/SplitInput.cpp:122-286`): an optional reply strip above an input row.
The input row has 1 px inner margins and contains the text edit, a hidden `SEND` button
(`/ui/showSendButton`, default off) and a right column with the character counter above the emote
button.

| Part | Value | Source |
| --- | --- | --- |
| Frame | 1 px border `#333` (dark themes) or `#ccc` (light), fill `splits.input.background` | `SplitInput.cpp:1178-1212` |
| Height | document height + margins + 5, one line = **37 px** with Arimo 11 pt (measured); max 150 (250 with a reply) | `src/widgets/helper/ResizingTextEdit.cpp:70-76`, `SplitInput.cpp:475-486` |
| Outer margin | 0 in dark themes, 2 in light themes | `SplitInput.cpp:1363-1379` |
| Font | chat font (`ChatMedium`); counter uses tabular digits | `SplitInput.cpp:1455-1469` |
| Text / placeholder colors | `messages.textColors.regular` / `chatPlaceholder` | `SplitInput.cpp:1386-1407` |
| Selection | `#68B1FF` in light themes, `tabs.selected.backgrounds.regular` in dark | `SplitInput.cpp:1397-1401` |
| Emote button | 24 x 18 SVG, opens the emote popup (Ctrl+E) | `SplitInput.cpp:226-232,351-358` |
| Self-message pulse | `backgroundPulse` fading to `background` over 500 ms when your own message arrives, only with `pulseTextInputOnSelfMessage` (default off) | `SplitInput.cpp:116-119,288-296`, `Split.cpp:873-886` |

### 2.6 Placeholder, sending, history, limit

- Placeholder: **`Log in to send messages...`** when anonymous, `Send message as <login>...`
  otherwise (`Split.cpp:749-773`).
- Enter and Shift+Enter send and clear; Ctrl+Enter and Ctrl+Shift+Enter send and keep the text
  (`HotkeyController.cpp:443-459`). Newlines become spaces before sending
  (`SplitInput.cpp:410-422`). There is no newline key by default.
- Up / Down walk the sent-message history; duplicates of the last entry and blank messages are not
  stored; the unsent draft is restored at the end (`SplitInput.cpp:458-473,572-647`).
- Limit **500** characters (`src/providers/twitch/TwitchCommon.hpp:16`). Default overflow mode
  `Highlight`: characters past 500 turn red; `Prevent` truncates
  (`SplitInput.cpp:1077-1127`, `Settings.hpp:176-177`).
- Counter: shown only with `showMessageLength` (default off), turns red past 500
  (`SplitInput.cpp:1129-1148`, `Settings.hpp:172-173`).
- `/r ` is rewritten to `/w <last whisperer> ` (`SplitInput.cpp:1084-1093`).

### 2.7 Completion

**Tab completion** (`src/widgets/helper/ResizingTextEdit.cpp:138-225`,
`src/controllers/completion/TabCompletionModel.cpp:78-172`):

- The word is the text from the last space to the cursor; it needs **at least 2 characters**
  (`ResizingTextEdit.cpp:157-163`, `TabCompletionModel.cpp:82`).
- Sources by prefix: `@` → users; `:` → emotes (in practice emoji short codes and emotes whose
  names start with `:`); first word starting with `/` or `.` → commands; otherwise the first word
  completes emotes, users and commands, later words emotes and users (users dropped when
  `userCompletionOnlyWithAt`, default off) (`TabCompletionModel.cpp:78-127`,
  `Settings.hpp:368-369`).
- Emote matching: case-insensitive **prefix** match (`prefixOnlyEmoteCompletion` default on),
  sorted case-insensitively, ties ordered so `LuL` comes before `LUL`
  (`src/controllers/completion/strategies/ClassicEmoteStrategy.cpp:77-121`,
  `src/util/Helpers.cpp:299-310`). Emoji only complete after `:` and insert `:shortcode: `
  (`src/controllers/completion/sources/EmoteSource.cpp:38-53`).
- User matching: lowercase prefix over the channel's recent chatters (LRU, most recent first,
  at most 2000), the broadcaster appended if missing (`ClassicUserStrategy.cpp:9-26`,
  `src/common/ChatterSet.hpp:23`, `UserSource.cpp:58-80`).
- Inserted text: emote `Name ` (trailing space); user `Name ` or **`Name, `** when it is the
  first word (`mentionUsersWithComma` default on); `@` stays when typed
  (`EmoteSource.cpp:85-91`, `UserSource.cpp:43-56`, `Helpers.cpp:215-226`).
- Pressing Tab again cycles forward (wrapping), Shift+Tab backward; typing any character or moving
  the cursor ends the cycle (`ResizingTextEdit.cpp:30-41,170-219`).
- Result order for mixed sources: emotes, then users, then commands; consecutive duplicates removed
  (`TabCompletionModel.cpp:56-59,159-168`).

**Popup completion** (`src/widgets/splits/SplitInput.cpp:872-1007`):

- Typing `:` at a word start opens an emote list above the input, horizontally centered, already
  with nothing typed after the colon; `@` opens a user list (`emoteCompletionWithColon`, `showUsernameCompletionMenu`, both default on,
  `Settings.hpp:370-373`). Any space before the cursor closes it.
- Emote list: case-insensitive **contains** match, exact match moved to the top, `:~` restricts to
  zero-width emotes, up to **200** rows, each "image + `Name - Provider`"
  (`ClassicEmoteStrategy.cpp:22-68`, `InputCompletionPopup.hpp:28`, `EmoteSource.cpp:75-83`).
  Provider labels: `Local Twitch Emotes`, `Twitch Emote`, `Channel BetterTTV`,
  `Channel FrankerFaceZ`, `Channel 7TV`, `Global BetterTTV`, `Global FrankerFaceZ`, `Global 7TV`,
  `Emoji` (`EmoteSource.cpp:93-144`).
- Tab or Enter accepts and inserts `Name ` (users `@Name ` or `@Name, `) (`SplitInput.cpp:972-1007`).

### 2.8 Replies

Right-click a username with Shift (default modifier) on that user's message, or the reply button
when `showReplyButton` is on, starts a reply: the input shows a strip with the replied message and
"Replying to @<name>" (bold chat font, `#ccc` / `#333`) with a cancel button, and the text is
prefixed `@<name> ` (`SplitInput.cpp:1235-1311`, `Settings.hpp:336-347`). Deleting the prefix
cancels the reply (`SplitInput.cpp:1150-1176`).

### 2.9 Default hotkeys

`src/controllers/hotkeys/HotkeyController.cpp:333-555`. On macOS Qt maps Ctrl to Cmd.

| Scope | Keys | Action |
| --- | --- | --- |
| Window | Ctrl+P | settings |
| Window | Ctrl+T | new split (opens channel dialog) |
| Window | Ctrl+1..8 / Ctrl+9 | tab 1..8 / last tab |
| Window | Ctrl+Tab / Ctrl+Shift+Tab | next / previous tab |
| Window | Ctrl+N / Ctrl+Shift+N | popup split / popup tab |
| Window | Ctrl++ / Ctrl+− / Ctrl+0 | zoom in / out (±0.1) / reset (`Window.cpp` `zoom`) |
| Window | Ctrl+Shift+T / Ctrl+Shift+W | new tab / close tab |
| Window | Ctrl+G | reopen last closed split |
| Window | Ctrl+H (not macOS) | toggle local r9k (hide similar) |
| Window | Ctrl+K | quick switcher |
| Window | Ctrl+U | toggle tab visibility |
| Split | Ctrl+W | close split |
| Split | Ctrl+R | change channel |
| Split | Ctrl+F / Ctrl+Shift+F | search this split / all splits |
| Split | Ctrl+F5 / F5 | reconnect / reload emotes |
| Split | Alt+X | create clip |
| Split | Alt+arrows (not macOS) | move focus |
| Split | PgUp / PgDown | scroll one page |
| Split | Ctrl+Home / Ctrl+End | top / bottom |
| Split | F10 | debug popup |
| Split | Ctrl+Alt+N / Ctrl+Shift+U | overlay window / overlay click-through |
| Input | Ctrl+E | emote popup |
| Input | Enter, Shift+Enter / Ctrl+Enter, Ctrl+Shift+Enter | send / send and keep text |
| Input | Home, End (+Shift selects) | start / end of input |
| Input | Up / Down | previous / next sent message |
| Popups | Esc, Enter, Ctrl+1..9, Ctrl+Tab, PgUp/PgDown, Ctrl+F | close, accept, tabs, scroll, focus search |

Copy is Ctrl+C (Qt standard), handled specially so a chat selection is copied even while the input
has focus (`SplitInput.cpp:777-788`).

---

## 3. Message rendering

### 3.1 Element order

A Twitch chat message is built in this order (`src/messages/MessageBuilder.cpp:1555-1762`):

1. Channel-point reward header (only for redemptions, `:1603-1615`).
2. `#channel` in system color (only shown in /mentions, /live and /automod views, `:1617`,
   `ChannelView.cpp:1424-1440`).
3. Reply context line when the message is a reply (section 3.12).
4. **Timestamp** (`:1648-1650`).
5. Moderation buttons, only in moderation mode (`:1652-1671`).
6. **Badges**: Twitch badges in IRC tag order, then Chatterino, FFZ, BTTV, 7TV (`:1673-1678`).
7. **Username** with the colon **inside** the same bold element: `name:` (no colon for `/me`)
   (`:2192-2264`).
8. **Words**: text, links, mentions, emotes, emoji, cheermotes (`:1693-1713`).
9. Reply button (hidden by default, `showReplyButton` off, `:1739-1759`, `Settings.hpp:215`).

Whispers render `sender -> you:` (`:2229-2251`). `/me` (action) messages use the username color
for the message text (`:1583-1587`).

**Username text** follows `usernameDisplayMode`, default "Username (Localized name)": when the
display name differs from the login only by case it shows the display name; otherwise
`login(Localized)` (`:194-241`, `Settings.hpp:189-191`).

**System messages** are a timestamp followed by system-colored words; URLs in them become links;
a name inside user notices becomes a clickable mention in that user's color
(`MessageBuilder.cpp:540-593`).

### 3.2 Fonts

| Style | Family | Size | Weight | Used for |
| --- | --- | --- | --- | --- |
| ChatMedium | chat font | chat size | `chatFontWeight` (Normal) | message text, input |
| ChatMediumBold | chat font | chat size | DemiBold (from `boldScale` 63) | usernames, mentions (if `boldUsernames`) |
| ChatMediumSmall | chat font | 0.8 x | chat weight | reply context line |
| TimestampMedium | chat font | chat size | chat weight, OpenType `tnum` | timestamps |
| ChatSmall / Large / VeryLarge | chat font | 0.6 / 1.2 / 1.4 x | chat weight | rare |
| UiMedium / UiTabs | default family | 9 pt | Normal | header, tabs, buttons |
| UiMediumBold | default family | 9 pt | Bold | user card name |
| Tiny | `Monospace` | 8 pt | Normal | moderation text buttons |

Sources: `src/singletons/Fonts.cpp:63-179,238-264`. The point size is truncated to an int after
scaling (`Fonts.cpp:242`). On this Linux machine `Arial` resolves to Arimo on the host and to
Liberation Sans inside the Flatpak (both Arial-metric clones).

### 3.3 Geometry of a message

| Rule | Value | Source |
| --- | --- | --- |
| Padding | 8 left, 4 top, 8 right, 4 bottom (times scale) | `MessageLayoutContainer.cpp:29,580-581,667-670,230` |
| Text element height | `QFontMetricsF(ChatMedium).height()` (16.4 px for Arimo 11 pt) | `MessageLayoutContainer.cpp:59-63`, `MessageElement.cpp:660-662` |
| Line height | tallest element on the line; **emote images count as height − 4** | `MessageLayoutContainer.cpp:672-685` |
| Vertical alignment | every element is bottom-aligned to the line; emote images are then moved down 2 px, so they overflow the line by 2 px at the top and bottom | `MessageLayoutContainer.cpp:183-197,720-723` |
| Word spacing | one space width of ChatMedium after each element with a trailing space | `MessageLayoutContainer.cpp:62,744-754` |
| Message height | `int(4 + Σ line heights + 4)` | `MessageLayoutContainer.cpp:230`, `MessageLayout.cpp:63-66` |
| Badge vs text | an 18 px badge makes the line 18 px, message 26 px | inference from the rules above |

Measured with Arimo 11 pt at scale 1: text-only message **24 px**, message with a 28 px emote
**32 px**, text starting at x = view x + 8 (+1 px glyph bearing).

The layout width is the view width, minus 8 px while the scrollbar is visible
(`ChannelView.cpp:3243-3251`).

### 3.4 Wrapping

- A text element is split on spaces into words; each word is a layout element
  (`MessageElement.cpp:631-639`). Runs of spaces collapse (`MessageBuilder.cpp:2325-2329`).
- A word that does not fit moves to the next line; a word wider than a whole line is broken at
  grapheme boundaries (no hyphen) (`MessageElement.cpp:670-815`).
- Images (emotes, badges) never split; they wrap like words (`MessageLayoutContainer.cpp:133-141`).
- Single-line reply context is elided with `…` (`MessageElement.cpp:890-1001`).
- Optional collapse after N lines (`collapseMessagesMinLines`, default 0 = never) ends with a green
  bold `...` (`#00D80A`); clicking expands (`MessageLayoutContainer.cpp:71-99`, `ChannelView.cpp:2406-2414`).
- Right-to-left words are reordered per line (`MessageLayoutContainer.cpp:149-165,757-840`).

### 3.5 Emotes

**Displayed size** = natural pixel size of the chosen image x that image's scale x UI scale x
`emoteScale` (default 1) (`MessageElement.cpp:218-235`, `src/messages/Image.cpp:496-507`).
There is **no maximum height** in 2.5.5 (`scaleEmotesByLineHeight` exists but nothing reads it,
`Settings.hpp:409-410`).

| Provider | Images (scale) | Typical display height | Source |
| --- | --- | --- | --- |
| Twitch | `static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0` (1), `2.0` (0.5), `3.0` (0.25) | 28 (a few old smileys 18-30) | `src/providers/twitch/TwitchEmotes.hpp:25-26`, `TwitchEmotes.cpp:26-41,215-230,453-480` |
| BetterTTV | `cdn.betterttv.net/emote/<id>/1x.webp` (1), `2x` (0.5), `3x` (0.25) | 28 | `src/providers/bttv/BttvEmotes.cpp:47-51,80-93` |
| FrankerFaceZ | API urls `1` (1), `2` (0.5), `4` (0.25); size from the API | per emote, usually 28-32 | `src/providers/ffz/FfzEmotes.cpp:45-63` |
| 7TV | WEBP files 1x, 2x, then 4x (3x if no 4x); scale relative to 1x width | 32 | `src/providers/seventv/SeventvEmotes.cpp:452-538` |
| Emoji | `pajbot.com/static/emoji-v2/img/twitter/64/<code>.png` at scale 0.35 | 22.4 | `src/providers/emoji/Emojis.cpp:281-313` |

**Which file** is drawn: `q = UI scale x DPR x emoteScale`; q > 2.001 uses the third image,
q > 1.001 the second, else the first, falling back to whichever is already loaded
(`src/messages/ImageSet.cpp:68-126`, `ChannelView.cpp:722-723`).

Missing images: the emote's name is drawn as text in the **system** color until it loads
(`MessageElement.cpp:223-226,253-268`).

**Zero-width emotes** (`MessageBuilder.cpp:2266-2313`):

- 7TV: emotes whose active-emote flag has ZeroWidth (`SeventvEmotes.cpp:63-72`).
- BTTV: only `SoSnowy`, `IceCold`, `SantaHat`, `TopHat`, `ReinDeer`, `CandyCane`, `cvMask`,
  `cvHazmat` (`BttvEmotes.cpp:37-40`).
- With `enableZeroWidthEmotes` (default on), a zero-width emote merges into the **immediately
  preceding element only if it is an emote** (or an existing layered emote); after text it renders
  as a normal emote.
- The merged element's box is the max width x max height of all layers; each layer is
  **bottom-center aligned** in that box (`MessageElement.cpp:304-341`,
  `MessageLayoutElement.cpp:23-28,251-320`).
- Tooltip: first layer big with its full description, others small with names, grid style when
  there are more than 2, capped at 7 entries (`ChannelView.cpp:2056-2113`).

**Spacing**: emotes keep the normal space after them; `removeSpacesBetweenEmotes` (default off)
removes the space between consecutive emotes (`MessageLayoutContainer.cpp:698-711`).

### 3.6 Badges

- Size 18 x 18 for every provider: Twitch (`src/providers/twitch/TwitchBadges.cpp:29`), FFZ
  (`FfzBadges.cpp:69-70`, `FfzEmotes.cpp:30`), Chatterino (`ChatterinoBadges.cpp:54`), BTTV Pro
  (72 px image at 18/72, `BttvBadges.cpp:24`), 7TV (1x WEBP, usually 18 px).
- Badges are drawn at their 18 px size times the UI scale and **ignore `emoteScale`** for their
  size (the 1x/2x/4x file choice still uses it) (`MessageElement.cpp:496-511`, `ImageSet.cpp:68-94`).
- FFZ badges paint their color as a background rectangle behind the image; the FFZ custom moderator
  badge paints `#34AE0A` behind it (`MessageElement.cpp:547-556,607-614`,
  `MessageLayoutElement.cpp:354-370`).
- Tooltips: badge title; subscriber `(<months> months)` or `(Tier N, <months> months)`; bits
  `Twitch cheer N`; predictions `Predicted <choice>` (`MessageBuilder.cpp:261-354`).
- Visibility groups (all on by default): global authority (staff, admin, global_mod), predictions,
  channel authority (lead_moderator, moderator, vip, broadcaster), subscription (subscriber,
  founder), vanity (everything else), Chatterino, FFZ, BTTV, 7TV
  (`src/providers/twitch/TwitchBadge.cpp:13-17`, `Settings.hpp:267-283`).

### 3.7 Timestamps

- Format setting, default `h:mm`; options: `h:mm`, `hh:mm`, `h:mm a`, `hh:mm a`, `h:mm:ss`,
  `hh:mm:ss`, `h:mm:ss a`, `hh:mm:ss a`, the same with `.zzz`, or disabled
  (`src/widgets/settingspages/GeneralPage.cpp:524-539`).
- Rendered with `QLocale("en_US")`, so without `a` the clock is **24-hour** (`17:04`)
  (`MessageElement.cpp:1178-1190`).
- System color, `TimestampMedium` (tabular digits) (`MessageElement.cpp:1184-1186`).
- Time source: `tmi-sent-ts` for live messages, `rm-received-ts` (fallback `tmi-sent-ts`) for
  history (`src/util/IrcHelpers.cpp:13-34`).

### 3.8 Theme colors

Themes: White, Light, Dark (default, also the fallback), Black (`src/singletons/Theme.cpp:282-306`,
`src/singletons/Theme.hpp:179-182`). White and Light are "light" themes (icon theme `dark`)
(`Theme.cpp:516-519`). Values from `resources/themes/<Name>.json`.

**Messages**

| Key | White | Light | Dark | Black |
| --- | --- | --- | --- | --- |
| background (regular) | `#ffffff` | `#e6e6e6` | `#191919` | `#000000` |
| alternate background | `#f5f5f5` | `#dddddd` | `#222222` | `#0a0a0a` |
| text | `#000000` | `#000000` | `#ffffff` | `#ffffff` |
| system text (timestamps, notices) | `#8c7f7f` | `#8c7f7f` | `#8c7f7f` | `#8c7f7f` |
| link | `#4286f4` | `#4286f4` | `#4286f4` | `#4286f4` |
| input placeholder | `#af9f9f` | `#af9f9f` | `#5d5555` | `#5d5555` |
| selection | `#40000000` | `#40000000` | `#40ffffff` | `#40ffffff` |
| disabled overlay | `#99ffffff` | `#99e6e6e6` | `#99191919` | `#99000000` |
| scroll-to flash start → end | `#6e141414` → `#00141414` | same | `#6ee6e6e6` → `#00e6e6e6` | same as Dark |
| message separator | `#7f7f7f` | `#7f7f7f` | `#3c3c3c` | `#3c3c3c` |

**Splits, header, input**

| Key | White | Light | Dark | Black |
| --- | --- | --- | --- | --- |
| split background | `#ffffff` | `#e6e6e6` | `#191919` | `#000000` |
| header background / border | `#ffffff` / `#ffffff` | `#e6e6e6` / `#e6e6e6` | `#2e2e2e` / `#383838` | `#050505` / `#121212` |
| header focused background / border | `#f2f2f2` / `#e6e6e6` | `#dbdbdb` / `#d1d1d1` | `#444444` / `#464646` | `#1a1a1a` / `#1c1c1c` |
| header text / focused text | `#000000` / `#0051a3` | `#000000` / `#0051a3` | `#ffffff` / `#84c1ff` | `#ffffff` / `#84c1ff` |
| input background / pulse / text | `#f2f2f2` / `#d2ffd2` / `#000000` | `#dbdbdb` / `#dbffdb` / `#000000` | `#242424` / `#245424` / `#ffffff` | `#080808` / `#083808` / `#ffffff` |
| input border (hard-coded) | `#ccc` | `#ccc` | `#333` | `#333` |
| drop preview / border | `#300094ff` / `#0094ff` | same | same | same |
| resize handle / background | `#0094ff` / `#500094ff` | same as White | `#700094ff` / `#200094ff` | same as Dark |

**Tabs and window**

| Key | White | Light | Dark | Black |
| --- | --- | --- | --- | --- |
| window background / text | `#ffffff` / `#000000` | `#ffffff` / `#000000` | `#111111` / `#eeeeee` | `#040404` / `#eeeeee` |
| divider line | `#b4d7ff` | `#b4d7ff` | `#555555` | `#555555` |
| regular: bg / line / text | `#ffffff` (hover `#eeeeee`) / `#ffffff` / `#444444` | same as White | `#252525` / `#444444` / `#aaaaaa` | `#0b0b0b` / `#444444` / `#aaaaaa` |
| new message: bg / line / text | `#ffffff` / `#bbbbbb` / `#222222` | same as White | `#252525` / `#888888` / `#eeeeee` | `#0b0b0b` / `#888888` / `#eeeeee` |
| highlighted: bg / line / text | `#ffffff` / `#ff0000` / `#000000` | same as White | `#252525` / `#ee6166` / `#eeeeee` | `#0b0b0b` / `#ee6166` / `#eeeeee` |
| selected: bg / line / text | `#b4d7ff` / `#00aeef` / `#000000` | same as White | `#555555` / `#00aeef` / `#ffffff` | `#333333` / `#00aeef` / `#ffffff` |
| live / rerun dot | `#ff0000` / `#c7c715` | same | same | same |

**Scrollbar**: background transparent; thumb / pressed thumb White `#b3b3b3`/`#a6a6a6`, Light
`#a8a8a8`/`#9e9e9e`, Dark `#575757`/`#616161`, Black `#4d4d4d`/`#595959`.

Hover backgrounds of tabs are defined but not used (the hover line color is) (`NotebookTab.cpp:896-899`).
**master** adds `splits.input.searchHighlightBackground` and `searchFailText` to every theme.

### 3.9 Highlight backgrounds

Highlights are **blended into an opaque background** (`base*(1-a) + color*a`), not drawn as a
translucent layer (`MessageLayout.cpp:30-38,366-460`). Only one applies, in this priority:

1. Elevated (paid pinned) message (`enableElevatedMessageHighlight`)
2. First message in the channel (`enableFirstMessageHighlight`)
3. Watch streak
4. Highlighted (mention, highlight phrase, user, badge, reply thread) or highlighted whisper,
   using the color that matched first
5. Subscription
6. Channel-point redemption or "highlight my message" redemption
7. AutoMod: blended AutoMod color, or flat `#404040`
8. Debug `#4A273D`

Default colors (`src/controllers/highlights/HighlightPhrase.cpp:18-31`,
`src/providers/colors/ColorProvider.cpp:108-141`) and the resulting opaque backgrounds
(computed with the formula above; may differ by 1 from Qt's rounding):

| Highlight (R,G,B,A) | White | Light | Dark | Black |
| --- | --- | --- | --- | --- |
| Self mention / default phrase (127,63,73,127) | `#bf9fa4` | `#b39398` | `#4c2c31` | `#3f1f24` |
| Self message, off by default (0,118,221,115) | `#8cc1f0` | `#7eb3e2` | `#0e4371` | `#003564` |
| Subscription (196,102,255,100) | `#e8c3ff` | `#d9b4f0` | `#5c3773` | `#4d2864` |
| Watch streak (0,130,255,70) | `#b9ddff` | `#a7cbed` | `#123658` | `#002446` |
| Redemption (28,126,141,60) | `#cae1e4` | `#b6ced1` | `#1a3134` | `#071e21` |
| First message (72,127,63,60) | `#d4e1d2` | `#c1cebf` | `#243122` | `#111e0f` |
| Elevated (255,174,66,60) | `#ffecd3` | `#ecd9bf` | `#4f3c23` | `#3c2910` |
| Reply thread (143,48,24,60) | `#e5cec9` | `#d2bbb6` | `#351e19` | `#220b06` |
| Whisper, only with `highlightInlineWhispers` (127,63,73,127) | `#bf9fa4` | `#b39398` | `#4c2c31` | `#3f1f24` |
| AutoMod (64,64,64,255) | `#404040` | `#404040` | `#404040` | `#404040` |

Redemptions additionally get a 4 px bar on the left edge in the redemption color, except in
/mentions (`MessageLayout.cpp:275-288`; **master** removed the bar).

### 3.10 Username colors and readability

1. User color from user data overrides, else the IRC `color` tag, else (with `colorizeNicknames`,
   default on) one of 15 Twitch defaults chosen by `userID % 15`: `#ff0000`, `#0000ff`, `#00ff00`,
   `#b22222`, `#ff7f50`, `#9acd32`, `#ff4500`, `#2e8b57`, `#daa520`, `#d2691e`, `#5f9ea0`,
   `#1e90ff`, `#ff69b4`, `#8a2be2`, `#00ff7f`; else `#999999`
   (`MessageBuilder.cpp:1895-1927`, `src/util/Helpers.cpp:196-213`,
   `src/providers/twitch/TwitchCommon.cpp:9-25`, `MessageBuilder.hpp:332`).
2. **Every text color** (usernames, mentions, system text, links) passes through
   `Theme::normalizeColor` at layout time (`MessageElement.cpp:657-658`, `Theme.cpp:616-652`).
   With HSL hue H in [0,1), saturation S, lightness L:
   - Dark/Black: if L < 0.5 then L = 0.5; then if L < 0.6 and 0.54444 < H < 0.83333 (blues and
     purples) L += sin((H − 0.54444) / 0.28886 · π) · S · 0.4.
   - White/Light: if L > 0.5 then L = 0.5; then if L > 0.4 and 0.1 < H < 0.33333 (yellows and
     greens) L −= sin((H − 0.1) / 0.2333 · π) · S · 0.4.
   Consequence: in light themes the link color `#4286f4` and system `#8c7f7f` also render darker.
3. `@mentions` in message text use the mentioned user's last seen color in that channel and the
   bold username font (`MessageBuilder.cpp:1798-1831`, `MessageElement.cpp:1087-1109`).

### 3.11 Deleted, timed out, banned and historical messages

- **Disabled** messages (deleted, author timed out or banned, chat cleared) are drawn normally and
  then covered by a full-message fill of the theme `disabled` color, which is the split background
  at 60 % alpha (`MessageLayout.cpp:249-260`). With `hideModerated` (default off) they are removed
  instead (`MessageLayout.cpp:146-162`).
- **History** (recent-messages) has the `RecentMessage` flag and gets the **same overlay** when
  `fadeMessageHistory` (default on) (`MessageLayout.cpp:262-273`, `Settings.hpp:180-181`).
- The overlays stack: a deleted message from history is covered twice.
- Equivalent opacity: 0.4 over the background, 0.16 when doubled. Dark theme results (measured,
  exact): white text `#ffffff` → `#757575`, system `#8c7f7f` → `#474242`; doubled white →
  `#3e3e3e`. Black theme: `#666666`; White theme: black text → `#999999`.
- Animated emotes are drawn **after** the buffer but before the overlay, so they fade too
  (`MessageLayout.cpp:242-273`).

### 3.12 Other per-message decorations

| Decoration | Default | Look | Source |
| --- | --- | --- | --- |
| Alternating background | off | every other message uses `alternate` background | `MessageLayout.cpp:378-386`, `Settings.hpp:219-220` |
| Separator line | off | 1 px `messageSeperator` at the top of each message | `MessageLayout.cpp:297-308`, `Settings.hpp:178-179` |
| Last-read line | off | 1 px at the bottom of the last message seen before switching away, `#7f2026` | `MessageLayout.cpp:310-335`, `Settings.hpp:163-170` |
| Scroll-to flash | on jump | 1500 ms fill from `highlightAnimationStart` to `End` | `ChannelView.cpp:365-373,1531-1543,1672-1687` |
| Reply context | on | first line: a curve (`#888`, 1.5 px, 18 px wide, radius 6, round cap), "Replying to" (system, 0.8x), `@name:` (user color, 0.8x), the parent message on one line elided with `…` (0.8x) | `MessageBuilder.cpp:2032-2135`, `MessageElement.cpp:1334-1349`, `MessageLayoutElement.cpp:617-662` |
| Leading `@name` in replies | stripped | removed from the reply text (`stripReplyMention`) | `src/providers/twitch/IrcMessageHandler.cpp:92-125` |
| Day change | on | system message with the long date, e.g. "Sunday, November 8, 2026", timestamp 0:00 | `ChannelView.cpp:954-964`, `src/providers/recentmessages/Impl.cpp:59-75` |

### 3.13 Scrollbar and highlight markers

`src/widgets/Scrollbar.cpp`:

- A 16 px wide overlay on the right edge of the view, shown only while content overflows
  (`:40,383`, `ChannelView.cpp:738-800`).
- The thumb is painted **4 px wide** at the right edge, full 16 px while the mouse is over the
  scrollbar (`:291-321`). Height `pageSize/messageCount x track + 10` (min 10)
  (`:21,468-485`). Hidden with `hideScrollbarThumb`.
- Units are messages: value 12.3 means message 12 at the top, scrolled 30 % into it
  (`ChannelView.cpp:699-736`).
- Clicking above or below the thumb moves 5 messages (`:24,444-456`). Animations last 150 ms,
  `OutCubic`, when smooth scrolling (default on) (`:41-43,172-209`, `Settings.hpp:231`).
- **Markers**: one slot per message in the buffer, spread over the full height:
  `dY = height / messageCount`, marker height `ceil(max(2, dY))` (`:323-331`).
  - Default style: a centered stripe `x = w/8*3`, width `w/4` (6 px of 16) (`:364-367`).
  - Line style: 1 px full-width line (`:370-373`).
  - Color = the message's highlight color with alpha forced to 255 (`:358-359`).
  - Which messages: highlighted messages and whispers (their color), watch streaks,
    subscriptions, redemptions, elevated messages, first messages, AutoMod messages
    (`src/messages/Message.cpp:36-103`); redemption, first-message and elevated markers obey their
    enable settings. Not shown in /mentions (`ChannelView.cpp:926-929`).

### 3.14 Scrolling and staying at the bottom

- Wheel: `angleDelta.y * 1.5 * mouseScrollMultiplier` pixels, converted through the real heights
  of the messages it crosses (`ChannelView.cpp:1754-1870`). Ctrl+wheel is reserved for zoom.
- PgUp/PgDown scroll one page, Ctrl+Home/End jump (`Split.cpp:402-438`).
- Middle click starts autoscroll: no movement within the cursor height, then speed
  `0.02 x (distance − cursor height)` messages per 20 ms tick (`ChannelView.cpp:2233-2260,3261-3315`).
- New messages: when the view was at the bottom it stays at the bottom (smoothly only with
  `smoothScrollingNewMessages`, default off); otherwise the position is kept while the buffer
  shifts (`ChannelView.cpp:684-686,791-800,1185-1211`).
- History arriving at the start keeps the view at the bottom, or shifts it by the number of
  inserted messages (`ChannelView.cpp:1239-1289`).

### 3.15 Pausing

- Reasons: mouse hover, a held keyboard modifier (`pauseChatModifier`, default none), double click
  (200 ms when links need double-click) (`ChannelView.cpp:483-581`, `Split.cpp:230-238`).
- **Hover pause is off by default** (`pauseOnHoverDuration` 0). Options: Disabled, 0.5 s, 1 s,
  2 s, 5 s, Indefinite (−1). With a duration, each mouse move restarts the timer; Indefinite pauses
  until the mouse leaves; leaving always unpauses (`Settings.hpp:396`,
  `GeneralPage.cpp:313-345`, `ChannelView.cpp:1880-1885,1952-1962`).
- While paused the view keeps an old snapshot: new messages are counted and applied on unpause
  (`ChannelView.cpp:903-912,1185-1200,532-552`).
- Indicator, top-left: a black `rgba(0,0,0,200)` box, two 5 x 20 bars and the text "Paused" at
  20 px in `rgb(180,180,180)` (`ChannelView.cpp:1556-1590`).

### 3.16 "More messages below"

A full-width button, 26 px tall at the bottom of the view, text "More messages below" in the UI
font, style `background-color: rgba(0,0,0,0.66); color: #FFF;`, visible while the scrollbar is
shown and not at the bottom; clicking scrolls to the bottom after 180 ms
(`ChannelView.cpp:381-394,694-696,1370-1371`). It does not show an unseen-message count.

### 3.17 Selection and copy

- Press and drag selects by character; double-click selects a word, dragging after a double-click
  extends by words; triple-click selects the message text without timestamp, badges and name
  (`ChannelView.cpp:1985-2004,2269-2313,2945-2995,3253-3259`).
- Selected lines are filled with `messages.selection` over the full line height (the first and last
  lines extend into the message padding) (`MessageLayoutContainer.cpp:108-114,279-330,841-853`).
- Copy (Ctrl+C) joins messages with `\n`; it includes timestamps and `name:`; emotes copy as
  their names; badges copy nothing (`ChannelView.cpp:822-865`,
  `MessageLayoutContainer.cpp:332-390`, `MessageLayoutElement.cpp:136-150`).
- Shift + right-click adds "Copy message ID" and "Copy message JSON" (`ChannelView.cpp:226-260`).

### 3.18 Mouse on messages

| Input | Target | Result | Source |
| --- | --- | --- | --- |
| Hover | emote / badge | tooltip with a larger image (3x) and the description, 16 px below-right of the cursor | `ChannelView.cpp:2028-2151` |
| Hover | link | pointer cursor; tooltip only with `linkInfoTooltip` (default off) | `ChannelView.cpp:2028-2032,2153-2161` |
| Left click | username / mention | user card | `ChannelView.cpp:3060-3205` |
| Left click | link / emote | open link / emote context | `ChannelView.cpp:2425-2457` |
| Right click | username | inserts `@name ` (`@name, ` as the first word) into the input; with Shift on the message's author: reply instead; no context menu | `ChannelView.cpp:2459-2554`, `Settings.hpp:336-347` |
| Right click | elsewhere | context menu (copy, links, emote image links, ...) | `ChannelView.cpp:2585-2943` |
| Middle click | username | user card / twitch.tv page | `ChannelView.cpp:2353-2386` |

The user card opens offset so the cursor sits at 1/3 width and 1/5 height of the card
(`ChannelView.cpp:3007-3031`).

---

## 4. Twitch handling

### 4.1 Connection

- Server `irc.chat.twitch.tv:443` over TLS (`src/common/Env.cpp:83-86`).
- Capabilities `twitch.tv/tags`, `twitch.tv/commands`, plus `twitch.tv/membership` on the read
  connection (`src/providers/twitch/TwitchIrcServer.cpp:273-284`).
- Anonymous login: nick **`justinfan64537`**, no password (`TwitchCommon.hpp:14`,
  `TwitchIrcServer.cpp:286-301`, `TwitchAccountManager.cpp:231`).
- Joins are rate-limited to 18 per 12.5 s, visible channels first (`TwitchIrcServer.cpp:50-52,459-475`).

System messages around the connection (all system color):

| Event | Text | Source |
| --- | --- | --- |
| IRC connected | `connected` | `TwitchIrcServer.cpp:477-498` |
| Connection lost | `disconnected` | `TwitchIrcServer.cpp:508-531` |
| Reconnected (last message was `disconnected`) | that line is **replaced** by `reconnected` | `TwitchIrcServer.cpp:485-497` |
| Own JOIN echo (also for the anonymous nick) | `joined channel` | `IrcMessageHandler.cpp:1066-1071` |
| Own PART | `Your connection to this channel was unexpectedly dropped.` + link `Try reconnecting.` | `IrcMessageHandler.cpp:59-90,1099-1103` |
| Anonymous only: channel badges fail | `Failed to load channel badges - OAuth token is missing` (measured; text after the dash is Twitch's error) | `TwitchChannel.cpp:1820-1860` |

Startup order seen in a split (measured): history (faded), `connected`, `joined channel`, the
badge error when anonymous, then live messages.

### 4.2 IRC command → visible result

| IRC | Result | Source |
| --- | --- | --- |
| PRIVMSG | chat message (3.1). `first-msg=1` → first-message background; `msg-id` contains `highlighted-message` → redemption background; `custom-reward-id` → reward header; `pinned-chat-paid-amount` → elevated; `rm-deleted` → disabled | `MessageBuilder.cpp:1603-1650` |
| USERNOTICE sub, resub, subgift, bitsbadgetier, ritual, announcement, viewermilestone | if the user wrote a message: **the user's message first** (Subscription background, highlight removed except for announcements), **then** the system line | `IrcMessageHandler.cpp:47-55,774-929,1232-1249` |
| other USERNOTICE (raid, submysterygift, ...) | only the system line from `system-msg` | `IrcMessageHandler.cpp:784-928` |
| USERNOTICE in shared chat from another channel | dropped unless it's an announcement | `IrcMessageHandler.cpp:736-756` |
| CLEARCHAT with a user | timeout or ban line; all that user's messages disabled | `IrcMessageHandler.cpp:192-228,496-559` |
| CLEARCHAT without a user | `Chat has been cleared by a moderator.`; every non-system message disabled | `IrcMessageHandler.cpp:202-209`, `src/common/Channel.cpp:172-184` |
| CLEARMSG | target message disabled + deletion line (unless `hideDeletionActions`) | `IrcMessageHandler.cpp:561-611` |
| NOTICE | system line with Twitch's text, with special cases below | `IrcMessageHandler.cpp:233-284,931-1053` |
| ROOMSTATE | updates room modes; first room-id triggers history, live polling, BTTV/FFZ/7TV channel emotes, badges | `IrcMessageHandler.cpp:440-494`, `TwitchChannel.cpp:981-995` |
| USERSTATE | your mod/vip/staff state | `IrcMessageHandler.cpp:613-665` |
| WHISPER | added to /whispers, and inline into every channel (`inlineWhispers` default on) as `sender -> you: text` | `IrcMessageHandler.cpp:667-709` |
| JOIN/PART of others | only with `showJoins` / `showParts` (default off) | `IrcMessageHandler.cpp:1072-1076,1092-1097` |

### 4.3 Exact texts

From the code and the 2.5.5 test snapshots (`tests/snapshots/IrcMessageHandler/*.json` at `v2.5.5`):

| Case | Text |
| --- | --- |
| Timeout | `nerixyz has been timed out for 1s.` (durations like `10m`, `1h 5m`, `1d`: `d h m s`, up to 4 parts) |
| Ban | `<user> has been permanently banned.` |
| Repeated timeout within 5 s and the last 20 messages | the old line is replaced: `twitchdev has been timed out for 10m. (3 times)` |
| Clear chat | `Chat has been cleared by a moderator.`; stacked: `... (4 times)` |
| Deletion | `A message from kooby_ was deleted: sup`; text cut at 50 characters + `…` (`deletedMessageLengthLimit`) |
| Resub with message | line 1 `Great stream -- keep it up!` (user), line 2 `ronni has subscribed for 6 months!` |
| Resub without message | `cspice just subscribed with a Tier 2 sub. cspice subscribed for 12 months in a row!` |
| Prime sub | `byebyeheart just subscribed with Twitch Prime!` |
| Multi-month sub | `foly__ subscribed at Tier 1 for 6 months in advance!` |
| Multi-month resub | `calm__like_a_tom subscribed at Tier 3 for 6 months in advance, reaching 9 months cumulatively so far!` |
| Gift | `TWW2 gifted a Tier 1 sub to Mr_Woodchuck!`; first gift adds ` This is their first Gift Sub in the channel!` |
| Multi-month gift | `Lucidfoxx gifted 12 months of a Tier 1 sub to OGprodigy!`; anonymous gifter `An anonymous user ...`; plus ` They've gifted N months in the channel.` when more |
| Raid | `2 raiders from nerixyz have joined!` |
| Announcement | user message line, then a system line `Announcement` |
| Bits badge | `<name> just earned a new <N> Bits badge!` |
| Live (from polling) | `<Name> is live!` (bold name, **regular text color**) or `<Name> is live: <title>` with `showTitleInLiveMessage` |
| Offline | `<Name> is now offline.` |
| Timed out yourself | `You are timed out for <time>.` |
| Banned yourself | `You were banned from this channel!` + link `If you believe you have been unbanned, try reconnecting.` |
| Login expired | `Login expired for user "<name>"!` + link `Try adding your account again.` |
| History service down | `Message history service unavailable (Error: <error>)` |
| History gap | `Message history service recovering, there may be gaps in the message history.` |

Sources: `MessageBuilder.cpp:680-789,1193-1253,1292-1333,1515-1553`,
`IrcMessageHandler.cpp:59-90,233-284,791-883`, `src/util/FormatTime.cpp:129-160`,
`src/providers/recentmessages/Api.cpp:84-108`, `Settings.hpp:356-359`.

In system lines the user's name is a clickable mention in their color (`MessageBuilder.cpp:567-678`).

**Timeout stacking** (`src/util/ChannelHelpers.hpp:23-136`, `src/common/TimeoutStackStyle.hpp:7-13`):
default style "don't stack beyond user message": a new timeout replaces an earlier timeout line for
the same user only within the last 5 s and 20 messages and only if that user hasn't written in
between; the replacement shows the count.

### 4.4 Recent messages (history)

| Fact | Value | Source |
| --- | --- | --- |
| Endpoint | `https://recent-messages.robotty.de/api/v2/recent-messages/<channel>?limit=<n>` (env `CHATTERINO2_RECENT_MESSAGES_URL` overrides) | `src/common/Env.cpp:76-79`, `src/providers/recentmessages/Impl.cpp:87-118` |
| Limit | `/misc/twitch/messageHistoryLimit`, default **800** | `Settings.hpp:714-717` |
| Enabled | `/misc/twitch/loadMessageHistoryOnConnect`, default on | `Settings.hpp:712-713` |
| When | when ROOMSTATE first sets the room id (after the join) | `TwitchChannel.cpp:981-995,1433-1498` |
| Parse | each JSON string in `messages` is a raw IRC line run through the normal handler | `Impl.cpp:20-83` |
| Marking | every built message gets `RecentMessage` (faded, 3.11); sounds and alerts off | `Impl.cpp:49`, `MessageBuilder.cpp:1725-1729` |
| Day separators | inserted between messages of different days | `Impl.cpp:59-75` |
| Merge on join | **prepended** before existing messages (`connected`, `joined channel`); no dedup against live messages | `TwitchChannel.cpp:1462`, `Channel.cpp:186-200` |
| Merge on reconnect | limit `min((seconds offline + 1) x 10, limit)`; inserted by id dedup and time order | `TwitchChannel.cpp:1500-1560`, `Channel.cpp:202-291` |
| Mentions | highlighted history is merged into /mentions | `TwitchChannel.cpp:1465-1479` |

**master** adds a settings field for the URL (`/misc/twitch/messageHistoryUrl`).

### 4.5 Message limit

Each channel and each split view keep at most `/misc/scrollback/splitLimit` = **1000** messages,
dropping the oldest (`Settings.hpp:718-721`, `src/common/Channel.cpp:24`,
`src/widgets/splits/Split.cpp:92-93`). The user card keeps 1000 (`Settings.hpp:722-725`).

### 4.6 Emote providers and precedence

- **Twitch emotes come from the IRC `emotes` tag** (character ranges) and win at those positions
  (`MessageBuilder.cpp:2315-2407`).
- Remaining words: emoji are parsed out first; each remaining fragment is looked up as
  **FFZ channel → BTTV channel → 7TV channel → FFZ global → BTTV global → 7TV global**, then link,
  then `@mention`, else text (`MessageBuilder.cpp:459-519,1769-1865`).

| Provider | Endpoint | Source |
| --- | --- | --- |
| BTTV global / channel | `https://api.betterttv.net/3/cached/emotes/global`, `.../3/cached/users/twitch/<roomId>` | `src/providers/bttv/BttvEmotes.hpp:39-41` |
| FFZ global / channel | `https://api.frankerfacez.com/v1/set/global`, `.../v1/room/id/<roomId>` | `src/providers/ffz/FfzEmotes.cpp:250,283` |
| 7TV | `https://7tv.io/v3/users/twitch/<roomId>`, `https://7tv.io/v3/emote-sets/<id>` | `src/providers/seventv/SeventvAPI.cpp:15-17` |
| Live updates | BTTV and 7TV event APIs on by default | `Settings.hpp:432,438` |

Emote tooltips: `<name><br>Twitch Emote`, `<name><br>Global BetterTTV Emote`,
`<name><br>Channel BetterTTV Emote<br>By: <channel>` (`Shared ... By: <author>` for shared emotes), `<name><br>Channel 7TV Emote<br>By: <author>`
(`TwitchEmotes.cpp:475`, `BttvEmotes.cpp:93,126-133`, `SeventvEmotes.cpp:74-91`).

### 4.7 Badge sources and order

Order in a message: **Twitch** (tag order from IRC, e.g. broadcaster, moderator, vip, subscriber,
then others), **Chatterino**, **FFZ** (global badges, then channel badges such as custom VIP/mod),
**BTTV**, **7TV** (`MessageBuilder.cpp:1673-1678,2409-2530`). Shared chat messages first get a
badge with the source channel's avatar (`MessageBuilder.cpp:413-457,2419-2465`).

| Source | Where from | Source |
| --- | --- | --- |
| Twitch global | Helix `chat/badges/global`; falls back to the bundled `resources/twitch-badges.json` (anonymous) | `src/providers/twitch/TwitchBadges.cpp:35-139` |
| Twitch channel (sub, bits) | Helix `chat/badges?broadcaster_id=` (needs login) | `TwitchChannel.cpp:1820-1860` |
| Chatterino | `https://api.chatterino.com/badges` | `src/providers/chatterino/ChatterinoBadges.cpp:38` |
| FFZ | `https://api.frankerfacez.com/v1/badges/ids` | `src/providers/ffz/FfzBadges.cpp:57` |
| BTTV Pro | BTTV live-update socket | `src/providers/bttv/BttvBadges.cpp` |
| 7TV | 7TV event API cosmetics | `src/providers/seventv/SeventvBadges.cpp` |

### 4.8 Live status

- Polled with Helix `streams` for all channels every **30 s**, in batches of 100; newly joined
  channels are checked within 1 s (`src/controllers/twitch/LiveController.hpp:36-46`,
  `LiveController.cpp:23-52`).
- Going live adds `<Name> is live!` (also on the first check when the channel is already live at
  join); going offline adds `<Name> is now offline.`; the tab dot and header ` (live)` follow
  (`TwitchChannel.cpp:588-670`).
- **Anonymous users get none of this**: Helix is called without a token and fails (the log shows
  "Failed stream check request"), so no live dot, no viewer count, no live/offline lines, no
  sub badges, no user-card data (`TwitchAccountManager.cpp:374-392`,
  `src/providers/twitch/api/Helix.cpp:3810-3850`; measured).

---

## 5. Popups and features

### 5.1 User card (`src/widgets/dialogs/UserInfoPopup.cpp`)

Title `<DisplayName>'s Usercard - #<channel>` (`:61,962-963`). Closes on focus loss unless pinned
(`autoCloseUserPopup` default on). Layout top to bottom:

| Row | Content | Source |
| --- | --- | --- |
| Head | 100 x 100 avatar button (left click opens twitch.tv/<login>, right click: open/copy avatar, open channel in popup or new tab) | `:276-353` |
| Head, right column | bold name (UI bold) + copy button, live dot (5 px, tooltip `Live with N viewers`), localized name + copy (only if it differs), `ID: <id>` in `#aaa` + copy, pin button | `:355-396`, `src/widgets/helper/LiveIndicator.cpp:17-78` |
| | `Pronouns: ...` (only with `showPronouns`, default off) | `:399-403` |
| | `Followers: <n>` (Helix channel followers) | `:404-405,985-998` |
| | `Created: <yyyy-mm-dd>` (tooltip "N years ... ago") | `:406-407,964-969` |
| | `❤ Following since <yyyy-MM-dd>` and `★ Tier N - Subscribed for M months` / `★ Previously subscribed for M months` / `Subscription status hidden` from `https://api.ivr.fi/v2/twitch/subage/<user>/<channel>` | `:408-409,1055-1095`, `src/providers/IvrApi.cpp:23,42` |
| Line | | `:413` |
| Actions | `Block`, `Ignore highlights` checkboxes, `Add notes`, `Usercard` (opens Twitch's viewer card), mod/unmod/vip/unvip 30 px buttons (broadcaster only) | `:416-502` |
| Notes | markdown preview of user notes, hidden when empty | `:504-507` |
| Moderation | timeout buttons 1s 30s 1m 5m 30m 1h 1d 1w + ban/unban (mods only) | `:509-585`, `Settings.hpp:780-789` |
| Line | | `:587` |
| Messages | the user's messages from this split (filtered copy, live-updating), min 400 x 275; or "No recent messages" | `:589-607,866-902` |

While loading, labels show `(loading...)`; on failure `(not available)` (`:59-66,906-918`).

### 5.2 Emote popup (`src/widgets/dialogs/EmotePopup.cpp`)

- Window title `Emotes in #<channel>`; default size 300 x 500; position and size remembered in
  `window-layout.json` `emotePopup` (`:266-272,461`, `WindowManager.cpp:403-415`).
- Top: search box with 8 px margins, placeholder `Search all emotes...`, contains-match across all
  sources (`:281-301,535-670`).
- Tabs: **Subs**, **Channel**, **Global**, **Emojis** (`:331-334`).
  - Subs: `<channel> (Follower)` local emotes, the current channel's sets first, then other
    subscription sets alphabetically (`:130-169`).
  - Channel: sections `BetterTTV`, `FrankerFaceZ`, `7TV` (`:494-509`).
  - Global: Twitch global sets, then `BetterTTV`, `FrankerFaceZ`, `7TV` (`:512-526`).
  - Emojis: grouped by category, "Component" last (`:172-215`).
- Each section is a centered title line followed by one centered message holding all emotes sorted
  by name, at chat emote size without the compact offset (`:45-122`); an empty section shows
  `no emotes available`.
- Clicking inserts the emote name plus a space (and a leading space when needed) into the input
  (`SplitInput.cpp:368-400`).

### 5.3 Search popup (`src/widgets/helper/SearchPopup.cpp`)

- Title `Searching in <channel>'s history` (`/mentions`, `/whispers`, automod variants); size
  400 x 600; search box with 8 px margins, placeholder `Type to search`; results are a normal chat
  view (`:31-86,180-199,290-336`).
- Prefills with the selected chat text (`:76-84`).
- Query syntax (`:340-408`): plain words (substring), `from:<user>`, `badge:<name>`,
  `subtier:<n>`, `has:link`, `in:<channel>`, `is:<flag>`, `regex:<re>`, quoted values, and a `!`
  or `-` prefix to negate. Ctrl+Shift+F searches all splits of the tab.

### 5.4 Highlights and ignores

- Check order: subscriptions → whispers → message phrases (self name first) → users → reply
  threads → badges; the first match sets color, sound, alert and "show in mentions"
  (`src/controllers/highlights/HighlightController.cpp:453-549`).
- **Self highlight** (only when logged in): your login as a case-insensitive phrase bounded by
  `(?:\b|\s|^)` and `(?:\b|\s|$)`, shown in mentions, with sound and taskbar flash
  (`HighlightController.cpp:190-206`, `HighlightPhrase.cpp:13-14,43-62`, `Settings.hpp:500-511`).
- Defaults: no custom phrases, users, badges or ignores; Twitch blocked users are ignored
  (`Settings.hpp:483-485,815-833`); sub, whisper, redemption, first-message, elevated, watch-streak,
  AutoMod and reply-thread highlights enabled (`Settings.hpp:500-612`).
- Window alert flashes the taskbar for 2500 ms (`WindowManager.cpp:579-587`).

### 5.5 Mentions

`/mentions` is a special channel, added with the "Open channel" dialog and saved as
`"data": {"type": "mentions"}`. Every message with `Highlighted` + `ShowInMentions` is copied
there (including from history), shown with a leading `#channel`, without scrollbar markers and
without the redemption bar (`IrcMessageHandler.cpp:1260-1268`, `ChannelView.cpp:926-929,1424-1440`,
`MessageLayout.cpp:275-278`). "Enable /mention tab highlights" (`highlightMentions`, default on)
controls whether it marks its tab.

### 5.6 Settings defaults that matter here

| Setting path | Default | Effect |
| --- | --- | --- |
| `/appearance/theme/name` | `Dark` | theme (`Theme.hpp:179`) |
| `/appearance/currentFontFamily`, `currentFontSize` | platform default (`Arial` 11 on Linux) | chat font |
| `/appearance/uiScale2` | 1 | zoom |
| `/appearance/messages/showTimestamps` | true | timestamps |
| `/appearance/messages/timestampFormat` | `h:mm` | 24-hour |
| `/appearance/messages/alternateMessageBackground` | false | |
| `/appearance/messages/separateMessages` | false | |
| `/appearance/messages/fadeMessageHistory` | true | history overlay |
| `/appearance/messages/hideModerated` | false | disabled messages stay visible |
| `/appearance/messages/usernameDisplayMode` | 3 (`Username(Localized)`) | |
| `/appearance/messages/colorizeNicknames` | true | random color when none |
| `/appearance/messages/boldUsernames`, `colorUsernames` | true, true | @mention style |
| `/appearance/messages/collapseMessagesMinLines` | 0 | never collapse |
| `/appearance/messages/showMessageLength` | false | counter hidden |
| `/appearance/showEmptyInputBox` | true | input always visible |
| `/appearance/showTabCloseButton`, `showTabLiveButton` | true, true | |
| `/appearance/smoothScrolling`, `smoothScrollingNewMessages` | true, false | |
| `/appearance/scrollbar/hideThumb`, `hideHighlights` | false, false | |
| `/appearance/badges/*` | all true | |
| `/emotes/scale` | 1 | emote size |
| `/emotes/enableGifAnimations` | true | animated emotes |
| `/emotes/enableZeroWidthEmotes` | true | |
| `/behaviour/pauseOnHoverDuration` | 0 (disabled) | |
| `/behaviour/autocompletion/prefixOnlyCompletion` | true | Tab = prefix match |
| `/behaviour/mentionUsersWithComma` | true | `Name, ` at message start |
| `/links/linkLowercase` | true | domains shown lowercase |
| `/links/linkInfoTooltip` | false | |
| `/misc/twitch/loadMessageHistoryOnConnect` | true | |
| `/misc/twitch/messageHistoryLimit` | 800 | |
| `/misc/scrollback/splitLimit` | 1000 | |
| `/whispers/enableInlineWhispers` | true | |
| `/streamerMode/enabled` | 2 (detect streaming software) | hides avatars, thumbnails, mod actions while streaming |

Sources: `src/singletons/Settings.hpp:151-747`.

---

## 6. Performance architecture

How Chatterino keeps CPU low, in the order a frame happens:

1. **Immutable messages, cheap views.** A `Message` is built once and frozen; deletions and
   timeouts only flip flags (`src/common/Channel.cpp:109-139`, `ChannelHelpers.hpp:114-130`).
   Each split view wraps messages in its own `MessageLayout` (`ChannelView.cpp:1163-1237`).
2. **Layout cache per message.** `MessageLayout::layout` re-runs only when the width, scale, image
   scale, element flags, a global "generation" counter or an explicit request changed; otherwise it
   returns immediately (`src/messages/layouts/MessageLayout.cpp:75-129`). Global setting changes
   bump the generation instead of relaying out everything at once (`WindowManager.cpp:272-276`).
3. **Lay out only what is visible.** Each pass lays out messages from the scroll position until the
   viewport is full, plus a bottom-up pass that stops once the viewport height is covered, to size
   the scrollbar (`ChannelView.cpp:699-800`). Off-screen messages keep their old layout until seen.
4. **One pixmap per visible message.** Background, text and static images are painted once into a
   DPR-aware `QPixmap` (`MessageLayout.cpp:342-479`). A repaint blits these buffers; a theme change
   only invalidates them (repaint into the same pixmap); a width or height change deletes them.
5. **Free what scrolls away.** After each paint, buffers of messages no longer on screen are deleted;
   hiding the view deletes all (`ChannelView.cpp:1721-1751,2997-3005`).
6. **Overlays are cheap fills.** Disabled, history, selection, separators, redemption bar and the
   scroll-to flash are drawn per paint on top of the cached pixmap (`MessageLayout.cpp:242-335`).
7. **Animated emotes skip the cache.** Static images are drawn into the buffer; animated ones are
   drawn on top every paint (`MessageLayoutElement.cpp:157-191`). One global 20 ms timer advances
   every animated image's frame by elapsed time (frame durations at least 20 ms; 10 ms or less
   become 100 ms) and asks views to repaint (`src/singletons/helper/GifTimer.cpp:15-43`,
   `GifTimer.hpp:12`, `src/messages/Image.cpp:125-151,211-221`).
8. **Repaint only the animated area.** Each view records the union rect of visible messages with
   animated elements and repaints just that rect on a GIF tick; full repaints refresh the rect
   (`ChannelView.cpp:427-433,1630-1705`). `animationsWhenFocused` stops ticks while no Chatterino
   window is active (`GifTimer.cpp:31-37`).
9. **Bounded memory.** Message buffers are ring queues of 1000 (`Settings.hpp:718-721`); images not
   painted for 10 minutes are unloaded (checked every minute) and reloaded on demand
   (`Image.cpp:31-33`); images load asynchronously and fall back to an already loaded resolution
   (`ImageSet.cpp:96-126`).
10. **Paused views freeze their snapshot**, so bursts of messages cost nothing until unpause
    (`ChannelView.cpp:903-912`).

Do not copy: 2.5.5 runs a 20 ms effect timer in **every** `Button` even when idle
(`src/widgets/buttons/Button.cpp:24-25`); master fixed it (commit `a7660b4e`, "only run button
effect timers while an effect is animating").

---

## 7. Mapping to our contracts

For `ts/src/chat-list-types.ts` and `examples/chatterino/src/data/api.ts`:

| Our field | Chatterino equivalent (Dark) |
| --- | --- |
| `ChatListProps.fontFamily` / `fontSize` | chat font; convert points: px = pt x 96 / 72 on Linux and Windows (11 pt = 14.67 px) |
| `textColor` / `mutedColor` / `linkColor` | `#ffffff` / `#8c7f7f` / `#4286f4`, after `normalizeColor` (3.10) |
| `selectionColor` | `rgba(255,255,255,0.25)` (`#40ffffff`) |
| `separatorColor` / `alternateBackground` | `#3c3c3c` / `#222222`, both off by default |
| `scrollbarColor` | thumb `#575757`, 4 px wide |
| `disabledOpacity`, `historicalOpacity` | 0.4 each, multiplied when both apply (they are overlays of the background at 60 %) |
| `showTimestamps` / `emoteScale` / `animateEmotes` | true / 1 / true |
| `maxMessages` | 1000 |
| `pauseOnHover` | false |
| `ChatListMessage.background` | opaque blended color from 3.9 |
| `ChatListMessage.marker` | highlight color with alpha 255 (3.13) |
| `ChatListUserElement.text` | display text including the trailing `:` |
| `ChatListBadgeElement` width/height | 18 x 18 |
| `ChatListEmoteElement` width/height | 1x natural size (Twitch 28, 7TV 32, emoji 22.4) x `emoteScale` |
| `ChatListMessage.reply` | the 0.8x reply line of 3.12 |
| `Settings.historyLimit` / `messageLimit` | 800 / 1000 |
| `ChannelModes` | header text rules of 2.3 |

---

## 8. 2.5.5 vs master

| Area | 2.5.5 (installed) | master |
| --- | --- | --- |
| Subs, announcements, watch streaks | two messages (user line, then system line) | one combined message (`c8a27e9f`, `05d6b2af`, `adc22cef`) |
| Highlight backgrounds | priority chain of flags (3.9) | everything goes through `Highlighted` + color; redemption 4 px bar removed (`9b2c6b39`) |
| Message separator width | message width + 64 | canvas width (`c9b7205d`) |
| Tab layout | tabs keep their natural width | horizontal tabs fill remaining space (`44062986`) |
| Theme keys | as in 3.8 | adds `splits.input.searchHighlightBackground`, `searchFailText` |
| History URL | env var only | also a setting (`d7a8f674`) |
| Message length | counted in UTF-16 units | counted in code points (`1af212c9`) |
| Fonts | font used as requested | substituted font resolved up front (`Fonts.cpp`) |
| Button effect timer | always running | only while animating (`a7660b4e`) |
| window-layout.json | as in 1.13 | same keys, serialization moved into `WindowDescriptors.cpp` |

---

## Appendix: verification on this machine

Chatterino 2.5.5 (Flathub) ran on a private Xvfb display with `docs/compare/` files (anonymous,
Dark, Arimo 11 pt, 1280 x 800). Measured on the capture:

| Item | Measured |
| --- | --- |
| Tab row | 28 px of `#111111`; divider y = 28-29 `#555555`; selected tab 2 px `#00aeef` line, background `#555555`; unselected tab with new messages 1 px `#888888` line from y = 1, background `#252525` |
| Tabs | start at x = 58; "Main" 57 px, gap 1 px, "More" 59 px |
| Split header | y = 31-58 (28 px), border `#383838`, fill `#2e2e2e`, 1 px split margin above |
| Split border | 1 px `#555555` between splits |
| Message pitch | 24 px text-only, 32 px with 28 px emotes; text ink starts 1 px right of x + 8 |
| History fade | white text `#757575`, timestamps `#474242` (formula in 3.11 exact) |
| Input | 37 px: 1 px `#333333` border, 35 px `#242424` |
| Scrollbar | 4 px `#575757` thumb at the view's right edge |
| Order | history, `connected`, `joined channel`, `Failed to load channel badges - OAuth token is missing`, live messages |

Not verified live (needs input injection or a login): drag and drop, Ctrl/Ctrl+Alt overlays, hover
pause, completion popups, user card and emote popup, live indicators, sub badges, sending.
