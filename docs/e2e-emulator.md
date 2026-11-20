# E2E on an Android emulator

Two things live here:

1. **Maestro** — the repeatable device-level E2E suite in [`.maestro/`](../.maestro/README.md).
   Real assertions, element selection by `testID`, automatic waiting. Runs
   **locally on an emulator only**; there is no CI job for it.
2. **Ad-hoc adb smoke automation** — what was used to verify the backup flow
   before Maestro existed. Good for a one-off "does this work on a real build"
   check. **Not** a regression test (brittle, no assertions).

App package: `com.damianmalecki.keeptaste`. The E2E suite runs against a
side-by-side build, `com.damianmalecki.keeptaste.e2e` (§1.2), so the store
install and other test builds on the same emulator keep their data.

---

## 1. Maestro

### 1.1 Prerequisites

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

adb devices -l                       # one emulator listed
adb shell getprop persist.sys.locale # empty or en-*: the flows assert English copy
java -version                        # 17+ (Maestro and Gradle both need it)

brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro
maestro --version                    # verified with 2.12.1
```

The flows assert English UI strings. `clearState` resets the in-app language
preference to "System", so the **emulator's system language** must be English.

Maestro installs two helper apps on the device on first run
(`dev.mobile.maestro`, `dev.mobile.maestro.test`). It also sends usage
analytics unless `MAESTRO_CLI_NO_ANALYTICS=1` is set.

### 1.2 Build and install the E2E APK

The flows need a build that contains the `testID`s (§1.5), so build from the
current sources. A **release** build (JS bundled into the APK) is used: no
Metro server, same R8/minify path as the store build. The backup flows need a
real build anyway: `react-native-zip-archive` does not exist in Expo Go.

`android/` is git-ignored. In a fresh clone or worktree, generate it once:

```bash
npx expo prebuild --platform android --no-install
```

> If `android/` already exists with hand edits (e.g. a `keeptasteTestBuild`
> block), do **not** prebuild — it regenerates the folder and wipes them. Add
> the block below to the existing file instead.

Then add a side-by-side suffix to the `release` build type in
`android/app/build.gradle` (local file, not committed):

```groovy
release {
    // ...generated lines...
    // Side-by-side E2E build (Maestro): ./gradlew assembleRelease -PkeeptasteE2eBuild=true
    if (findProperty('keeptasteE2eBuild') == 'true') {
        applicationIdSuffix '.e2e'
    }
}
```

Build and install (≈10–15 min cold, a few minutes when only JS changed):

```bash
(cd android && ./gradlew assembleRelease -PkeeptasteE2eBuild=true -q)
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell pm list packages | grep keeptaste.e2e
```

Its own package name lets it install next to the Play build and the other
test builds (`.test`, `.pr*`) without touching their data; prebuild signs the
release build type with its debug keystore.
Rebuild after any change under `app/`, `components/` or other bundled code —
the flows run against what is in the APK, not against the working tree.

### 1.3 Test data for the restore flow

The demo archive is **not in the repo**; it is generated from
`assets/store/demo-import.md` + the photos in `assets/store/` (see
[store-assets.md](store-assets.md)):

```bash
bash scripts/crop-demo-photos.sh             # once per clone: assets/store/crops/ (git-ignored)
npx --yes tsx scripts/build-demo-backup.ts   # → assets/store/keeptaste-demo.zip (git-ignored)
adb push assets/store/keeptaste-demo.zip /sdcard/Download/
```

It holds 4 cookbooks (Italian Kitchen, Desserts, Weekday Dinners, Breakfasts),
14 recipes, 7 photos and one shopping list, "Weekend Shopping", with 3 of its
10 items in the cart. `scripts/reset-demo-library.sh` (persona-lab's `demo`
state) deletes every `keeptaste-demo*.zip` in Downloads and pushes one
language's archive; after a Polish persona run only `keeptaste-demo-pl.zip` is
left, so push again before running Maestro.

### 1.4 Run

```bash
maestro test .maestro/                           # all flows, ~2.5 min
maestro test .maestro/backup-restore.yaml        # one flow
maestro test .maestro/ --format junit --output maestro-report.xml
maestro test -e APP_ID=<package> .maestro/       # another install (needs the testIDs)
```

On a failure Maestro prints a debug folder (`~/.maestro/tests/<timestamp>/`)
with a screenshot, the view hierarchy and its log.

### 1.5 The flows

| Flow | Steps | Asserted | Not asserted |
| --- | --- | --- | --- |
| `backup-restore.yaml` | fresh install → Settings → Restore backup → pick `keeptaste-demo.zip` | "Backup restored"; home shows all 4 cookbooks; Italian Kitchen lists its recipes; "All recipes" has no seed "Pancakes" (replace, not merge) and its search finds the archive's oldest recipe, "Ricotta Pancakes"; Shopping shows "Weekend Shopping", "3/10 in cart" | the file picker's own UI; photos rendering |
| `backup-export.yaml` | fresh install → Settings → Export all data → Share / send | the share sheet receives `keeptaste-backup.zip`; Back returns to Settings | archive contents (covered by `__tests__/backupArchive.test.ts`, `__tests__/integration/backupRoundTrip.test.ts`); any share target |
| `create-recipe.yaml` | fresh install → + → title and 2 ingredient lines → Save | the recipe is in "All recipes" above the seed; its view shows title, "Ingredients" and both lines | snackbar text; other fields |
| `shopping-list.yaml` | fresh install → Shopping → new list → add "Milk / 2 l" and "Bread" → tick Milk | Milk is `checked`, "In cart" appears, Bread stays unchecked; the overview shows `1/2 in cart` | swipe actions; check-off animation |

Each flow starts with `subflows/fresh-launch.yaml`: `launchApp` with
`clearState: true`, then a wait for the home screen. A cleared app is **not an
empty library** — the first launch seeds a "Breakfasts" cookbook with
"Pancakes" (SPEC.md §5.20, `db/seed.ts`); the subflow waits for that tile so
no step races migrations or the seed, then `waitForAnimationToEnd` until its
cover photo has decoded and faded in (§1.7).

`testID`s used by the flows (Maestro `id:`):

| testID | Element |
| --- | --- |
| `home-settings`, `home-all-recipes`, `home-add-recipe` | home header gear, "All recipes" row, recipe FAB |
| `tab-recipes`, `tab-shopping` | bottom tabs (`tabBarButtonTestID`) |
| `settings-restore` | Settings → Restore backup |
| `recipes-search` | search field of a recipe list ("All recipes" / a cookbook) |
| `recipe-title`, `recipe-ingredients`, `recipe-save` (+ other `recipe-*` fields) | recipe form |
| `shopping-empty-new-list`, `shopping-add-list` | new list (empty state / FAB) |
| `shopping-new-name`, `shopping-new-create` | new-list modal |
| `shopping-empty-add`, `shopping-add-product` | add product (empty state / FAB) |
| `shopping-item-name`, `shopping-item-qty`, `shopping-item-confirm` | inline add row |

### 1.6 System UI: what is fragile and how it is handled

- **File picker** (`documentsui`). It opens either in Downloads or on
  "Recent", depending on its last state. `subflows/open-demo-zip-in-picker.yaml`
  taps the file if it is already listed, otherwise opens "Show roots" →
  "Downloads" first. Both paths have run green on the reference emulator.
  Nothing about the picker is asserted. Picker labels are system strings, so
  this step, too, needs an English emulator.
- **Share sheet** (`com.android.intentresolver`). Only the file name line is
  asserted, then Back. Recommended targets, Quick Share etc. vary per device.
- **Alerts** use the native Android dialog; the flow taps its "OK".

### 1.7 Pitfalls found while writing the flows

- **`hideKeyboard` discards forms.** On Android it sends a system Back, and the
  modal forms close on Back without saving or asking (known app bug, logged).
  The flows tap the pinned Save instead.
- **A successful restore leaves Settings by itself** (`router.back()` after the
  alert). An extra `back` exits the app.
- **"All recipes" is sorted newest first**, so the seed recipe (created at
  launch) is at the top and the demo's oldest recipe 14 tall cards down.
  `scrollUntilVisible` timed out on it once, so the flow searches instead.
- **A tap right after a cold start can be dropped.** The seed tile's name shows
  before its 2.5 MB cover photo is decoded; one run lost a tab tap during the
  GC that follows. Maestro's "settled" check reads the accessibility tree, which
  doesn't see the photo fade or the JS splash overlay (both non-accessible
  views), so `fresh-launch` adds `waitForAnimationToEnd`, which compares
  screenshots.

### 1.8 Reference run

2026-11-20, emulator `New_Device` (Android 15, 1080×1920, English),
Maestro 2.12.1, `com.damianmalecki.keeptaste.e2e` built from 1.3.3 sources plus
the `testID`s. After the two fixes in §1.7: **4 consecutive full runs, 4/4 flows
each, ~2.5 min per run**. Before them, 1 of 2 runs had 2 failures (the dropped
tap and the scroll timeout).

---

## 2. Ad-hoc adb smoke automation

Kept for quick exploratory checks; for anything you want to re-run, write a
Maestro flow.

### Install / reinstall

```bash
adb install ./keeptaste.apk
# If a build signed with a different key is already installed:
#   Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]
# → uninstall first (wipes its data — fine on an emulator):
adb uninstall com.damianmalecki.keeptaste
adb install ./keeptaste.apk
```

Seed the demo archive for an import test as in §1.3.

### Launch / relaunch the app

```bash
adb shell am force-stop com.damianmalecki.keeptaste
adb shell monkey -p com.damianmalecki.keeptaste -c android.intent.category.LAUNCHER 1
```

### Drive the UI (taps by coordinate)

```bash
adb shell wm size                    # e.g. "Physical size: 1080x1920"
adb shell input tap <x> <y>          # tap at a pixel (read coords off a screenshot)
adb shell input keyevent KEYCODE_BACK
adb shell input text "hello"
adb shell input swipe <x1> <y1> <x2> <y2> <ms>
```

> ⚠️ Coordinate taps are the brittle part. They depend on resolution/layout and
> have no idea what they hit — during the original run a tap meant for
> "Restore" landed on "Export" because the y-estimate was off.

### Read app state (asserting without a framework)

```bash
adb exec-out screencap -p > /tmp/kt.png          # screenshot

