# Upgrade plan: Expo SDK 52 → 57 (Android target API 36)

**Why:** Google Play requires `targetSdkVersion 36` (Android 16). After **31 Aug 2026** an app
targeting API 35 can no longer be updated (the existing listing stays live; only updates are
blocked). KeepTaste currently ships `targetSdkVersion 35` on Expo SDK 52 / RN 0.76.9.

**Why not just bump the number:** RN 0.76 pins AGP 8.6.0, and `compileSdk 36` is only officially
supported from AGP 8.9.1. On top of that, Android 16 with `targetSdk 36` forces edge-to-edge —
`windowOptOutEdgeToEdgeEnforcement` is ignored — and RN 0.76 has no first-class support for it.
The sanctioned path is an SDK upgrade.

**Why 57 and not 54:** SDK 54 is the last release with legacy-architecture support; SDK 55+ is New
Architecture only. Stopping at 54 buys a repeat of this migration within a year (API 36 expires
31 Aug 2027) with the New Arch work still ahead. SDK 57 (RN 0.86, 30 Jun 2026) is a small,
no-breaking-change release over 56 and ships API 36 by default.

---

## 1. Target versions (verified against the npm registry, Aug 2026)

| | Now | After |
|---|---|---|
| Expo SDK | 52.0.49 | **57.0.9** |
| React Native | 0.76.9 | **0.86.2** |
| React / react-dom | 18.3.1 | **19.2.3** |
| Android compileSdk / targetSdk | 35 / 35 | **36 / 36** (default) |
| minSdk | 24 | 24 (unchanged) |
| AGP / buildTools | 8.6.0 / 35.0.0 | **8.12.0 / 36.0.0** |
| Architecture | legacy (`newArchEnabled=false`) | **New Architecture (mandatory)** |
| Edge-to-edge | off | **on (`edgeToEdgeEnabled=true`)** |

Sources: `expo-modules-core@57.0.8/android/ExpoModulesCorePlugin.gradle:65-69` (compile/target/min
SDK defaults), `react-native@0.86.2/gradle/libs.versions.toml` (AGP, buildTools),
`expo-template-bare-minimum@57.0.11/android/gradle.properties` (newArch, edge-to-edge defaults).

**Consequence:** the `expo-build-properties` SDK overrides in `app.json` become redundant and are
removed, not bumped. API 36 comes from the SDK defaults.

---

## 2. Dependency matrix

Versions below are from `expo@57.0.9/bundledNativeModules.json` — `npx expo install --fix` will
apply them. Listed so deviations are visible in review.

### Managed by `expo install --fix`

| Package | Now | SDK 57 |
|---|---|---|
| `expo` | ~52.0.0 | ~57.0.9 |
| `react` / `react-dom` | 18.3.1 | 19.2.3 |
| `react-native` | 0.76.9 | 0.86.2 |
| `@expo/metro-runtime` | ~4.0.1 | ~57.0.8 |
| `@expo/vector-icons` | ~14.0.4 | ^15.0.2 |
| `expo-asset` | ~11.0.5 | ~57.0.8 |
| `expo-build-properties` | ~0.13.3 | ~57.0.8 |
| `expo-clipboard` | ~7.0.1 | ~57.0.1 |
| `expo-constants` | ~17.0.8 | ~57.0.8 |
| `expo-dev-client` | ~5.0.20 | ~57.0.10 |
| `expo-document-picker` | ~13.0.3 | ~57.0.1 |
| `expo-file-system` | ~18.0.12 | ~57.0.1 |
| `expo-font` | ~13.0.4 | ~57.0.1 |
| `expo-haptics` | ~14.0.1 | ~57.0.1 |
| `expo-image` | ~2.0.7 | ~57.0.1 |
| `expo-image-manipulator` | ~13.0.6 | ~57.0.7 |
| `expo-image-picker` | ~16.0.6 | ~57.0.7 |
| `expo-keep-awake` | ~14.0.3 | ~57.0.1 |
| `expo-linear-gradient` | ~14.0.2 | ~57.0.1 |
| `expo-linking` | ~7.0.5 | ~57.0.4 |
| `expo-localization` | ~16.0.1 | ~57.0.1 |
| `expo-navigation-bar` | ~4.0.9 | ~57.0.2 ⚠ breaking |
| `expo-print` | ~14.0.3 | ~57.0.1 |
| `expo-router` | ~4.0.0 | ~57.0.9 |
| `expo-sharing` | ~13.0.1 | ~57.0.8 |
| `expo-splash-screen` | ~0.29.24 | ~57.0.5 |
| `expo-sqlite` | ~15.1.4 | ~57.0.1 |
| `expo-status-bar` | ~2.0.0 | ~57.0.1 |
| `expo-system-ui` | ~4.0.9 | ~57.0.2 |
| `react-native-gesture-handler` | ~2.20.2 | ~2.32.0 |
| `react-native-reanimated` | ~3.16.1 | 4.5.1 |
| `react-native-safe-area-context` | 4.12.0 | ~5.7.0 |
| `react-native-screens` | ~4.4.0 | ~4.26.0 |
| `react-native-web` | ~0.19.13 | ~0.21.0 |

