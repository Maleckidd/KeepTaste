#!/bin/bash
# Resets an emulator to the curated demo library, ready for a screenshot or
# promo-video session: clears app data, restores the demo .zip through the app's
# own Restore flow, and puts the status bar into demo mode (9:30, full battery,
# no notification icons).
#
#   bash scripts/reset-demo-library.sh en
#   bash scripts/reset-demo-library.sh pl emulator-5556
#
# Build the archives first (scripts/build-demo-backup.ts). The restore has to go
# through the UI — the app is not debuggable, so there is no way to push a
# database in over adb.
#
# The system file picker opens wherever it was last used, in the view it was last
# left in, so the archive is found by name and through Downloads when needed.
#
# adb plumbing is in lib/adb.sh; every coordinate is in lib/screen.sh.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/adb.sh
source "$DIR/lib/adb.sh"
# shellcheck source=lib/screen.sh
source "$DIR/lib/screen.sh"

LANG_CODE="${1:-en}"
adb_target "$LANG_CODE" "${2:-}"

case "$LANG_CODE" in
  en) ZIP=keeptaste-demo.zip ;;
  pl) ZIP=keeptaste-demo-pl.zip ;;
esac

[ -f "assets/store/$ZIP" ] || {
  echo "missing assets/store/$ZIP — run: npx --yes tsx scripts/build-demo-backup.ts $LANG_CODE" >&2
  exit 1
}

echo "Resetting $ANDROID_SERIAL to the $LANG_CODE demo library"

app_clear
# Leaving both language archives on the device makes the picker row we want
# depend on which was pushed last, which is exactly the kind of blind tap that
# silently restores the wrong library (or nothing) and is only visible once you
# watch the recording.
adb shell rm -f "/sdcard/Download/keeptaste-demo*.zip"
adb push "assets/store/$ZIP" /sdcard/Download/ >/dev/null

demo_status_bar

app_start
echo "  waiting for the app to start…"
wait_for_pixel "$TAB_RECIPES_PIXEL" "$COLOR_PRIMARY" 2 "the app never reached the home screen"

tap "$SETTINGS_BUTTON"
sleep 2
drag 540 1900 540 900 700 # down to the backup section
sleep 2
tap "$SETTINGS_RESTORE"
sleep 6 # the system file picker needs ~3.5 s to appear; tapping early lands on
        # the Settings screen still underneath it
tap_ui "$ZIP" || {
  tap_ui "Show roots"
  sleep 1.5
  tap_ui "Downloads"
  sleep 2
  tap_ui "$ZIP"
} || {
  echo "the file picker has no $ZIP" >&2
  exit 1
}
echo "  restoring (this takes ~15 s)…"
sleep 20
tap "$DIALOG_OK"
sleep 1.5

# Land on the home screen by restarting rather than by pressing Back. Where Back
# goes depends on whether the restore flow already popped Settings, and getting
# that wrong drops us on the launcher — whose dark wallpaper then sails through
# the grid check below. It also puts the language step below on a known screen.
app_restart
wait_for_pixel "$TAB_RECIPES_PIXEL" "$COLOR_PRIMARY" 2 "the app never reached the home screen"

if [ "$LANG_CODE" = pl ]; then
  # A backup carries recipes, not preferences, so the UI language still follows
  # the device locale after a restore. Settings → Language → Polski.
  tap "$SETTINGS_BUTTON"
  sleep 2.5
  tap "$SETTINGS_LANGUAGE"
  sleep 2
  tap "$LANGUAGE_PL"
  sleep 2.5
  back # Settings → home
  sleep 2.5
fi

# Prove the restore landed. The demo library fills a 2x2 cookbook grid, so the
# bottom-right tile is covered by a photo; the first-launch seed has a single
# cookbook and leaves that spot on the app background. Without this check a
# failed restore is invisible until the recording is already shot against seed
# content that looks almost, but not at all, like the demo library.
GRID_BR=$(pixel "$GRID_BOTTOM_RIGHT")
screenshot "/tmp/keeptaste-reset-$LANG_CODE.png"
if [ "$GRID_BR" = "$COLOR_SURFACE" ] || [ -z "$GRID_BR" ]; then
  echo "restore did not take — the cookbook grid is not full (pixel=$GRID_BR)" >&2
  echo "see /tmp/keeptaste-reset-$LANG_CODE.png" >&2
  exit 1
fi
echo "Done — check /tmp/keeptaste-reset-$LANG_CODE.png before recording"
echo "(The status bar keeps a VPN shield and a wifi warning that demo mode will"
echo " not hide. It does not matter: the video crops the status bar off.)"