# Which Activity is in front? More reliable than guessing from a screenshot:
adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"
#   com.google.android.documentsui/...PickActivity       → file picker is open
#   com.android.intentresolver/...ChooserActivity...     → share sheet is open
#   com.damianmalecki.keeptaste/.MainActivity            → back in the app

# On-screen texts (works for system UI such as the share sheet):
adb exec-out uiautomator dump /dev/tty | grep -o 'text="[^"]*"'

# Crash / error signals:
adb logcat -c                      # clear before the action
adb logcat -d | grep -iE "FATAL|AndroidRuntime|Exception|ReactNativeJS"

adb shell pidof com.damianmalecki.keeptaste && echo RUNNING
```

### The backup flow that was verified by hand (sequence)

1. Fresh install + launch → home with the first-launch seed ("Breakfasts").
2. Settings gear → Settings ("Restore backup", "Automatic backup").
3. **Export all data → Share / send** → share sheet shows
   `keeptaste-backup.zip` with Drive/Gmail/Bluetooth. Back to dismiss.
4. **Restore backup** → `dumpsys` shows `documentsui` in front.
5. Tap `keeptaste-demo.zip` in Downloads → focus back on `MainActivity`.
6. **"Backup restored"** alert; OK returns to home, now a 4-cookbook grid with
   cover photos.
7. **Shopping** tab → "Weekend Shopping — 3/10 in cart".

This is exactly what `backup-export.yaml` + `backup-restore.yaml` now automate.

---

## 3. Strategy note

Unit tests cover pure logic; `test:integration` covers `db/` on real SQLite; the
web build (Playwright) smoke-tests flows in a browser. None of them reaches the
native side: the file picker, the share sheet, `react-native-zip-archive`, the
real SQLite file. The Maestro suite is that device-level layer, deliberately
small — backup restore/export, the recipe create path and the shopping list.
It runs locally only, by decision (2026-11-19): no CI workflow.
