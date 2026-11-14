# shellcheck shell=bash
# persona-lab config for KeepTaste. Sourced by the persona-lab engine with
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
# one by one, then every cookbook from the home screen with the recipes in it,
# then the shopping lists. Recipes sort by last change, so what the persona
# saved or edited comes first. Nothing here taps a control that changes data:
# only recipe cards, cookbook tiles, list rows and Back.
#
# The cookbooks are there because "all recipes" does not say which cookbook a
# recipe is in: without them a need like "keep it with the holiday cakes" can
# never come out as met (iteration 11 reported a cookbook that was on the
# screen as missing).
#
# Both reads are the same on purpose. The engine takes the lines that are in
# the second and not in the first as "what this persona did", so a recipe that
# was already there must come out identically both times — hence no numbering
# in the headings. One read takes about two minutes with the four cookbooks of
# the demo library: every look at the screen is a UI dump of 3–4 seconds.
CAPTURE_RECIPES=3
# How many recipe titles are read from the top of a list ("all recipes", and
# each cookbook).
CAPTURE_TITLES=12
# How many screens of the home grid are read (two rows of tiles fit on one).
CAPTURE_COOKBOOK_SCREENS=4
# The "new cookbook" tile has the shape of a cookbook, so only its label tells
# it apart: `home.newCookbook` in i18n/dictionary.ts, both languages. If the
# wording changes and it gets tapped, a name prompt opens and Back closes it.
CAPTURE_SKIP_TILES="New cookbook|Nowa książka"

# card_titles [max-titles] [first-screen-nodes] — the titles of the recipe cards
# on a scrolling list, top to bottom, each once, at most max-titles of them.
# It reads the cards' labels and nothing else, because the other texts on a
# card repeat ("40 min", "4 servings") and a screen-by-screen read keeps or
# drops such a line depending on where the scroll happened to stop: two reads
# of the same list then differ, and the difference looks like something the
# persona did. The limit is on titles, not on scrolls, for the same reason: a
# list cut after so many scrolls ends one card earlier or later each time.
# Lists sort by last change, so what the persona touched is at the top.
# A card is tappable, nearly as wide as the screen and tall; one cut off by the
# bottom edge still has its title and means there is more below. Two recipes
# with the same title come out as one.
card_titles() {
  local want="${1:-$CAPTURE_TITLES}" nodes="${2:-}" tab seen="" page cut title more fresh n=0 stuck=0
  tab="$(printf '\t')"
  while :; do
    [ -n "$nodes" ] || nodes="$(ui_nodes)"
    page="$(printf '%s\n' "$nodes" | awk -F'\t' -v w="$((DEV_W * 80 / 100))" -v h="$((DEV_W / 4))" -v edge="$((DEV_H * 90 / 100))" \
      '$1 == 1 && $7 != "" && ($4 - $2) >= w && (($5 - $3) >= h || $5 >= edge) { print ($5 >= edge ? 1 : 0) "\t" $7 }')"
    nodes=""
    more=0
    fresh=0
    while IFS="$tab" read -r cut title; do
      [ -n "${title:-}" ] || continue
      [ "$cut" = 1 ] && more=1
      case "$seen" in *"$tab$title$tab"*) continue ;; esac
      if [ "$n" -ge "$want" ]; then more=2; break; fi
      seen="$seen$tab$title$tab"
      fresh=1
      n=$((n + 1))
      printf '%s\n' "$title"
    done <<EOF
$page
EOF
    if [ "$more" = 2 ]; then printf '(dalsze pominięte)\n'; break; fi
    # Nothing reaches the bottom edge: the list ends on this screen. Nothing
    # new although a card does reach it: either that card is the last one, or
    # the swipe was dropped, which happens, so it gets one more try.
    [ "$more" = 1 ] || break
    if [ "$fresh" = 1 ]; then stuck=0; else stuck=$((stuck + 1)); fi
    [ "$stuck" -le 1 ] || break
    # About half a screen: a card is 600 px of 2400, so none is jumped over.
    keyboard_hide
    adbs shell input swipe "$((DEV_W / 2))" "$((DEV_H * 75 / 100))" "$((DEV_W / 2))" "$((DEV_H * 22 / 100))" 700 </dev/null
    sleep 1.2
  done
}

