# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KeepTaste — a local-only, offline recipe manager in React Native + Expo (SDK 52, Expo Router 4). No backend, no accounts, no cloud sync; data lives in on-device SQLite and the escape hatch is Markdown export. **SPEC.md is the living product spec — consult it before implementing features and update it on significant design decisions.** Docs are in English; UI strings live in i18n/dictionary.ts with EN+PL translations — never hardcode user-facing strings in components.

## Commands

```bash
npm install          # install deps
npx expo start       # dev server (scan QR in Expo Go)
npm run android      # Android emulator/device
npm run web          # web build — agent/E2E test environment ONLY, not a product platform
npx tsc --noEmit     # type check (strict mode)
npm test             # jest (ts-jest, logic-only tests in __tests__/)
```

The web build runs on an in-memory sql.js database (`db/client.web.ts`) that resets on reload; use it for browser-driven smoke tests of flows (form → save → list). Native behavior (file system, sharing, image picker) must still be verified in Expo Go. Web-only bugs outside test flows are out of scope (SPEC.md §2).

There is no lint script. Unit tests cover **pure logic only** (`db/` query helpers, `utils/`); UI/native-module behavior is verified by running the app (Expo Go, or the web build for browser-driven smoke tests), not by component tests.

## Subagent pipeline

Feature work uses four project agents in `.claude/agents/`, in order:
**planner** (read-only plan) → **tester** (failing logic tests, TDD red) → **coder** (implements until green) → **reviewer** (read-only gate: plan completeness, `npm test`, `npx tsc --noEmit`; verdict APPROVED / CHANGES REQUIRED).

## Architecture

**Data flow — deliberately no global state management.** Each screen loads data in `useFocusEffect`, mutates via `db/` functions, then reloads. Do not introduce Redux/Zustand/etc.

**Layers:**
- `app/` — Expo Router file-based screens. `index.tsx` (cookbook tiles + title search), `cookbook/[id].tsx` (recipe grid; the literal id `"all"` means all recipes), `recipe/[id].tsx` (view), `recipe/new.tsx` / `recipe/edit.tsx` (modals sharing `components/recipe/RecipeForm.tsx`). Root `_layout.tsx` runs DB migrations on startup.
- `db/` — the only data-access layer (Drizzle ORM over expo-sqlite). `schema.ts` (tables + TS types), `ddl.ts` (shared migration DDL), `client.ts` (native connection + migrations), `client.web.ts` (web test client: in-memory sql.js via drizzle sqlite-proxy), `cookbooks.ts` / `recipes.ts` (query helpers). Don't scatter raw SQL outside `db/`.
- `components/ui/` — base UI kit (SPEC.md §6): `Button`, `IconButton` (requires `accessibilityLabel`), `Input`, `ScreenHeader`/`ModalHeader`, `Fab`, `EmptyState`, `ActionSheet` (context menus — never `Alert.alert` for menus), `SwipeableRow` (gesture-handler swipe Edit/Delete), `SnackbarProvider` (snackbar + `useUndoDelete`). Reuse these instead of restyling per screen; native stack headers are disabled globally.
- `utils/` UI helpers — `pendingDelete.ts` (deferred-delete registry behind the Undo snackbar; unit-tested), `haptics.ts` (`lightTap`), `motion.ts` (`animateLayout`, reduce-motion aware — never call it in the same frame a snackbar mounts), `keepAwake.ts` (web-safe keep-awake for the recipe view).
- `utils/` export & share — pure builders (unit-tested): `markdown.ts` (per-recipe/cookbook-body `.md` helpers; format in SPEC.md §5.6), `backupMarkdown.ts` (full-app backup, `# §Uncategorized` sentinel), `importMarkdown.ts` (parsers, incl. multi-cookbook `parseBackupMarkdown`), `cookbookPdfHtml.ts` / `recipeShareText.ts` (localized share content). Native I/O lives in thin wrappers: `backupExport.ts` (write + share `.md`), `cookbookPdf.ts` (expo-print → share sheet).
- `i18n/` — bilingual UI strings: `dictionary.ts` (typed EN+PL `Record`) and `LanguageProvider.tsx` (the `useT`/`useLanguage` context, persistence via `db/settings.ts`). Pure resolver logic (preference parsing, locale resolution, interpolation, Polish plurals) lives in `utils/i18n.ts`. See SPEC.md §5.11.
- `constants/theme.ts` — design tokens (colors incl. `onPrimary`, typography incl. `size.reading` for recipe content, spacing, radii, shadows, `Motion` durations, `Touch` target sizes). Never hardcode style values when a token exists.

**Migrations are manual.** `runMigrations()` in `db/client.ts` executes hand-written `CREATE TABLE IF NOT EXISTS` DDL (defined in `db/ddl.ts`, shared with `db/client.web.ts`) synchronously at app start. Drizzle Kit auto-migrations are intentionally not used. Any schema change requires editing both `db/schema.ts` and the DDL in `db/ddl.ts` (and `ALTER TABLE` for existing tables).

**Path alias:** `@/*` maps to the repo root.

## Domain rules

- Deleting a cookbook sets `recipes.cookbook_id` to NULL (recipes survive, visible under "all").
- Deletes are deferred behind a 5s Undo snackbar (`utils/pendingDelete.ts` + `useUndoDelete`); recipes and cookbooks additionally get a confirmation Alert first, shopping lists/items don't. Don't add immediate `db` deletes in screens.
- Tags are removed from the MVP entirely (SPEC.md §7/§8) — strip leftover tag code when touched, don't add tag features.
- Dates are stored as ISO 8601 TEXT, not timestamps.
- The only required form field is the recipe title; numeric fields save an integer ≥ 1 or `null` — never `NaN` (SPEC.md §5.5).
- Title search must handle non-ASCII characters (e.g. Polish diacritics in recipe titles): filter via `toLowerCase()` in JS, not SQL `LIKE` (SPEC.md §5.1).
- `updated_at` changes only on edit-save; recipes sort descending by `updated_at` everywhere.
- Export vs share (SPEC.md §5.6/§5.13/§5.14): the `.md` backup (Settings) covers the whole app, stays English-only, and must round-trip through import; shares (cookbook → PDF, recipe → text via RN `Share.share`) are localized to the UI language and not importable. PDF share is unavailable in the "all" view.
- Missing metadata (times, servings) is hidden in the UI and omitted in export/share — no "—" placeholders.
- Out-of-scope features are listed in SPEC.md §7 (cloud sync, ingredient scaling, tags, etc.) — don't add them speculatively.
