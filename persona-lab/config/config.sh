# shellcheck shell=bash
# persona-lab config for KeepTaste. Sourced by persona-lab/engine/*.sh with
# CONFIG_DIR set to this directory. Everything app-specific lives here; the
# engine stays generic.

APP_NAME="KeepTaste"
APP_ID=com.damianmalecki.keeptaste
APP_REPO="$(cd "$CONFIG_DIR/../.." && pwd)"

# The phone emulator (Medium_Phone AVD, 1080x2400). Start it with `-gpu host`
# or the video drops to a few fps — see docs/store-promo-video.md.
ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5556}"

# Optional: build and/or install before the session. The release APK is not
# debuggable, which is fine — nothing here needs run-as.
#   BUILD_CMD='CI=1 npx expo prebuild -p android --no-install && (cd android && ./gradlew assembleRelease -q)'
#   APK="$APP_REPO/android/app/build/outputs/apk/release/app-release.apk"
BUILD_CMD="${BUILD_CMD:-}"
APK="${APK:-}"

# Personas think, write and see the UI in one of these (per-app locale).
APP_LANGUAGES="pl en"

# Start states. The generator picks one per persona from STATE_DESC_*; the
# persona is told STATE_PERSONA_* — its situation in user terms, nothing about
# what is on the screens.
STATES="fresh demo"
STATE_DESC_fresh="first launch right after installing from the store; the person has none of their own recipes in it yet"
STATE_PERSONA_fresh="You have just installed the app from the store and are opening it for the first time. None of your own recipes are in it yet."
STATE_DESC_demo="the person has been using the app for a few weeks: several cookbooks with a dozen or so recipes with photos, and a shopping list"
STATE_PERSONA_demo="You have been using this app for a few weeks. Your cookbooks and recipes are already in it, and you have a shopping list going."

# reset_app <state> <lang> — puts the app into a known state and leaves it
# launched. Called before every run.
reset_app() {
  local state="$1" lang="$2" locale
  case "$lang" in pl) locale=pl-PL ;; *) locale=en-US ;; esac
  case "$state" in
    fresh)
      app_stop
      app_clear
      app_set_locale "$locale"
      app_start
      ;;
    demo)
      # Clears data and restores the curated demo .zip through the app's own
      # Restore flow (and switches the in-app language for pl). Needs
      # assets/store/keeptaste-demo*.zip — npx tsx scripts/build-demo-backup.ts.
      app_set_locale "$locale"
      (cd "$APP_REPO" && bash scripts/reset-demo-library.sh "$lang" "$ANDROID_SERIAL") >&2
      ;;
    *) return 1 ;;
  esac
}

PERSONA_COUNT=5
RUNS_PER_PERSONA=2
MAX_STEPS=40              # hard cap per run (cost); persona patience is lower
MODEL_PERSONA=sonnet
MODEL_GENERATOR=opus
MODEL_SYNTHESIS=opus
MAX_BUDGET_PER_CALL=1.00  # USD, per single model call
MAX_BUDGET_SYNTHESIS=5.00
UI_HINTS=text             # none | text | full (full adds accessibility labels)
SYNTHESIS_LANG=pl

# Phrases that exist only in this repo's code/docs. If one shows up in a
# persona transcript, the isolation check fails.
ISOLATION_SENTINELS="Drizzle useFocusEffect pendingDelete SwipeableRow runMigrations"
