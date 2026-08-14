#!/bin/bash
# Records the raw screen takes for the Play Store promo video.
#
# Drives the app on an Android emulator with `adb shell input` while the
# emulator records its own display, and leaves the takes in
# assets/store/promo/raw/<lang>/. scripts/build-promo-video.ts turns those into
# the finished 16:9 video.
#
# The library must already be the curated demo content and the UI language must
# match $LANG_CODE — run scripts/reset-demo-library.sh first.
#
#   bash scripts/record-promo-clips.sh en
#   bash scripts/record-promo-clips.sh pl emulator-5556
#
# adb plumbing is in lib/adb.sh; every coordinate is in lib/screen.sh, measured
# for a 1080x2400 phone. They are layout positions rather than text positions,
# so they survive the language switch — but any UI change moves them, and a
# missed tap only shows up in the recording. Watch the takes.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/adb.sh
source "$DIR/lib/adb.sh"
# shellcheck source=lib/screen.sh
source "$DIR/lib/screen.sh"

LANG_CODE="${1:-en}"
adb_target "$LANG_CODE" "${2:-}"

OUT="assets/store/promo/raw/$LANG_CODE"
mkdir -p "$OUT"
rm -f "$OUT"/*.webm

# --- recording ---------------------------------------------------------------

# record <name> <function> — the emulator records while the function drives it.
#
# This uses the *emulator console* recorder (`adb emu screenrecord`), not
# `adb shell screenrecord`. The on-device one captures a single frame on this
# emulator and writes an mp4 with no timing at all; the console recorder writes
# a proper VP9 .webm on the host. Frame rate still depends on how fast the
# emulator renders — around 20 fps with `-gpu host`, and about 6 with the
# default `auto`, which is why docs/store-promo-video.md insists on the flag.
# build-promo-video.ts interpolates the result up to 30.
record() {
  local name="$1" scene="$2"
  echo "  recording $name…"
  adb emu screenrecord start "$PWD/$OUT/$name.webm" >/dev/null
  sleep 0.8
  "$scene"
  sleep 0.6
  adb emu screenrecord stop >/dev/null
  sleep 2 # the muxer keeps writing after the console call returns
}

# --- takes -------------------------------------------------------------------

# A: the library. Home grid, then into a cookbook.
#
# No scrolling here on purpose: Breakfasts holds three recipes and they all fit
# on screen, so a vertical drag has no list to move and the gesture falls
# through to SwipeableRow — the take ends up flashing the red Delete/Edit
# actions, which is not what the promo is selling.
take_library() {
  sleep 1.6
  tap "$CB_FIRST"
  sleep 3.0
}

# B: getting a recipe *in*. New recipe form → the import sheet → switching mode
# from "From link" to "Paste text".
#
# Nothing is actually imported: a link import fetches over the network, and the
# emulator's connection is not something a take should depend on. Switching mode
# is enough — it names all four ways in, and the sheet grows into the pasted-text
# field, so the shot moves.
take_import() {
  sleep 1.2
  tap "$FAB_RECIPE"
  sleep 2.4
  tap "$IMPORT_BUTTON"
  sleep 2.6
  tap "$MODE_PASTE_TEXT"
  sleep 2.2
}

# C: the recipe, and its ingredients going onto a shopping list. The two
# unchecked rows are the ingredient-group headers ("Batter:", "To serve:") —
# unchecking them shows the picker doing something and keeps non-products off
# the list.
take_recipe() {
  sleep 1.0
  tap "$RECIPE_THIRD"
  sleep 2.6
  drag 540 1800 540 700 900
  sleep 1.8
  tap "$ADD_TO_LIST"
  sleep 2.2
  tap "$SHEET_ITEM1"
  sleep 0.7
  tap "$SHEET_ITEM2"
  sleep 1.1
  drag 540 1900 540 1300 800
  sleep 1.2
  tap "$SHEET_CONFIRM"
  sleep 2.6
}

# D: shopping. Ticking a row moves it into the "In cart" section, so the same
# coordinate ticks off successive items and the list visibly shortens.
take_shopping() {
  sleep 1.4
  tap "$LIST_ROW1"
  sleep 1.1
  tap "$LIST_ROW1"
  sleep 1.1
  tap "$LIST_ROW1"
  sleep 1.8
}

# --- run ---------------------------------------------------------------------
#
# One cold start, then every take is reached by navigating inside the running
# app. Restarting between takes would mean waiting out the splash three times
# and betting each time that it finished.

echo "Recording promo takes ($LANG_CODE) on $ANDROID_SERIAL"

app_restart
echo "  waiting for the home screen…"
# The "+" button is the last thing painted once the launch splash hands over, so
# it is the signal that the app is actually ready.
wait_for_pixel "$FAB_HOME" "$COLOR_PRIMARY" 1.5 \
  "the app never reached the home screen — is the demo library restored?"

# Burn the one-time swipe hint before recording anything. The first time a
# cookbook is opened, the top recipe peeks its Delete/Edit actions to teach the
# gesture (app/cookbook/[id].tsx, the swipeHintSeen flag) — a fine thing in the
# app, and a red "Delete" flashing through the opening shot of the promo. The
# flag lives in app data, so reset-demo-library.sh clears it every time.
tap "$CB_FIRST"
sleep 4
back
sleep 2

record library take_library

# take A left us in the Breakfasts cookbook; take B starts there.
record import take_import

# Out of the import sheet and out of the form, back to the cookbook take C
# starts on. The form was never typed into, so closing it asks nothing.
back # sheet → form
sleep 1.5
back # form → cookbook
sleep 2

record recipe take_recipe

# Reach the list the recipe just filled. Not through the snackbar's "VIEW LIST"
# action: by the time the take has ended and the recorder has been stopped and
# flushed, the snackbar has timed out. And not straight to the tab bar either —
# the recipe view and the cookbook list are full-screen routes without one, so
# back out to the home screen first.
back # recipe → cookbook
sleep 1.5
back # cookbook → home
sleep 2
tap "$TAB_SHOPPING"
sleep 2.0
tap "$LIST_CARD"
sleep 2.5
record shopping take_shopping

echo "Wrote $(ls "$OUT"/*.webm | wc -l | tr -d ' ') takes to $OUT"
