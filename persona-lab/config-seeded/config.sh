# shellcheck shell=bash
# persona-lab config for the calibration run: the same study as ../config, on a
# build with usability defects planted on purpose. It answers one question —
# how much of what is wrong do the personas catch? — with a number (recall)
# that can be compared between engine versions, models and persona sets.
#
#   bash persona-lab/config-seeded/build.sh          # builds runs/seeded/app-seeded.apk
#   bash persona-lab/engine/run.sh persona-lab/config-seeded \
#     --seeded persona-lab/config-seeded/seeded.json
#
# Everything comes from ../config/config.sh except what is below.
#
# - seeded.patch   the planted defects, as a patch against the app's sources.
#                  The working tree never keeps it: build.sh applies it, builds,
#                  and takes it back out.
# - seeded.json    the manifest the scorer compares the personas' reports with.
#                  No persona and no synthesis is told it exists.
# - A session run with --seeded stays out of the findings ledger.
#
# The run installs the seeded APK over the app on the emulator. Install a
# normal build again afterwards, or the next study tests the planted defects.

# shellcheck source=/dev/null
source "$CONFIG_DIR/../config/config.sh"

APK="${APK:-$APP_REPO/persona-lab/runs/seeded/app-seeded.apk}"
[ -f "$APK" ] || log "WARNING: $APK is missing — run persona-lab/config-seeded/build.sh first"

# One run per persona: the question is whether a defect gets caught at all,
# and more personas tell more about that than repeats of the same one.
PERSONA_COUNT=6
RUNS_PER_PERSONA=1