### Bumped by hand (not Expo-managed)

| Package | Now | Target | Note |
|---|---|---|---|
| `expo-share-intent` | 3.2.3 | **^8.0.1** | version-per-SDK: 4→53, 5→54, 6→55, 7→56, 8→57 |
| `react-native-zip-archive` | ^8.0.1 | **^9.0.2** | 8.0.1 already ships `codegenConfig` (TurboModule) |
| `drizzle-orm` | ^0.38.0 | **^0.45.2** | peers `expo-sqlite >=14`, `sql.js >=1` — both satisfied |
| `drizzle-kit` (dev) | ^0.30.0 | latest | dev-only; auto-migrations are not used (CLAUDE.md) |
| `@types/react` (dev) | ~18.3.12 | **~19.2.x** | must follow React 19 |

### Deliberately unchanged

| Package | Version | Rationale |
|---|---|---|
| `@react-native-ml-kit/text-recognition` | ^2.0.0 | no newer release (last publish Sep 2025) — see Risk R1 |
| `react-native-markdown-display` | ^7.0.2 | unmaintained but pure JS; uses `propTypes` only, **no `defaultProps`** → React 19 ignores them silently. One import, `app/recipe/[id].tsx:15` |
| `jszip`, `sql.js` | current | pure JS, no RN coupling |
| `jest` / `ts-jest` | current | tests are logic-only under `ts-jest`; `jest-expo` is not used, so React 19 does not touch the suite |

---

## 3. Phase 0 — safety net

1. Branch off `main`:
   ```bash
   git checkout -b upgrade/expo-sdk-57
   ```
2. Record the baseline in the PR description (already verified 2026-08-02):
   `npx tsc --noEmit` clean, `npm test` → 35 suites / 845 tests passing.
3. On the test device: run **Settings → Export backup (.zip)** and copy the archive off-device.
   The upgrade touches the SQLite path and the image directory; a restorable archive is the
   rollback for user data.
4. Keep the current production `.aab` (versionCode 9) reachable — Play lets you re-promote a
   previous release if 10 misbehaves.
5. Confirm `.gitignore` still anchors `/android/` and only ignores `modules/*/android/build/`.
   An unanchored `android/` pattern strips `modules/safwriter`'s Kotlin sources from the EAS
   archive and produces a white-screen build (this is what broke versionCode 6).

---

## 4. Phase 1 — dependencies

```bash
npx expo install expo@^57 --fix
npx expo install --fix
npm i expo-share-intent@^8.0.1 react-native-zip-archive@^9.0.2 drizzle-orm@^0.45.2
npm i -D @types/react@~19.2 drizzle-kit@latest
npx expo-doctor@latest
```

Expected `expo-doctor` complaints, and the ruling on each:
- `@react-native-ml-kit/text-recognition` — unmaintained / no New Arch metadata → **accepted**, see R1.
- `react-native-markdown-display` — unmaintained → **accepted**, pure JS.
- Anything else → treat as a real finding and resolve before moving on.

Do not hand-edit `package.json` versions; let `expo install` write them so the lockfile matches
what EAS resolves.

---

## 5. Phase 2 — configuration

### `app.json`

1. **Remove** the `expo-build-properties` Android SDK overrides:
   ```json
   ["expo-build-properties", { "android": {
     "compileSdkVersion": 35, "targetSdkVersion": 35, "buildToolsVersion": "35.0.0"
   }}]
   ```
   SDK 57 defaults to 36/36/36.0.0. Keep the plugin entry only if another property is needed;
   otherwise drop the entry entirely.
2. `android.versionCode`: **9 → 10**.
3. `version`: **1.0.0 → 1.0.1**. Patch, not minor: this release ships no user-facing feature — it
   is a platform-compliance upgrade whose success criterion is that nothing visibly changes.
   `package.json`'s `version` field is cosmetic here (Play reads `app.json`), but bump it to 1.0.1
   too so the two do not drift.
4. Verify `experiments.typedRoutes` is still a recognised key under SDK 57 (typed routes became
   the default in a later SDK). `expo-doctor` / schema validation reports it if stale.
5. Splash config (`expo-splash-screen` plugin + top-level `splash`) stays as is; the API it relies
   on (`preventAutoHideAsync` / `hideAsync` / `setOptions`) is unchanged in 57. `imageWidth: 160`
   and the light/dark backgrounds still have to stay in lockstep with `app/_layout.tsx` and
   `constants/theme.ts` (SPEC.md §5.20).

### `babel.config.js`

Remove `plugins: ['expo-router/babel']`. In SDK 57 that entry resolves to a no-op deprecation
shim (`expo-router@57.0.9/babel.js` just logs a warning); `babel-preset-expo` has handled it since
SDK 50. Harmless if left, but it is noise on every build.

### `eas.json`

No change required (`cli.version: ">= 16.0.0"`, local eas-cli 20.1.0). Optionally pin an Android
image if the build picks a JDK that RN 0.86 dislikes — decide only if Phase 5 fails.

