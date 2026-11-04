# shellcheck shell=bash
# persona-lab config for a discovery study: a simulated research team that looks
# for where the app could go, not for how to polish what it is. Everything comes
# from ../config/config.sh except what is below.
#
#   caffeinate -i bash persona-lab/engine/run.sh persona-lab/config-research \
#     --personas-file persona-lab/config-research/personas.json
#
# The team must not know the product's intended limits, or it stays inside them.
# So nothing it reads is written from the spec:
#   - the desk researcher gets a topic, not the app or its name;
#   - specialists get one neutral sentence instead of the store listing;
#   - the lead researcher works in a copy holding only the code in SYNTHESIS_SCOPE,
#     with comments removed. verify-isolation.sh proves it cannot leave that copy,
#     and scope-audit.txt in the session records what it tried.
# Its output is ideas and hypotheses, not market data. Weighing them against the
# spec is the owner's job, after the study.

# shellcheck source=/dev/null
source "$CONFIG_DIR/../config/config.sh"

# The state names the base config restores to before this study's setup.
eval "$(declare -f reset_app | sed '1s/reset_app/base_reset_app/')"

STATES="fresh fresh_link demo"

STATE_PERSONA_fresh="This is a clean install, exactly what a new user gets from the store on first launch."
STATE_PERSONA_fresh_link="This is a clean install, exactly what a new user gets from the store on first launch. A recipe link is on the phone's clipboard, as if the user had just copied it in their browser."
STATE_PERSONA_demo="The app is set up the way it looks after a few weeks of use: several cookbooks, a dozen or so recipes with photos and a shopping list."

reset_app() {
  case "$1" in
    fresh | fresh_link) base_reset_app fresh "$2" ;;
    demo) base_reset_app demo "$2" ;;
    *) return 1 ;;
  esac
}

state_ready() {
  # Other studies leave photos behind; one of them seeded a theme in iteration 9.
  gallery_clear
  [ "$1" = fresh_link ] || return 0
  clipboard_set "$CONFIG_DIR/../config-import/clipboard/url-ok.txt" || return 1
  app_start
  app_wait_ready 30
}

SYNTHESIS_SCOPE="app components db utils i18n constants package.json app.json"
SCOPE_FORBIDDEN="SPEC.md CLAUDE.md AGENTS.md IDEAS.md UX_NOTES.md README.md TESTING.md"

scope_scrub() {
  local dir="$1"
  NODE_PATH="$APP_REPO/node_modules" node "$CONFIG_DIR/scrub-comments.js" "$dir" || return 1
  find "$dir" -name '*.md' -delete
  # What the parser can't see as a comment: a note in package.json, one in the DDL.
  grep -rIl 'SPEC' "$dir" | xargs perl -i -ne 'print unless /SPEC/'
  if grep -rIl 'SPEC' "$dir" >&2; then
    log "the snapshot still mentions the spec"
    return 1
  fi
}

RUNS_PER_PERSONA=1
MAX_STEPS=30
EVIDENCE_SECTIONS="Obserwacje"
MAX_BUDGET_DESK_RESEARCH=4.00
MAX_BUDGET_SYNTHESIS=8.00
