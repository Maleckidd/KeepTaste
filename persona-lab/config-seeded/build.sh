#!/bin/bash
# Builds the calibration APK: the app with the defects of seeded.patch planted
# in it. The patch is in the working tree only while Gradle runs.
#
#   bash persona-lab/config-seeded/build.sh
#
# Output: persona-lab/runs/seeded/app-seeded.apk (git-ignored). It has the
# normal application id, so it installs over the app on the emulator and the
# demo-library reset keeps working. Build and install a normal APK afterwards.
#
# BUILD_CMD replaces the Gradle call (it runs in the repository root and must
# leave the APK at $APK_OUT), e.g. BUILD_CMD=true to only test the patch.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
PATCH="$DIR/seeded.patch"
APK_OUT="$REPO/android/app/build/outputs/apk/release/app-release.apk"
DEST="$REPO/persona-lab/runs/seeded/app-seeded.apk"

cd "$REPO"
if ! git apply --check "$PATCH" 2>/dev/null; then
  echo "seeded.patch no longer applies to the working tree." >&2
  echo "Either it is already applied (git apply -R --check says: $(git apply -R --check "$PATCH" 2>&1 && echo yes || echo no))," >&2
  echo "or the code moved on: re-plant the defects listed in seeded.json and save them with" >&2
  echo "  git diff -- <files> > persona-lab/config-seeded/seeded.patch" >&2
  exit 1
fi

# Whatever happens to the build, the working tree gets its code back.
STAMP="$(mktemp "${TMPDIR:-/tmp}/persona-seeded.XXXXXX")"
trap 'git apply -R "$PATCH" && echo "seeded.patch taken back out" >&2' EXIT
git apply "$PATCH"
echo "seeded.patch applied ($(grep -c 'SEEDED DEFECT' "$PATCH") defects), building…" >&2

if [ -n "${BUILD_CMD:-}" ]; then
  eval "$BUILD_CMD"
else
  (cd android && ./gradlew assembleRelease -q)
fi

# Only an APK built just now counts. An older one at the same path is a build
# without the defects, and a calibration run on it would report a recall of 0.
if [ -f "$APK_OUT" ] && [ "$APK_OUT" -nt "$STAMP" ]; then
  mkdir -p "$(dirname "$DEST")"
  cp "$APK_OUT" "$DEST"
  echo "→ $DEST" >&2
else
  echo "the build left no new APK at $APK_OUT — nothing copied" >&2
  exit 1
fi
