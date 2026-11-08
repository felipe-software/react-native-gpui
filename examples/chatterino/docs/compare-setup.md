# Comparing with the real Chatterino

How to run the installed Chatterino 2.5.5 (Flathub, per-user) next to our app with the same
tabs, splits, size, theme and font, logged out, so screenshots line up for an apples-to-apples
comparison. Facts about Chatterino itself are in `chatterino-reference.md`.

## Files

| File | Purpose |
| --- | --- |
| `compare/window-layout.json` | One 1280 x 800 main window at (0, 0) with two tabs: **Main** = `xqc` on the left, `forsen` above `sodapoppin` on the right (equal halves); **More** = `lirik`, `kaicenat`, `hasanabi` side by side. "Main" is selected. |
| `compare/settings.json` | Anonymous (`accounts.current = ""`), Dark theme, chat font Arimo 11 pt, streamer mode off. Everything else stays at Chatterino's defaults. |
| `compare/run-chatterino.sh` | Starts the Flatpak with a throwaway profile that contains only these two files. |

Why these settings:

- **Arimo 11 pt**: Chatterino's Linux default is "Arial" 11 pt. Inside the Flatpak "Arial"
  resolves to Liberation Sans, on the host to Arimo (both Arial-metric clones). Naming Arimo, which
  the sandbox sees from the host fonts, makes both apps draw the same font file. Remove
  `currentFontFamily` and `currentFontSize` to see the stock default.
- **Streamer mode off**: the default (2, "detect streaming software") hides avatars, link
  thumbnails and moderation messages whenever OBS is running.
- **No `misc.currentVersion`**: an empty value skips the "Show changelog?" dialog on start.

Both files were verified on this machine: Chatterino 2.5.5 loaded the layout, rendered the tabs
and splits as described, and wrote the layout back with the same content on exit.

## Run Chatterino

### Isolated profile (recommended)

```sh
cd examples/chatterino/docs/compare
./run-chatterino.sh                      # on your desktop session (X11 or XWayland)
DISPLAY=:99 ./run-chatterino.sh          # on a private display, see below
```

The script copies the two JSON files into `${CHATTERINO_COMPARE_DIR:-/tmp/chatterino-compare-<uid>}`
and starts the Flatpak with `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME` and
`XDG_STATE_HOME` pointing there. Your real config under
`~/.var/app/com.chatterino.chatterino/data/chatterino` is never read or written.

Two details that matter if you write your own launcher:

- `flatpak run --env=XDG_DATA_HOME=...` does **not** work: Flatpak sets the XDG variables itself
  and wins. Set them in a shell inside the sandbox (`--command=sh -c 'export ...; exec chatterino'`).
- The profile directory must be exposed with `--filesystem=<dir>`. `/tmp/...` works.
- `--nosocket=wayland --socket=x11` forces X11 so `DISPLAY` decides where the window goes.

The layout resets on every launch because the script copies the files again. Stop Chatterino by
closing its window or with `kill -TERM <pid of the chatterino process>`; it saves on SIGTERM.
Flatpak may refresh its own loader cache in `~/.var/app/com.chatterino.chatterino/.ld.so` on the
first run; that is Flatpak housekeeping, not app data.

### Copying into the real config (only if you must)

```sh
cfg=~/.var/app/com.chatterino.chatterino/data/chatterino/Settings
backup=$(mktemp -d)
cp -a "$cfg/." "$backup/"                      # back up first
cp examples/chatterino/docs/compare/{window-layout,settings}.json "$cfg/"
flatpak run --user com.chatterino.chatterino   # close it when done
rm -f "$cfg"/*                                  # then restore exactly what was there
cp -a "$backup/." "$cfg/"
```

This replaces your accounts and settings while it runs, which is why the isolated profile is
preferred.

## Private display and capture

Never start Chatterino on the user's desktop for automated captures. Use a private X server:

```sh
~/.local/share/rngpui-linux-toolchain/root/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
XVFB_PID=$!
DISPLAY=:99 examples/chatterino/docs/compare/run-chatterino.sh &
# wait until the window exists, then give history and emotes ~15-20 s to load
until xwininfo -root -tree -display :99 | grep -q "Chatterino 2"; do sleep 0.5; done
sleep 20
xwd -root -display :99 -silent > /tmp/chatterino.xwd
~/.local/bin/ffmpeg -y -i /tmp/chatterino.xwd -vf "crop=1280:800:0:0" /tmp/chatterino.png
```

