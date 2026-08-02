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

### Still ahead

Phases 5-7 — `expo prebuild --clean`, EAS development build, the 17-point on-device pass, then the
production build and the Play internal-testing track. Nothing verified here says anything about
New Architecture at runtime: the web build does not exercise it, so R1 (OCR) and R2 (edge-to-edge)
are both still entirely open.