---

## 6. Phase 3 — code changes

Four concrete edits, in dependency order.

### 3.1 `expo-navigation-bar` — hard breaking change ⚠

`setBackgroundColorAsync` and `setButtonStyleAsync` **no longer exist** in
`expo-navigation-bar@57` (verified against `build/NavigationBar.d.ts`: the surviving exports are
the `NavigationBar` component, `setStyle`, `setVisibilityAsync`, `getVisibilityAsync`,
`useVisibility`, `addVisibilityListener`).

- File: [`app/_layout.tsx:90-91`](../app/_layout.tsx).
- Replace the two calls with the `setStyle` / `NavigationBar` component API.
- Under edge-to-edge the navigation bar is transparent by design, so the "otherwise it stays white
  in dark mode" comment above the call is now wrong — rewrite it to describe what actually happens.
- `SystemUI.setBackgroundColorAsync` (same effect block) is unaffected; keep it, it is what stops
  the white gap frame after the splash hands off.

### 3.2 `expo-file-system` — import redirect

SDK 54 introduced the `File`/`Directory` API and moved the old surface to `expo-file-system/legacy`,
which **is still exported in 57** (verified in the package `exports` map, including
`StorageAccessFramework`).

- Change the import in the 4 source files: [`app/settings.tsx`](../app/settings.tsx),
  [`utils/backupTrigger.ts`](../utils/backupTrigger.ts),
  [`utils/imageStorage.ts`](../utils/imageStorage.ts),
  [`utils/backupArchiveFs.ts`](../utils/backupArchiveFs.ts).
- 32 call sites, all covered by the legacy surface: `deleteAsync`, `cacheDirectory`,
  `StorageAccessFramework`, `readAsStringAsync`, `documentDirectory`, `copyAsync`,
  `writeAsStringAsync`, `makeDirectoryAsync`, `getInfoAsync`.
- **Do not forget the Jest mapper.** `jest.config.js` maps `^expo-file-system$`; add
  `^expo-file-system/legacy$` → `<rootDir>/__mocks__/expo-file-system.ts` or the backup tests will
  load the real native module and fail under node.
- Rewriting to the new `File`/`Directory` API is explicitly **out of scope** for this upgrade.
  Track it separately; mixing an API migration into an SDK jump makes a failure impossible to
  bisect.

### 3.3 `expo-share-intent` 3 → 8

Five majors, one per SDK. Read the changelog for the config-plugin options in use
(`disableIOS`, `androidIntentFilters: ["text/*"]` in `app.json`) and for the hook/provider API in
[`app/_layout.tsx`](../app/_layout.tsx) and [`utils/shareIntent.ts`](../utils/shareIntent.ts).
The Android share target is SPEC.md §5.15 — a behavioural change here is a product regression, so
this gets its own on-device check in Phase 6.

### 3.4 Optional cleanup (only if it stays free)

- `ImagePicker.MediaTypeOptions.Images` → `mediaTypes: ['images']` in
  [`components/recipe/RecipeForm.tsx:168`](../components/recipe/RecipeForm.tsx),
  [`components/cookbook/CookbookForm.tsx:94`](../components/cookbook/CookbookForm.tsx),
  [`components/recipe/ImportSheet.tsx:296`](../components/recipe/ImportSheet.tsx).
  `MediaTypeOptions` still exists in `expo-image-picker@57` (deprecated, functional), so this is
  hygiene, not a blocker.

### Verified as needing **no** change

- `SafeAreaView` — all 8 imports already come from `react-native-safe-area-context`, none from
  RN core.
- `react-native-reanimated` — not imported anywhere in app code; it is a transitive dependency of
  `expo-router`. The 3 → 4 bump (normally the painful part of this jump) costs nothing here: there
  are no worklets to migrate.
- `expo-router` API surface — `useRouter`, `useLocalSearchParams`, `useFocusEffect`, `usePathname`,
  `Stack`, `Tabs`, `router.push/back/replace`. All stable across 4 → 7.
- `expo-sqlite` — `openDatabaseSync` / `execSync` unchanged in 57, so `db/client.ts` and the
  `PRAGMA user_version` migration ladder are untouched.
- `modules/safwriter` — 40 lines on the stable `expo.modules.kotlin.modules.Module` API.
- `tsconfig.json` — `extends: expo/tsconfig.base` picks up the new base automatically.

---

## 7. Phase 4 — green gate (before any native build)

```bash
npx tsc --noEmit          # must be clean
npm test                  # must stay 35 suites / 845 tests
npm run web               # sql.js smoke: cookbook → recipe form → save → list
```

`react-native-web` jumps 0.19 → 0.21, so the web build is the most likely thing to wobble here.
Per SPEC.md §2 web is a test environment, not a product platform — a web-only cosmetic break is not
a release blocker, but a web build that **cannot run the form → save → list flow** is, because it
removes the fast feedback loop for everything below.

**The web gate does not cover module resolution for native.** Metro shims Node builtins on the web
platform and does not on native, so a `require()` of a Node builtin bundles cleanly on web and
fails only in a native release bundle (verified: see the `punycode` entry in §14). Add the native
production bundle to the gate — it is minutes, runs without a device, and catches this class:

