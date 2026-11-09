# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KeepTaste — a local-only, offline recipe manager in React Native + Expo (SDK 57, RN 0.86, React 19, New Architecture, Expo Router). No backend, no accounts, no cloud sync; data lives in on-device SQLite and the escape hatch is Markdown export. **SPEC.md is the living product spec — consult it before implementing features and update it on significant design decisions.** Docs are in English; UI strings live in i18n/dictionary.ts with EN+PL translations — never hardcode user-facing strings in components.

## Commands

```bash
npm install          # install deps
npx expo start       # dev server (scan QR in Expo Go — non-backup work)
npm run android      # Android emulator/device
npm run web          # web build — agent/E2E test environment ONLY, not a product platform
npx tsc --noEmit     # type check (strict mode)
npm test             # jest (ts-jest, logic-only tests in __tests__/)
eas build --profile development   # custom dev client (required for backup flows)
```

The web build runs on an in-memory sql.js database (`db/client.web.ts`) that resets on reload; use it for browser-driven smoke tests of flows (form → save → list). Native behavior (file system, sharing, image picker) must still be verified on-device. Web-only bugs outside test flows are out of scope (SPEC.md §2).

**Backup work needs a custom dev client, not Expo Go.** The `.zip` backup uses `react-native-zip-archive` (native module, SPEC.md §5.17.1) which does not exist in the Expo Go runtime — any flow that touches export/restore/auto-backup must run on an EAS `development` build (`eas build --profile development`). Expo Go stays fine for all non-backup work. Bump `android.versionCode` in `app.json` on each upload.

**Cooking-timer background alarms need a dev or release build too.** `expo-notifications` is gated off in Expo Go and on web (`utils/timerAlarm.ts` — lazy require, Android only), where timers fall back to the in-app alert; verify the alarm with the screen locked on a real build.

**Android SDK versions are not pinned.** `expo-build-properties` was removed in the SDK 57 upgrade; `compileSdk`/`targetSdk` come from the SDK default (36 on SDK 57) via React Native's version catalog. Do not re-add a pin — an explicit one is what let the target go stale until Play threatened to block updates. See `docs/upgrade-sdk-57.md`.

There is no lint script. Unit tests cover **pure logic only** (`db/` query helpers, `utils/`); UI/native-module behavior is verified by running the app (Expo Go, or the web build for browser-driven smoke tests), not by component tests.

## Subagent pipeline

Feature work uses four project agents in `.claude/agents/`, in order:
**planner** (read-only plan) → **tester** (failing logic tests, TDD red) → **coder** (implements until green) → **reviewer** (read-only gate: plan completeness, `npm test`, `npx tsc --noEmit`; verdict APPROVED / CHANGES REQUIRED).

## Architecture

**Data flow — deliberately no global state management.** Each screen loads data in `useFocusEffect`, mutates via `db/` functions, then reloads. Do not introduce Redux/Zustand/etc.

