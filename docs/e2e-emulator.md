# E2E on an Android emulator

Two things live here:

1. **Ad-hoc adb smoke automation** — exactly what was used to verify the backup
   flow on an emulator. Good for a one-off "does this actually work on a real
   build" check. **Not** a regression test (brittle, no assertions).
2. **Maestro** — the recommended way to turn that smoke run into a real,
   repeatable E2E test for this Expo/React Native app.

App package id: `com.damianmalecki.keeptaste`

---

## 0. Prerequisites

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"   # adb, etc.

adb devices -l            # an emulator or device must be listed
adb shell wm size         # e.g. "Physical size: 1080x1920" — needed for tap coords
```

Build the APK (local EAS build — needs `ANDROID_HOME` set, else Gradle fails
with "SDK location not found"):

```bash
eas build --platform android --profile preview --local \
  --non-interactive --output ./keeptaste.apk
```

---

## 1. Ad-hoc adb smoke automation (what was actually used)

### Install / reinstall

```bash
adb install ./keeptaste.apk
# If a build signed with a different key is already installed:
#   Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]
# → uninstall first (wipes its data — fine on an emulator, and a good way to
#   test disaster-recovery restore):
adb uninstall com.damianmalecki.keeptaste
adb install ./keeptaste.apk
```

### Seed a file for the import test

The restore flow needs a `.zip` reachable by the system file picker:

```bash
# Generate the demo archive (4 cookbooks, 14 recipes, photos, 1 shopping list):
npx --yes tsx scripts/build-demo-backup.ts
adb push assets/store/keeptaste-demo.zip /sdcard/Download/
```

### Launch / relaunch the app

```bash
adb shell am force-stop com.damianmalecki.keeptaste
adb shell monkey -p com.damianmalecki.keeptaste -c android.intent.category.LAUNCHER 1
```

### Drive the UI (taps by coordinate)

```bash
adb shell input tap <x> <y>          # tap at a pixel (read coords off a screenshot)
adb shell input keyevent KEYCODE_BACK
adb shell input text "hello"
adb shell input swipe <x1> <y1> <x2> <y2> <ms>
```

> ⚠️ Coordinate taps are the brittle part. They depend on resolution/layout and
> have no idea what they hit — during the real run a tap meant for "Restore"
> landed on "Export" because the y-estimate was off. Fine for an exploratory
> smoke run, unacceptable for a regression test. See Maestro below.

### Read app state (this is how you "assert" without a framework)

```bash
# Screenshot — pull and look at it:
adb exec-out screencap -p > /tmp/kt.png

# Which Activity is in front? (e.g. did the file picker open, did we return to
# the app?) — far more reliable than guessing from a screenshot:
adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"
#   com.google.android.documentsui/...PickActivity   → file picker is open
#   com.damianmalecki.keeptaste/.MainActivity        → back in the app

# Crash / error / progress signals from the JS + native layers:
adb logcat -c                      # clear before the action
# ...perform the action...
adb logcat -d | grep -iE "FATAL|AndroidRuntime|Exception|ReactNativeJS"
#   No FATAL from the app package = no crash.
#   "libavif_android.so ... ok" + a big GC freeing LOS objects after an import
#   = images were decoded / the large base64 archive was processed.

# Is the process alive?
adb shell pidof com.damianmalecki.keeptaste && echo RUNNING
```

### The backup flow that was verified (sequence)

1. `force-stop` + `monkey` launch → empty "No cookbooks" state.
2. Tap the settings gear (top-right) → Settings screen (screenshot shows the new
   "Restore backup" + "Automatic backup" UI).
3. Tap **Export all data** → system share sheet shows `keeptaste-backup.zip`
   with Drive/Dropbox/Gmail (proves Level-0 share export). `KEYCODE_BACK` to
   dismiss.
4. Tap **Restore backup** → `dumpsys` confirms `documentsui.PickActivity`.
5. Tap the demo zip in Downloads → `dumpsys` shows focus back on `MainActivity`;
   logcat shows the picker `onFinished(...keeptaste-demo.zip)` and the file read.
6. Screenshot: **"Backup restored"** alert over a 4-cookbook grid with cover
   photos. Tap OK.
7. Tap the **Shopping** tab → "Weekend Shopping — 3/10 in cart".

`uiautomator dump` was tried for element coordinates but is unreliable here:
React Native exposes elements via `accessibilityLabel`, which this dump didn't
surface well. That limitation is exactly what Maestro solves.

---

## 2. Maestro — the recommended real E2E

[Maestro](https://maestro.mobile.dev) fits Expo/RN best: YAML flows that select
elements by **text / `accessibilityLabel` / `testID`** (not pixels), with real
assertions and automatic waiting. Runs against the same emulator + APK.

### Install & run

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash      # installs `maestro`
adb install ./keeptaste.apk                              # app under test
adb push assets/store/keeptaste-demo.zip /sdcard/Download/
maestro test .maestro/backup-restore.yaml
```

### Example flow: restore a backup (`.maestro/backup-restore.yaml`)

```yaml
appId: com.damianmalecki.keeptaste
---
- launchApp:
    clearState: true          # start from an empty library (disaster-recovery case)
- assertVisible: "No cookbooks"

# Open Settings (the gear has an accessibilityLabel)
- tapOn:
    id: "settings-gear"       # add testID, or use: text/accessibilityLabel
- assertVisible: "Restore backup"

# Export → share sheet appears (proves Level-0 export)
- tapOn: "Export all data"
- assertVisible: "keeptaste-backup.zip"
- back

# Restore from the seeded demo archive
- tapOn: "Restore backup"
- tapOn: "keeptaste-demo.zip"     # in the system file picker
- assertVisible: "Backup restored"
- tapOn: "OK"

# Verify the library populated
- assertVisible: "Italian Kitchen"
- assertVisible: "Desserts"
- tapOn: "Shopping"
- assertVisible: "Weekend Shopping"
```

### What to add to the app for robust selectors

Most selectors work today because the UI kit already requires
`accessibilityLabel` (e.g. `IconButton`). To make flows stable, add a `testID`
to the few elements selected by position rather than visible text:

- the Settings gear (`IconButton` in the home header),
- the bottom-tab items (Recipes / Shopping),
- the cookbook tiles (so a flow can open a specific cookbook).

`testID` survives copy/i18n changes, so prefer it over `text:` for anything that
isn't user-facing copy you actually want to assert on.

### Strategy note

The project currently has **no device-level E2E layer** by design (SPEC §2): unit
tests cover pure logic only; UI/native behavior is verified by running the app,
and the web build is the agent smoke-test environment. Adding Maestro is a
deliberate expansion of the test strategy — the backup **export → restore →
assert** path is the highest-value candidate, since it spans DB + filesystem +
UI in a way unit tests cannot reach.
```