Xvfb has no window manager, so the window has no title bar and sits exactly at (0, 0); cropping
1280 x 800 from the top-left gives the client area. To capture the **More** tab, set
`"selected": true` on the second tab (and remove it from the first) in a copy of the layout, or
point `CHATTERINO_COMPARE_DIR` at a profile whose layout you edited.

Clean up only your own processes: `kill -TERM <chatterino pid>` (the `chatterino` child of the
`bwrap` processes) and `kill $XVFB_PID`.

## Run our app the same way

Give our app the same state through `examples/chatterino/src/data/api.ts`:

```ts
const compareLayout: WindowLayout = {
    selectedTabId: "main",
    tabs: [
        {
            id: "main",
            title: "Main",
            root: {
                type: "container", id: "main-root", direction: "horizontal", sizes: [1, 1],
                children: [
                    { type: "split", id: "xqc", channel: "xqc" },
                    {
                        type: "container", id: "main-right", direction: "vertical", sizes: [1, 1],
                        children: [
                            { type: "split", id: "forsen", channel: "forsen" },
                            { type: "split", id: "sodapoppin", channel: "sodapoppin" },
                        ],
                    },
                ],
            },
        },
        {
            id: "more",
            title: "More",
            root: {
                type: "container", id: "more-root", direction: "horizontal", sizes: [1, 1, 1],
                children: [
                    { type: "split", id: "lirik", channel: "lirik" },
                    { type: "split", id: "kaicenat", channel: "kaicenat" },
                    { type: "split", id: "hasanabi", channel: "hasanabi" },
                ],
            },
        },
    ],
};
```

Match the settings: theme `dark`, font family `Arimo` at 11 pt (14.67 px at 96 dpi), timestamps
on with `h:mm` (24-hour), history on with 800 messages, 1000 messages per split, no account, and a
1280 x 800 window.

Capture ours offscreen with the repo CLI (from `ts/`, after `npm run bundle` in
`examples/chatterino`):

```sh
bun run cli/bin.ts shot --bundle ../examples/chatterino/.build/chatterino.js \
    --size 1280x800 --appearance dark --out /tmp/ours.png
bun run cli/bin.ts diff /tmp/chatterino.png /tmp/ours.png --out /tmp/diff.png
```

Our Linux window draws its own frame on GNOME but keeps the requested content size, so both
captures are 1280 x 800 of content at scale 1.

## What will differ no matter what

- **Chat content.** Both apps connect to live chat, so messages, emotes and history differ between
  any two captures. Compare chrome and geometry (tab row, headers, borders, input, message pitch,
  margins, colors, fades), not the text.
- **Anonymous limitations in Chatterino.** Without a login every Twitch channel shows
  `Failed to load channel badges - OAuth token is missing` after `joined channel`, there are no
  subscriber badges, no live dots, no ` (live)` in headers and no live/offline messages, because
  Helix calls fail. Our app should either reproduce these or the comparison should ignore them.
- **UI font.** Chatterino draws tabs and headers in "Arial" 9 pt, which the sandbox resolves to
  Liberation Sans; the chat font is pinned to Arimo by `settings.json`.
- **Animated emotes** are at a different frame in each capture.
- **Focus.** Under Xvfb no window is active, so no split header uses the focused colors.

## Reference values measured on the 2.5.5 capture

| Item | Value |
| --- | --- |
| Tab row | 28 px `#111111`, 2 px `#555555` divider below; tabs start at x = 58 after the gear and account buttons |
| Selected tab "Main" | 57 px wide, 2 px `#00aeef` top line, `#555555` background |
| Unselected tab with new messages | 59 px wide ("More"), 1 px `#888888` line, `#252525` background, 1 px gap between tabs |
| Split header | 28 px tall from y = 31, `#2e2e2e` fill, `#383838` border on top, left and right |
| Split separator | 1 px `#555555` |
| Messages | 24 px per one-line text message, 32 px when the line has a 28 px emote; text starts 8 px into the view |
| History fade | white text `#757575`, timestamps `#474242` (live: `#ffffff`, `#8c7f7f`) |
| Input | 37 px tall, 1 px `#333333` border, `#242424` fill, placeholder `Log in to send messages...` |
| Scrollbar | 4 px `#575757` thumb flush with the view's right edge |
| Start of each split | faded history, then `connected`, `joined channel`, the badge error, then live chat |