# capture_cookbooks — cold start to the home screen, then each cookbook tile is
# opened once and the titles of its recipes read. The "new cookbook" tile is
# the last one in the grid (cookbooks sort by creation), so the grid is
# scrolled only until that tile is on the screen.
capture_cookbooks() {
  local tab nodes tiles fresh last seen="" x1 y1 x2 y2 label titles
  tab="$(printf '\t')"
  app_stop
  app_start
  app_wait_ready 60 || return 1
  sleep 2
  printf '\n# Książki kucharskie na ekranie głównym i przepisy w każdej\n'
  for _ in $(seq 1 "$CAPTURE_COOKBOOK_SCREENS"); do
    nodes="$(ui_nodes)"
    # A tile is a tappable square about half the screen wide. One cut off by
    # the edge of the grid is not square yet; it is after the next scroll.
    tiles="$(printf '%s\n' "$nodes" | awk -F'\t' -v lo="$((DEV_W * 35 / 100))" -v hi="$((DEV_W * 60 / 100))" -v skip="^($CAPTURE_SKIP_TILES)\$" \
      '$1 == 1 && $7 != "" && $7 !~ skip && ($4 - $2) >= lo && ($4 - $2) <= hi && ($5 - $3) >= ($4 - $2) * 0.9 { print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $7 }')"
    last="$(printf '%s\n' "$nodes" | awk -F'\t' -v skip="^($CAPTURE_SKIP_TILES)\$" '$1 == 1 && $7 ~ skip { found = 1 } END { print found + 0 }')"
    fresh=0
    while IFS="$tab" read -r x1 y1 x2 y2 label; do
      [ -n "${x1:-}" ] || continue
      case "$seen" in *"$tab$label$tab"*) continue ;; esac
      seen="$seen$tab$label$tab"
      fresh=1
      tap_dev "$(((x1 + x2) / 2))" "$(((y1 + y2) / 2))"
      sleep 1.5
      printf '\n## Książka: %s\n\n' "$label"
      nodes="$(ui_nodes)"
      # The tile is still where it was: the tap did not open the cookbook.
      # Back from the home screen would leave the app, and the taps after it
      # would land on the launcher.
      if printf '%s\n' "$nodes" | awk -F'\t' -v l="$label" -v x="$x1" -v y="$y1" '$1 == 1 && $7 == l && $2 == x && $3 == y { found = 1 } END { exit !found }'; then
        printf '    (nie udało się otworzyć)\n'
        continue
      fi
      titles="$(card_titles "$CAPTURE_TITLES" "$nodes")"
      if [ -n "$titles" ]; then printf '%s\n' "$titles" | sed 's/^/    /'; else printf '    (brak przepisów)\n'; fi
      adbs shell input keyevent KEYCODE_BACK </dev/null
      sleep 1.5
    done <<EOF
$tiles
EOF
    [ "$last" = 0 ] && [ "$fresh" = 1 ] || break
    adbs shell input swipe "$((DEV_W / 2))" "$((DEV_H * 70 / 100))" "$((DEV_W / 2))" "$((DEV_H * 30 / 100))" 500 </dev/null
    sleep 1.2
  done
  [ -n "$seen" ] || printf '\n(brak książek)\n'
}

capture_state() {
  local rows i=0 x1 y1 x2 y2 label tab
  tab="$(printf '\t')"
  app_stop
  adbs shell am start -W -a android.intent.action.VIEW -d "keeptaste://cookbook/all" "$APP_ID" >/dev/null 2>&1 </dev/null
  app_wait_ready 60 || return 1
  sleep 2
  # The search field of this screen takes focus by itself and the keyboard
  # comes up over the lower cards. It does so again after every return from a
  # recipe, so it is closed before each tap and each scroll here.
  keyboard_hide
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
    keyboard_hide
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
  card_titles | sed 's/^/    /'

  capture_cookbooks || return 1

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
    keyboard_hide
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
