#!/usr/bin/env bash
# Launches the installed Flathub Chatterino with the comparison layout, logged out, using a
# throwaway profile. Your real config in ~/.var/app/com.chatterino.chatterino is never read or
# written: the XDG_* variables are set inside the sandbox, because `flatpak run --env=XDG_...`
# is overridden by Flatpak.
#
#   DISPLAY=:99 ./run-chatterino.sh        # private Xvfb display (see compare-setup.md)
#   ./run-chatterino.sh                    # current desktop session (through X11/XWayland)
#
# CHATTERINO_COMPARE_DIR overrides the profile directory. Each run copies window-layout.json and
# settings.json over the profile's copies, so the layout resets every launch.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
profile="${CHATTERINO_COMPARE_DIR:-${TMPDIR:-/tmp}/chatterino-compare-$(id -u)}"

mkdir -p "$profile/data/chatterino/Settings" "$profile/cache" "$profile/config" "$profile/state"
cp "$here/window-layout.json" "$here/settings.json" "$profile/data/chatterino/Settings/"

exec flatpak run --user --nosocket=wayland --socket=x11 --filesystem="$profile" \
    --command=sh com.chatterino.chatterino -c \
    'export XDG_DATA_HOME="$1/data" XDG_CACHE_HOME="$1/cache" XDG_CONFIG_HOME="$1/config" XDG_STATE_HOME="$1/state"; exec chatterino' \
    sh "$profile"