**Layers:**
- `app/` — Expo Router file-based screens. `index.tsx` (cookbook tiles + title search), `cookbook/[id].tsx` (recipe grid; the literal id `"all"` means all recipes), `recipe/[id].tsx` (view), `recipe/new.tsx` / `recipe/edit.tsx` (modals sharing `components/recipe/RecipeForm.tsx`). Root `_layout.tsx` runs DB migrations on startup and owns the launch splash — a native layer released as soon as the theme resolves, plus a themed JS overlay carrying the logo until the first screen is loaded (SPEC.md §5.20). Its logo size and colors are pinned to `app.json`; changing either needs a native rebuild.
- `db/` — the only data-access layer (Drizzle ORM over expo-sqlite). `schema.ts` (tables + TS types), `ddl.ts` (shared migration DDL), `client.ts` (native connection + migrations), `client.web.ts` (web test client: in-memory sql.js via drizzle sqlite-proxy), `cookbooks.ts` / `recipes.ts` / `shoppingLists.ts` (query helpers), `settings.ts` (key-value prefs + flags), `backup.ts` (full-backup read/restore), `seed.ts` (first-launch sample content) and `userEdited.ts` (pristine-seed tracking, SPEC.md §5.20). Don't scatter raw SQL outside `db/`.
- `components/ui/` — base UI kit (SPEC.md §6): `Button`, `IconButton` (requires `accessibilityLabel`), `Input`, `ScreenHeader`/`ModalHeader`, `Fab`, `EmptyState`, `ActionSheet` (context menus — never `Alert.alert` for menus), `SwipeableRow` (gesture-handler swipe Edit/Delete), `SnackbarProvider` (snackbar + `useUndoDelete`). Reuse these instead of restyling per screen; native stack headers are disabled globally.
- `components/timers/` — cooking timers (SPEC.md §5.21): `TimerProvider` (root-level context — the timers outlive any screen; separate clock and bar-layout contexts, `active_timers` persistence, foreground alarm), `TimerBar` (root overlay above the tab bar / bottom inset, hidden on modal forms and with the keyboard up), `TimerChip` + `timerMarkdownRules` (the `text` rule — pass it to the Instructions `<Markdown>` only), `TimerNotifications` (background-alarm bridge in the root layout: OS notification sync, permission on first timer start, tap → recipe; renders null, mounts nothing native where the alarm is unavailable). The same sync keeps the live countdown (§5.21 stage 3): one ongoing `timer-live:<id>` notification per running/paused timer on channel `timers-live`, its Chronometer custom view built natively in `modules/exactalarm` (`TimerPresentationDelegate`, `res/layout/timer_live_*.xml`), which also cancels it when the `timer:<id>` alarm is presented. Floating UI must clear the bar: scrolling screens add `useTimerBarClearance()` to their bottom padding; the snackbar, backup banner and `Fab` already offset themselves. Recipe delete commits call `stopTimersForRecipe`.
- `utils/` cooking timers — pure, unit-tested: `durations.ts` (`parseDurations`, Hermes-safe regexes: no lookbehind, no `u` flag), `timers.ts` (reducer, ordering, (de)serialization, formatting, bar visibility), `timerMarkdown.ts` (step number + chip key from the markdown-display AST), `timerNotifications.ts` (background-alarm reconciler `planTimerNotifications`, live-countdown reconciler `planTimerLiveNotifications`, notification ids/content, permission step, in-app alert gate `shouldAlertOnExpire`; `stillRinging` in `timers.ts` stops the repeating in-app vibration). The native side is `timerAlarm.ts` — the only JS importer of `expo-notifications`, gated by `isTimerAlarmAvailable` — plus the local native module `modules/exactalarm` (exact-alarm access / "Alarms & reminders", optional native module, missing = allowed; and the ringing alarm: `TimerNotificationsService` subclasses expo-notifications' receiver at intent-filter priority 0 so `TimerPresentationDelegate` can post `timer:` notifications with `FLAG_INSISTENT` + a Stop action (`TimerAlarmStopReceiver`) — it depends on expo-notifications' prebuilt Maven artifact, not a Gradle project; needs a dev or release build; its `android/` sources must stay tracked — same `.gitignore` caveat as `modules/safwriter`). `db/settingKeys.ts` holds the dependency-free device-only keys (`active_timers`, `timer_alarm_notice`) and the backup export/restore key rules.
- `utils/` UI helpers — `pendingDelete.ts` (deferred-delete registry behind the Undo snackbar; unit-tested), `haptics.ts` (`lightTap`, repeating `timerDoneAlert` + `stopTimerAlert`), `motion.ts` (`animateLayout`, reduce-motion aware — never call it in the same frame a snackbar mounts), `keepAwake.ts` (web-safe keep-awake for the recipe view).
- `utils/` export & share — pure builders (unit-tested): `markdown.ts` (per-recipe/cookbook-body `.md` helpers; format in SPEC.md §5.6), `backupMarkdown.ts` (full-app backup, `# §Uncategorized` sentinel), `importMarkdown.ts` (parsers, incl. multi-cookbook `parseBackupMarkdown`), `cookbookPdfHtml.ts` / `cookbookPdfFileName.ts` / `recipeShareText.ts` / `shoppingListShareText.ts` (localized share content). Native I/O lives in thin wrappers: `cookbookPdf.ts` (expo-print → readable file name → share sheet).
- `utils/` backup archive (SPEC.md §5.17) — the backup of record is the `.zip`, not the `.md`: `backupArchive.ts` (pure `buildBackupJson`/`parseBackupJson`), `backupArchiveFs.ts` (native `exportBackupZip`/`loadBackupZip`/`commitBackupRestore` via `react-native-zip-archive`), `backupAuto.ts` (pure retention helpers), `backupTrigger.ts` (dirty flag + `flushAutoBackup`, fired on app-background only — never on a foreground timer), `backupStatus.ts` (pub/sub for the "saving" banner). `db/backup.ts` holds the read/restore side.
- `utils/` import (SPEC.md §5.15) — pure parsers: `recipeImport.ts` (JSON-LD, microdata, pasted text), `ocrText.ts`, `aiTranscribe.ts` (prompt builder + response cleanup — the app makes **no** AI network call), `sharedUrl.ts` (Android share target). Native/gated wrappers: `recipeImportFetch.ts`, `recipeOcr.ts`, `shareIntent.ts`.
- `i18n/` — bilingual UI strings: `dictionary.ts` (typed EN+PL `Record`) and `LanguageProvider.tsx` (the `useT`/`useLanguage` context, persistence via `db/settings.ts`). Pure resolver logic (preference parsing, locale resolution, interpolation, Polish plurals) lives in `utils/i18n.ts`. See SPEC.md §5.11.
- `constants/` — `theme.ts` design tokens (colors incl. `onPrimary`, typography incl. `size.reading` for recipe content, spacing, radii, shadows, `Motion` durations, `Touch` target sizes) and `ThemeProvider.tsx` (persisted Light/Dark/System preference). Never hardcode style values when a token exists. The light/dark backgrounds are mirrored in `app.json`'s splash config, and the primary color in the `expo-notifications` plugin `color` — change both together.
- `scripts/` — build/maintenance scripts, never bundled into the app. Mostly the Play Store marketing assets (demo library, screenshots, feature graphic, promo video), all reproducible from a clean checkout; shared code lives in `scripts/lib/` (`config.ts` project facts, `brand.ts` marketing look, `render.ts` headless-Chrome rendering, `cli.ts` args, `adb.sh`/`screen.sh` emulator driving). Start at **[docs/store-assets.md](docs/store-assets.md)**; per-script index in `scripts/README.md`. macOS-only (`sips`, `ffmpeg`, Chrome for Testing out of the Playwright cache) and deliberately adds no dependency to `package.json`.
- `persona-lab/` — persona-based usability testing on the Android emulator (simulated users who see only the screen; findings synthesized against the code). `engine/` is deliberately app-agnostic so it can be extracted to its own repo — app details go in `config/` only. See **[persona-lab/README.md](persona-lab/README.md)**; run with `/persona-test`.