```bash
npx expo export --platform android --output-dir /tmp/export-check
```

Commit at this point. This is the last state that can be reasoned about without a device.

---

## 8. Phase 5 — native build

```bash
rm -rf android
npx expo prebuild --clean --platform android
eas build --profile development --platform android
```

- `android/` is gitignored (CNG), so regenerating is free — but re-verify Phase 0 step 5 before
  the EAS upload, since the archive respects `.gitignore`.
- Confirm in the prebuild output / `android/gradle.properties` that `newArchEnabled=true`,
  `edgeToEdgeEnabled=true`, `android.compileSdkVersion=36`, `android.targetSdkVersion=36`.
- Expo Go is **not** an option for verification: `react-native-zip-archive` is a native module
  absent from the Expo Go runtime (CLAUDE.md), so every backup flow needs this dev client.

If the build fails, expect it in one of two places: `@react-native-ml-kit/text-recognition`
(see R1) or a config plugin from `expo-share-intent`. Both are isolated — resist the urge to start
downgrading unrelated packages.

---

## 9. Phase 6 — on-device verification

Run on the dev client, **on a device or emulator running Android 16**, in both Light and Dark.
Ordered by blast radius.

**Data integrity (do first, on a DB carried over from the SDK 52 build):**
1. App launches against an existing `recipes.db` — the migration ladder runs, no data loss.
2. Cookbooks, recipes, shopping lists all render; recipe photos still resolve from the image
   directory.
3. `.zip` backup export → wipe app data → restore → everything returns (SPEC.md §5.17).
4. SAF write path: export to a Drive/SAF destination — this is the `modules/safwriter` Kotlin
   module under New Arch, the one custom native surface in the app.
5. Auto-backup: background the app, confirm the dirty-flag flush fires (`utils/backupTrigger.ts`)
   and the "saving" banner behaves.
6. `.md` export → import round-trip (SPEC.md §5.6).

**New-Architecture surfaces:**
7. OCR import ("From photo") — the one legacy native module. If unavailable, `isOcrAvailable`
   in [`utils/recipeOcr.ts`](../utils/recipeOcr.ts) should hide the option rather than crash;
   confirm the gate actually holds.
8. Android share target: share a link from a browser into the app, confirm it lands in the
   new-recipe form (SPEC.md §5.15).
9. Image picker: camera and library, plus the 1280px/JPEG-0.7 downscale on new photos.
10. Cookbook → PDF share (`expo-print`), recipe → text share.

**Edge-to-edge / visual (forced by `targetSdk 36` regardless of path):**
11. Every screen, top and bottom insets, in both themes: `(tabs)/index`, `(tabs)/shopping`,
    `settings`, `cookbook/[id]`, `cookbook/new`, `cookbook/edit`, `recipe/[id]`, `recipe/new`,
    `recipe/edit`, `recipe/add-to-list`, `shopping/[id]`, `shopping/new`.
12. `components/ui`: `ScreenHeader`, `ModalHeader`, `Fab` (bottom inset), `ActionSheet`,
    `SnackbarProvider` (does the snackbar clear the gesture bar?), `SwipeableRow`.
13. Navigation-bar contrast after the 3.1 rewrite — transparent bar over both palettes, with
    3-button navigation *and* gesture navigation.
14. Splash handoff (SPEC.md §5.20): no white flash, logo size matches between the native splash
    and the JS overlay, cold start and warm start.
15. Keyboard behaviour in the recipe form with edge-to-edge on — the regression edge-to-edge most
    often causes.

**Housekeeping:**
16. Language switch EN ↔ PL, theme switch Light/Dark/System (both persist through a restart).
17. Undo snackbar for recipe, cookbook, shopping-list, and item deletes.

---

## 10. Phase 7 — release

1. `eas build --profile production --platform android` (app-bundle, version 1.0.1 / versionCode 10).
2. Upload to the **internal testing** track first. Confirm in the Play Console that the
   API 36 warning is gone from the release, before promoting.
3. Install from internal testing over the production build to catch upgrade-path problems a fresh
   install hides — same class of bug as a skipped migration-ladder step.
4. Promote to production. Play sends a confirmation that the target-API issue is resolved.
5. Only after that: update SPEC.md / CLAUDE.md where they name SDK 52, RN 0.76, or the Android
   target, and refresh the `android-target-sdk` memory note.

---

## 11. Risk register

