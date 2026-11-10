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
      # The restore is driven by blind taps through Settings and the system
      # picker, and now and then one doesn't land; the script detects that, so
      # one retry turns a skipped run into a slower one.
      app_set_locale "$locale"
      (cd "$APP_REPO" && bash scripts/reset-demo-library.sh "$lang" "$ANDROID_SERIAL") >&2 ||
        (cd "$APP_REPO" && bash scripts/reset-demo-library.sh "$lang" "$ANDROID_SERIAL") >&2
      ;;
    *) return 1 ;;
  esac
}

# capture_state <before|after> <state> <lang> — prints what is stored in the
# app right now, as Markdown. The engine calls it after the reset and again
# after the run; the outcome check compares the two with the persona's needs.
#
# The app is not debuggable, so the database cannot be pulled over adb. The
# state is read the way a user would see it: a cold start (anything the
# persona left unsaved in an open form is gone, which is the point) straight
# into the "all recipes" screen by deep link, then the newest recipes opened
# one by one, then the shopping lists. Recipes sort by last change, so what the
# persona saved or edited comes first. Nothing here taps a control that changes
# data: only recipe cards, list rows and Back.
#
# Both reads are the same on purpose. The engine takes the lines that are in
# the second and not in the first as "what this persona did", so a recipe that
# was already there must come out identically both times — hence no numbering
# in the headings. One read takes about a minute.
CAPTURE_RECIPES=3
capture_state() {
  local rows i=0 x1 y1 x2 y2 label tab
  tab="$(printf '\t')"
  app_stop
  adbs shell am start -W -a android.intent.action.VIEW -d "keeptaste://cookbook/all" "$APP_ID" >/dev/null 2>&1 </dev/null
  app_wait_ready 60 || return 1
  sleep 2
  # A recipe card is the only tall tappable thing on this screen.
  # (No empty column may reach `read`: a tab is whitespace to it, so two in a
  # row count as one and every later field would shift.)
  rows="$(ui_nodes | awk -F'\t' -v min="$((DEV_W / 4))" \
    '$1 == 1 && $7 != "" && ($5 - $3) >= min { print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $7 }')"
  printf '# Przepisy w aplikacji (od ostatnio zmienionych), pierwszy ekran listy\n\n'
  if [ -n "$rows" ]; then printf '%s\n' "$rows" | awk -F'\t' '{ print "- " $5 }'; else printf '(brak przepisów)\n'; fi
  while IFS="$tab" read -r x1 y1 x2 y2 label; do
    [ -n "${x1:-}" ] || continue
    i=$((i + 1))
    [ "$i" -le "$CAPTURE_RECIPES" ] || break
    tap_dev "$(((x1 + x2) / 2))" "$(((y1 + y2) / 2))"
    sleep 2.5
    printf '\n## Przepis: %s\n\nCała treść ekranu przepisu, od góry:\n\n' "$label"
    ui_collect 8 | sed 's/^/    /'
    adbs shell input keyevent KEYCODE_BACK </dev/null
    sleep 2
  done <<EOF
$rows
EOF
  printf '\n# Wszystkie tytuły na liście przepisów (po przewinięciu)\n\n'
  ui_collect 4 | sed 's/^/    /'

  adbs shell am start -W -a android.intent.action.VIEW -d "keeptaste://shopping" "$APP_ID" >/dev/null 2>&1 </dev/null
  sleep 3
  printf '\n# Listy zakupów\n\n'
  ui_collect 1 | sed 's/^/    /'
  # A list row is wide and short; the timer bar is narrower, the tabs are half-width.
  rows="$(ui_nodes | awk -F'\t' -v w="$((DEV_W * 88 / 100))" -v h="$((DEV_W / 4))" -v top="$((DEV_H / 10))" \
    '$1 == 1 && $7 != "" && ($4 - $2) >= w && ($5 - $3) < h && $3 > top { print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $7 }' | head -1)"
  if [ -n "$rows" ]; then
    IFS="$tab" read -r x1 y1 x2 y2 label <<EOF
$rows
EOF
    tap_dev "$(((x1 + x2) / 2))" "$(((y1 + y2) / 2))"
    sleep 2.5
    printf '\n## Lista zakupów: %s\n\n' "$label"
    ui_collect 6 | sed 's/^/    /'
    adbs shell input keyevent KEYCODE_BACK </dev/null
  fi
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
