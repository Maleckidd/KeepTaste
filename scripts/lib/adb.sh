# shellcheck shell=bash
#
# Shared adb plumbing for the scripts that drive a real build on an emulator
# (reset-demo-library.sh, record-promo-clips.sh).
#
# Source it, do not run it:
#
#   source "$(dirname "$0")/lib/adb.sh"
#   adb_target "$LANG_CODE" "${2:-}"
#
# The app is a release build and therefore not debuggable — no `run-as`, no
# `adb root`, no pushing a database in. Everything here works the way a person
# would: taps at coordinates, and reading pixels back off the screen to find out
# what happened. Screen landmarks live in lib/screen.sh.

# The Android application id. The single place it is written down; no
# TypeScript script needs it.
PKG=com.damianmalecki.keeptaste

# --- target ------------------------------------------------------------------

# adb_target <lang> [serial] — validates the language, selects the device and
# exports ANDROID_SERIAL so every later adb call goes to the same one. With two
# emulators up, letting adb pick "the only device" is how a take gets recorded
# on the one that was never reset.
adb_target() {
  local lang="$1" serial="${2:-}"
  case "$lang" in
    en | pl) ;;
    *)
      echo "usage: $0 [en|pl] [serial]" >&2
      exit 1
      ;;
  esac
  export ANDROID_SERIAL="${serial:-emulator-5556}"
  adb devices | grep -q "^$ANDROID_SERIAL[[:space:]]" || {
    echo "no such device: $ANDROID_SERIAL — running: $(adb devices | sed -n '2,$p' | awk '{print $1}' | tr '\n' ' ')" >&2
    exit 1
  }
}

# --- input -------------------------------------------------------------------
#
# Landmarks are passed as one "x y" string — the form they are written in in
# lib/screen.sh — so call sites stay quoted and the word splitting happens here,
# once, on purpose.

# tap <landmark> — e.g. tap "$SETTINGS_BUTTON"
tap() {
  # shellcheck disable=SC2206
  local -a p=($1)
  adb shell input tap "${p[0]}" "${p[1]}"
}

# drag <x1> <y1> <x2> <y2> [ms] — a gesture rather than a landmark, so this one
# takes plain numbers. Long durations keep a list from flinging past the frame
# we want to land on, which is what makes a take reproducible.
drag() { adb shell input swipe "$1" "$2" "$3" "$4" "${5:-900}"; }

# back — the system back gesture.
back() { adb shell input keyevent KEYCODE_BACK; }

# --- reading the screen ------------------------------------------------------

# pixel <landmark> — that screen pixel as "rrggbb". Roughly 1 s per call.
pixel() {
  # shellcheck disable=SC2206
  local -a p=($1)
  adb exec-out screencap -p |
    ffmpeg -v error -i - -vf "crop=w=1:h=1:x=${p[0]}:y=${p[1]}" -f rawvideo -pix_fmt rgb24 - |
    xxd -p
}

# screenshot <file> — the whole screen, for eyeballing what a script saw.
screenshot() { adb exec-out screencap -p >"$1"; }

# wait_for_pixel <landmark> <rrggbb> <settle-seconds> <failure message>
#
# Polls until that pixel is that colour, then waits `settle` seconds more for
# whatever is still decoding (cookbook photos, mostly).
#
# Every fixed `sleep` that was supposed to cover a cold start turned into a
# mis-timed run at some point: a cold start on a loaded host can take 20 s, and
# taps sent into the launch splash land on whatever appears next — which
# produces a session that looks plausible until you watch it.
wait_for_pixel() {
  local landmark="$1" want="$2" settle="$3" msg="$4" i
  for i in $(seq 1 40); do
    if [ "$(pixel "$landmark")" = "$want" ]; then
      sleep "$settle"
      return 0
    fi
    sleep 1
  done
  echo "$msg" >&2
  exit 1
}

# --- app lifecycle -----------------------------------------------------------

app_stop() { adb shell am force-stop "$PKG"; }
app_start() { adb shell am start -n "$PKG/.MainActivity" >/dev/null; }
app_clear() { adb shell pm clear "$PKG" >/dev/null; }

# app_restart — a cold start. Used to land on the home screen from a known
# state, which is more reliable than pressing Back an assumed number of times.
app_restart() {
  app_stop
  sleep 1
  app_start
}

# --- presentation ------------------------------------------------------------

# demo_status_bar — light theme, and a status bar fit for a recording: 9:30,
# full battery, full wifi, no notification icons.
#
# A VPN shield and a wifi warning survive this; demo mode will not hide them.
# It does not matter — every renderer crops the status bar off.
demo_status_bar() {
  adb shell cmd uimode night no >/dev/null
  adb shell settings put global sysui_demo_allowed 1
  local cmd
  for cmd in \
    "command enter" \
    "command clock -e hhmm 0930" \
    "command battery -e level 100 -e plugged false" \
    "command network -e wifi show -e level 4 -e mobile hide" \
    "command notifications -e visible false"; do
    # shellcheck disable=SC2086
    adb shell am broadcast -a com.android.systemui.demo -e $cmd >/dev/null
  done
}