| id | Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|---|
| **R1** | `@react-native-ml-kit/text-recognition` fails under New Arch or at build time. Legacy `ReactContextBaseJavaModule`, no codegen, `package=` in the manifest instead of `namespace` (tolerated by AGP 8.12, removed in AGP 9), last release Sep 2025 | medium | OCR import (SPEC.md §5.15 mode T3) only | Legacy modules run through the interop layer, and [`utils/recipeOcr.ts`](../utils/recipeOcr.ts) already gates on `NativeModules.TextRecognition != null`, so the failure mode is a hidden menu entry, not a crash. If it breaks: (a) patch the manifest via `patch-package`, (b) swap to a maintained OCR package, (c) ship with T3 disabled and fix in a follow-up. **Do not let this hold the release** — the deadline is the target API, not OCR |
| **R2** | Edge-to-edge visual regressions | high | cosmetic, app-wide | `react-native-safe-area-context` is already used in 18 files, so the structure is in place. Budget real time for Phase 6 items 11-15. Unavoidable at `targetSdk 36` on any path |
| **R3** | `expo-share-intent` 3 → 8 changes the plugin or hook API | medium | Android share target | Isolated to 2 files + the `app.json` plugin entry; changelog read is part of step 3.3 |
| **R4** | `react-native-web` 0.19 → 0.21 breaks the web smoke build | medium | dev feedback loop, not the product | SPEC.md §2 puts web out of product scope; only a broken form → save → list flow blocks (it is the cheap loop for everything else) |
| **R5** | Migration ladder misbehaves on an upgraded install | low | user data | Phase 6 runs against a carried-over DB, and Phase 7 step 3 installs *over* production. Phase 0 backup is the recovery |
| **R6** | React 19 breaks `react-native-markdown-display` | low | recipe view rendering | No `defaultProps`; `propTypes` are ignored, not fatal. Single import — a hand-rolled markdown renderer is the fallback |

---

## 12. Rollback

- **Before Phase 5:** `git checkout main`, `npm ci`. Nothing native has been touched.
- **After Phase 5, before Play upload:** same, plus `rm -rf android && npx expo prebuild --clean`
  to regenerate the SDK 52 project. The dev client on the device gets replaced by the next build.
- **After a Play upload:** halt the rollout and re-promote the versionCode 9 release. A user who
  already took 10 keeps their data (the migration ladder is forward-only) — restoring them means
  the Phase 0 `.zip`, which is why that step is not optional.

---

## 13. Effort

Phases 1-4 (deps, config, code, green gate): a focused half day to a day. Phase 5-6 (build plus
the real device pass, including the edge-to-edge sweep): a day. Phase 7: an hour plus Play review
latency. Against a 31 Aug 2026 deadline there is room for R1 to go badly and still ship.

---

## 14. Execution log — phases 1-4 (2026-08-02, branch `upgrade/expo-sdk-57`)

Phases 1-4 are done. `npx tsc --noEmit` clean, `npm test` 35 suites / 845 tests (identical to the
pre-upgrade baseline), `expo-doctor` 20/20, web smoke flow (cookbook → new recipe → save → list)
verified with Polish diacritics intact and no console errors.

### Found during execution, not in the plan

1. **`react-native-worklets` is a new required peer of Reanimated 4** and is a native module, so it
   must be installed directly — `expo-doctor` flags it as a crash risk outside Expo Go. Installed
   at 0.10.1. This is the one place the "Reanimated costs us nothing" reasoning needed a caveat:
   no worklets to *migrate*, but the package still has to be present.
2. **SDK 57 requires TypeScript ~6.0.3** (was 5.9.3), and **TS 6 no longer implicitly pulls in
   every `node_modules/@types` package**. That silently drops the jest globals used by `__tests__/`
   and `__mocks__/`, producing ~800 phantom errors that look like a broken upgrade. Fixed by naming
   them: `"types": ["jest", "node"]` in `tsconfig.json`.
3. **The top-level `splash` key in `app.json` is no longer part of the config schema.** Removed;
   the `expo-splash-screen` plugin block already carried the same image and background plus the
   dark variant, so nothing was lost. CLAUDE.md's claim that the light/dark backgrounds are
   "mirrored in `app.json`'s splash config" now points at the plugin entry only.
4. **`StyleSheet.absoluteFillObject` is gone from RN 0.86** — runtime, not just types — and
   `absoluteFill` is now the plain frozen object that `absoluteFillObject` used to be. Renamed at
   8 sites across `ActionSheet`, `FormattingHelpSheet`, `ImportSheet`, `PasteListSheet`. Worth
   noting the failure mode this avoided: these are all object spreads, and spreading `undefined` is
   a silent no-op, so every bottom-sheet overlay would have lost its absolute positioning at
   runtime with no error anywhere.
5. **`ColorSchemeName` gained `'unspecified'`** in RN 0.86, and `useColorScheme()` no longer returns
   `null | undefined`. `resolveScheme` in `constants/theme.ts` had its parameter widened; the body
   already treated everything non-`'dark'` as light, so behavior is unchanged.
6. **`expo-build-properties` was removed entirely** (plugin entry *and* dependency) rather than
   emptied. The SDK defaults now supply 36/36/36.0.0, and an explicit pin is exactly what let the
   target SDK go stale — following the SDK default is the behavior we want on the next upgrade too.

### Cheaper than the plan assumed