**Migrations are manual, and versioned.** `runMigrations()` in `db/client.ts` executes hand-written `CREATE TABLE IF NOT EXISTS` DDL (defined in `db/ddl.ts`, shared with `db/client.web.ts`) synchronously **at import of `db/client.ts`** (never from a screen effect — child effects run before the root layout's, so a screen query would race the schema on a fresh install), then runs a `PRAGMA user_version` migration ladder for existing installs. Drizzle Kit auto-migrations are intentionally not used. Any schema change requires **three** edits: `db/schema.ts`, the DDL in `db/ddl.ts`, **and** a ladder step in `db/client.ts` with a `CURRENT_SCHEMA_VERSION` bump. Skipping the ladder breaks upgrades for existing users while a fresh install still looks fine — testing on a clean DB will not catch it.

**File system imports go through `expo-file-system/legacy`.** SDK 54 moved the old surface (`documentDirectory`, `readAsStringAsync`, `StorageAccessFramework`, …) behind `/legacy` and put a new `File`/`Directory` API at the bare specifier. This app still uses the legacy one — importing from `expo-file-system` gets you a different API. Porting is tracked separately; do not mix the two. If you add a file that imports it, check `jest.config.js` still maps the specifier, or the tests will load the real native module under node.

**Path alias:** `@/*` maps to the repo root.

## Domain rules

- Deleting a cookbook sets `recipes.cookbook_id` to NULL (recipes survive, visible under "all").
- Deletes are deferred behind a 5s Undo snackbar (`utils/pendingDelete.ts` + `useUndoDelete`); recipes and cookbooks additionally get a confirmation Alert first, shopping lists/items don't. Don't add immediate `db` deletes in screens.
- Tags are removed from the MVP entirely (SPEC.md §7/§8) — strip leftover tag code when touched, don't add tag features.
- Dates are stored as ISO 8601 TEXT, not timestamps.
- The only required form field is the recipe title; numeric fields save an integer ≥ 1 or `null` — never `NaN` (SPEC.md §5.5).
- Title + ingredient search (`utils/search.ts`: diacritic folding + stem matching) filters in JS, never SQL `LIKE` (SPEC.md §5.3).
- `updated_at` changes only on edit-save; recipes sort descending by `updated_at` everywhere.
- Export vs share (SPEC.md §5.6/§5.13/§5.14): the `.md` backup (Settings) covers the whole app, stays English-only, and must round-trip through import; shares (cookbook → PDF, recipe → text via RN `Share.share`) are localized to the UI language and not importable. PDF share is unavailable in the "all" view.
- Missing metadata (times, servings) is hidden in the UI and omitted in export/share — no "—" placeholders.
- Out-of-scope features are listed in SPEC.md §7 (cloud sync, ingredient scaling, tags, etc.) — don't add them speculatively.