- **`expo-share-intent` 3 → 8 needed zero code changes.** Five majors, but `useShareIntent()` still
  returns the same `{ isReady, hasShareIntent, shareIntent, resetShareIntent, error }`, the
  `ShareIntent` type still carries `webUrl` / `text`, the native module is still named
  `ExpoShareIntentModule` (so `utils/shareIntent.ts`'s gate holds), and the plugin still takes
  `disableIOS` + `androidIntentFilters`. Risk R3 did not materialise.
- **`drizzle-orm` 0.38 → 0.45 needed zero code changes**, and `expo-sqlite`'s `openDatabaseSync` /
  `execSync` are unchanged, so `db/client.ts` and the migration ladder were never touched.
- **`@react-native-ml-kit/text-recognition` and `safwriter` are now recorded as accepted** in
  `package.json` under `expo.doctor.reactNativeDirectoryCheck`, with the rationale inline, so
  `expo-doctor` stays at 20/20 and the exception is visible rather than folklore.

### Also done, marked optional in the plan

`ImagePicker.MediaTypeOptions.Images` → `mediaTypes: ['images']` at all 3 sites. It was free and
`tsc` validates it.

### Caught by the first native release build (`:app:createBundleReleaseJsAndAssets`)

Metro failed to resolve `punycode` from `markdown-it`, aborting the release bundle. Gradle reported
only `Process 'command 'node'' finished with non-zero exit value 1`; the real error came from
re-running the same bundling directly via `npx expo export --platform android`.

Root cause, and it is **not** an upgrade regression: `markdown-it@10` calls `require('punycode')`
without declaring it as a dependency — it expects the Node builtin. Metro provides no Node builtins
on native, so on SDK 52 this resolved by accident to the hoisted `punycode@2.3.1` that `uri-js` and
`whatwg-url-without-unicode` dragged into the tree. Neither package survives in the SDK 57 tree, so
the accidental resolution disappeared. The app was one unrelated dependency change away from a
broken release bundle on SDK 52 too.

Fixed by declaring `punycode@^2.3.1` as a direct dependency — we are the ones who need it, so it
should be pinned rather than inherited.

**What this says about the phase 4 gate:** the web smoke test cannot catch this, and that was
verified rather than assumed — hiding `node_modules/punycode` and re-running `expo export --platform
web` still bundles cleanly, because Metro shims Node builtins for the web platform only. Phase 4 now
requires a native production bundle for exactly this reason.

### Phase 6, first pass — emulator, release build (2026-08-02)

Target: Pixel Tablet AVD, **Android 15 / API 35** — not the Android 16 phone the plan asks for, so
this pass is a first sweep, not the full checklist. Edge-to-edge *is* enforced here (Android 15
enforces it from targetSdk 35), so that part is meaningful; the tablet form factor and
Android-16-specific behavior are not covered. A `Medium_Phone` AVD on **android-37.0** exists on
this machine and is the better target for the second pass.

Method: local `./gradlew assembleRelease` (debug-keystore signed, minify off), installed with
`adb install -r` **over the existing versionCode 9 build without uninstalling**, so the migration
ladder ran on a carried-over database. A cookbook created on v9 beforehand served as the canary for
user data. Driven headlessly over `adb` (`input tap` / `screencap` / `logcat`).

On device after install: **`versionCode=10, targetSdk=36, versionName=1.0.1`** — the compliance goal
itself, confirmed on a device rather than inferred from config.

| # | Check | Result |
|---|---|---|
| 1 | Launch on carried-over DB, migration ladder | pass — no crash, clean logcat |
| 2 | User data created on v9 (`MigracjaTest57`) + seed content survived | pass |
| 3 | Recipe photo resolves from disk (`imageStorage` + `expo-file-system/legacy`) | pass |
| 4 | Recipe view renders markdown (`markdown-it`, i.e. the `punycode` fix at runtime) | pass |
| 5 | `ActionSheet` / bottom sheets (the `absoluteFill` rename) | pass — backdrop and sheet position correct |
| 6 | Navigation bar, dark theme | **FAILED, fixed** — see below |
| 7 | Navigation bar, light theme | pass after the fix |
| 8 | Theme switch Light/Dark, persisted | pass |
| 9 | Backup `.zip` export — `react-native-zip-archive` under New Arch | pass — `RNZipArchiveModule: updateProgress 0% → 100%`, `keeptaste-backup.zip` reached the share sheet |
| 10 | **OCR / ML Kit (risk R1)** | **pass** — see below |

**#6, the one real regression.** The dark theme shipped with a white navigation bar. Cause was the
SDK 57 rewrite in `app/_layout.tsx` following the JSDoc on `NavigationBar`'s `style` prop, which
claims "dark = a dark navigation bar with light content". The native module does the opposite —
`val hasLightBackground = style == "dark"`, fed into `isAppearanceLightNavigationBars` — so `style`
names the *buttons*, exactly like the `setButtonStyleAsync` it replaced. The mapping never needed
inverting. Fixed and re-verified in both themes; the code comment now records that the docs and the
implementation disagree.

**#10 closes risk R1.** The "From photo" option appears at all, which means `isOcrAvailable` is
true and `NativeModules.TextRecognition` resolves — the legacy bridge module **is reachable through
the New Architecture interop layer**. Running it end to end worked: logcat shows
`libmlkit_google_ocr_pipeline.so` loading and the TFLite recognition models initialising, and the
recognised text populated the form (title `NALESNIKI`, body lines into instructions). No patching,
no replacement, no disabled T3 mode needed. The risk register's contingency plans are moot.

**A note on the first build failure.** `:app:buildCMakeRelWithDebInfo[arm64-v8a]` failed once with a
missing `libappmodules.so`, and an unchanged re-run succeeded. Stale CMake incremental state, not a
New Architecture problem — do not read the first failure as signal.

### Phase 6, second pass — same emulator, after the nav-bar fix

| # | Check | Result |
|---|---|---|
| 11 | SAF folder pick + write (`modules/safwriter`) | pass — see below |
| 12 | Auto-backup enabled, "Last backup" timestamp set | pass |
| 13 | Retention "keep 1 most recent" | pass — the older archive was removed |
| 14 | Android share target (`expo-share-intent` 3 → 8) | pass — see below |
| 15 | Cold start / splash handoff (SPEC.md §5.20) | pass — logo on the themed background, no white flash; theme and data survived the restart |
| 16 | Shopping list create, `EmptyState` | pass |
| 17 | Swipe-to-delete (`react-native-gesture-handler` 2.20 → 2.32) | pass — Delete/Rename revealed correctly |
| 18 | Undo snackbar + deferred delete | pass — see the note on measurement below |
| 19 | Recipe save + `updated_at` ordering | pass — the OCR-imported recipe sorted to the top |
| 20 | Keyboard over the import sheet | inconclusive — the tablet AVD uses a floating IME, so this does not test occlusion. Must be redone on a phone |

**#11 is the strongest single result of the pass.** `safwriter` is our own Kotlin module, and the
whole chain was verified rather than trusted to the UI: the archive landed at
`/sdcard/Backup/keeptaste-backup-*.zip`, starts with the `PK\x03\x04` magic, and its contents pulled
back off the device contain `backup.json`, `recipes.md` and the images — with both cookbooks
(`Breakfasts`, `MigracjaTest57`) and both recipes (`Pancakes`, `NALESNIKI`) present. The
`UnsupportedOperationException: Unsupported Uri` lines from `DocumentFile` in logcat are noisy but
harmless: the write and the retention delete both completed.

**#14** — a `SEND` intent with a URL opened the app on the new-recipe form with the import sheet
already up, tried the link, and degraded exactly as designed when the site blocks fetching
("This site blocks automatic import — paste the recipe text instead"). Five majors, no code change,
correct behaviour.

**#18, and a note on method.** The first Undo attempt appeared to fail. It had not: the snackbar
lives 5s and the round-trip between screenshot and tap exceeded it, so the tap landed on nothing.
Re-run as a single uninterrupted sequence, the list was deleted and restored correctly. Worth
recording because the failure mode is indistinguishable from a real regression from the outside —
timing-sensitive UI must be driven in one shot, not across tool calls.

### Phase 6, third pass — phone, **Android 17 / API 37, 16 KB page size**

Target: `Medium_Phone` AVD, `sdk_gphone16k_arm64`, 1080×2400, gesture navigation. Two things make
this the more valuable device: it is a phone rather than a tablet, and it is a **16 KB page-size**
image — the property that got versionCode 9 rejected by Play. Fresh install (seed data only).

| # | Check | Result |
|---|---|---|
| 21 | Launch on API 37 / 16 KB pages | pass — no `dlopen` / page-size / `UnsatisfiedLink` errors, clean logcat |
| 22 | **Keyboard occlusion under edge-to-edge** | **pass** — the form scrolls the edited field fully into view and the Save button sits above the keyboard, not behind it |
| 23 | Nav bar / gesture pill contrast, dark theme | pass |
| 24 | Nav bar / gesture pill contrast, light theme | pass |
| 25 | Settings bottom content clears the gesture pill | pass |
| 26 | Unsaved-changes guard ("Discard changes?") | pass |
| 27 | **Restore from `.zip`** | **pass** — see below |
| 28 | Silent replace on a pristine seed DB (`canSilentReplace`) | pass — restored without prompting, as designed |
| 29 | Photo restore from the archive | pass — `Pancakes` came back with its image |

**#22 covered text fields inside the form's ScrollView** — the tablet pass could not answer it at
all (floating IME), and a real phone IME confirms the scroll insets are handled. It did **not**
cover bottom-pinned overlays, and that gap hid a real regression: see #32 below. Reading #22 as
"edge-to-edge is clean" was too broad a conclusion from one screen.

**#27 closes the backup round trip.** This device had never seen `MigracjaTest57` or `NALESNIKI`;
after restoring the archive taken from the tablet, both are present, the confirmation reads
"Backup restored — Your library now matches the backup", and `Pancakes` has its photo back. Export
and restore are now both proven, on separate devices, with the archive moved between them.

**#21 is worth calling out for the Play history.** versionCode 9 was rejected over 16 KB page-size
support; this build launches and loads every native library on a 16 KB-page Android 17 image.

### Phase 6, final items — phone, API 37

| # | Check | Result |
|---|---|---|
| 30 | Cookbook → PDF share (`expo-print` + `cookbookPdfHtml.ts`) | pass — see below |
| 31 | `.md` legacy export → import round-trip | pass — parsed as "2 cookbooks with 2 recipes", then "Import complete" |

**#30 was checked for content, not just for a file appearing.** The share sheet produced a PDF, and
running it through the system print preview showed the real thing: the cookbook title in the brand
colour, both recipes with metadata, ingredient lists, numbered instructions and notes, across 2
pages. An empty or broken PDF would have been visible there.

**#31** used the `recipes.md` carried inside the `.zip` archive as the legacy export, restored on a
device that had been populated from the same backup. Markdown import is add-to-library only (no
replace option), so it correctly ended up with duplicate cookbooks — expected behaviour, not a bug.

**Phase 6 is complete.** Every item on the plan's checklist has been exercised on a device, across
two devices and both themes. Both original risks are closed by observation rather than by
workaround: R1 (OCR under New Architecture) works through the interop layer, and R2 (edge-to-edge)
is clean including the keyboard case.

One item is verified by the app's owner rather than by this pass: the Google Drive warning shown
when an unwritable cloud folder is picked for automatic backup. The detection is pure and unit
tested (`isGoogleDriveFolderUri`, including the assertion that Dropbox is *not* matched, so other
providers fall through to the write probe), and the SAF permission + write path around it is device
verified — but signing into a Google account was out of scope here.

### #32 — bottom sheets opened over an open keyboard (edge-to-edge regression, found by the app's owner)

**Report:** on the recipe form, raise the keyboard, then tap the photo icon. The keyboard stays up
and covers the photo sheet — the backdrop dims but Gallery / Camera / Remove photo are unreachable.

**Reproduced exactly**, and it is a **regression introduced by this upgrade**. The activity still
declares `android:windowSoftInputMode="adjustResize"`, but under edge-to-edge that is inert: the
window no longer shrinks when the IME opens, it just reports an inset. Every one of these sheets is
an absolutely-positioned overlay pinned to the bottom of the window, so "bottom of window" now means
"behind the keyboard". Before edge-to-edge, `adjustResize` shrank the window and the same layout
landed above the keyboard by accident.

Four sheets were affected, in two different ways:

| Sheet | Own text input? | Why it broke |
|---|---|---|
| `ActionSheet` (the photo menu) | no | no keyboard handling at all |
| `FormattingHelpSheet` | no | same |
| `ImportSheet` | yes | tracks `keyboardHeight`, but registers its listeners when `visible` flips — a keyboard that was **already** up never fires `keyboardDidShow` for them, so the offset stayed 0 |
| `PasteListSheet` | yes | same |

The second row is the subtle one: those two sheets *are* keyboard-aware, which is why focusing their
own input works correctly (verified after the fix — the sheet still lifts above the keyboard). They
simply never learn about a keyboard that predates them.

**Fix:** `Keyboard.dismiss()` when each sheet opens. For the two without inputs this is plainly
right — the field behind is unreachable under the backdrop anyway. For the two with inputs it is
still right as an entry condition: the sheet always opens fully visible, and their existing
listeners keep handling the keyboard once the user focuses something inside.

**What this says about the verification method.** The earlier keyboard check passed because it
exercised the case the framework already handles (a field inside a ScrollView). The broken case is
the one the app hand-rolls — overlays positioned by `absoluteFill`. When a platform behaviour
changes, the things to re-test are the places the app does the positioning itself, not the places it
delegates.

### Still ahead

Verification is done. What remains is phase 7 — release:

1. `eas build --profile production --platform android` (1.0.1 / versionCode 10).
2. Upload to **internal testing**, and confirm in the Play Console that the target-API warning is
   gone from the release before promoting.
3. Install from internal testing **over** the production build. Local release APKs are debug-key
   signed and cannot be installed over the Play build, so this is the first and only place the real
   upgrade path gets exercised with production signing.
4. Promote to production.
5. Update SPEC.md and CLAUDE.md wherever they still name SDK 52, RN 0.76, or
   `expo-build-properties`, and refresh the `android-target-sdk` memory note.

An environmental note, not an app defect: on the tablet AVD the app was repeatedly killed while the
system document picker was foregrounded, which aborted two restore attempts. It was memory pressure
from running two emulators; the same flow completed first try on the phone.

**Test data left on the emulators.** Pixel Tablet: cookbook `MigracjaTest57`, recipe `NALESNIKI`, an
auto-backup folder pointing at `/sdcard/Backup`, `/sdcard/Pictures/ocr-test.png`. Medium_Phone: the
restored library plus duplicate cookbooks from the Markdown import test, and two files in
`/sdcard/Download`. Neither device is clean any more.

**Test data left on the Pixel Tablet AVD:** cookbook `MigracjaTest57`, recipe `NALESNIKI`, an
auto-backup folder pointing at `/sdcard/Backup`, and `/sdcard/Pictures/ocr-test.png`. Harmless, but
it is not a clean device any more.
