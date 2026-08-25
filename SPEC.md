# KeepTaste — Technical Specification (SDD)

> Living document. Update it with every significant design decision.
> Version: 1.8 | Date: 2026-06

---

## 1. Product goal

A private, local mobile app for storing and managing cooking recipes. Works fully offline — data is stored exclusively on the user's device. No accounts, no cloud sync, no ads. With export capability.

A second product area — simple shopping lists (§5.10) — shares the same philosophy and lives behind a bottom tab bar (§5.9): Recipes and Shopping are sibling areas of one local-first app.

Philosophy: **your data, your device**. Markdown export guarantees the user is never locked in by the app — their recipes are always readable outside of it.

---

## 2. Platform and stack

### Target platforms
- **Android** — primary version
- **iOS** — planned for a later phase, with no significant code changes thanks to React Native
- **Web** — *not a product platform.* The web build (`npm run web`) exists solely as a test environment for agent-driven E2E smoke tests (browser automation). It runs on an in-memory sql.js database (`db/client.web.ts`) that resets on every page reload; data persistence, photo picking, and Markdown export are not expected to work there. Web-only bugs outside the test flows are not on the roadmap.

### Tech stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | React Native 0.86 | One codebase for Android and iOS |
| Expo SDK | 57 | Faster setup, manages native modules without ejecting |
| Architecture | New Architecture (mandatory from SDK 55) | Bridgeless; legacy native modules run through the interop layer |
| Android target | compileSdk / targetSdk 36 | Taken from the SDK default — deliberately **not** pinned, see `docs/upgrade-sdk-57.md` |
| Navigation | Expo Router (`expo-router@57`, unified SDK versioning) | File-based navigation, typed routes, deep linking out of the box |
| Database | expo-sqlite | Local SQLite built into Expo, works offline |
| ORM | Drizzle ORM | Typed query builder, minimal abstraction, great DX |
| Photos | expo-image-picker | Gallery and camera access, permission handling |
| File export | expo-file-system + expo-sharing | Write .md backup to cache, system share sheet (§5.6) |
| PDF export | expo-print + expo-sharing | Render cookbook HTML → PDF, share (§5.14) |
| Recipe text share | React Native `Share` | Ready-to-send plain text for SMS/Messenger (§5.13) |
| File import | expo-document-picker + expo-file-system | Pick a .md backup file, read its contents for parsing (§5.8) |
| Markdown | react-native-markdown-display | Lightweight library, good support for a Markdown subset |
| Icons | @expo/vector-icons (Ionicons) | Bundled with Expo, zero configuration |
| Language | TypeScript (strict) | Type safety, better DX |

---

## 3. Project architecture

### Directory structure

```
app/
  _layout.tsx            ← root layout: DB initialization, Stack configuration
  (tabs)/
    _layout.tsx          ← bottom tab bar: Recipes + Shopping (§5.9)
    index.tsx            ← Recipes tab: cookbook grid + settings entry
    shopping.tsx         ← Shopping tab root (§5.10)
  settings.tsx           ← app info, no-backup notice, import, delete all data
  cookbook/
    [id].tsx             ← recipe list; id="all" → all recipes (+ title search)
    new.tsx              ← modal: new cookbook
    edit.tsx             ← modal: edit cookbook
  recipe/
    [id].tsx             ← recipe view (read-only with Markdown)
    new.tsx              ← modal: new recipe
    edit.tsx             ← modal: edit recipe
    add-to-list.tsx      ← modal: add ingredients to a shopping list (§5.12)
  shopping/
    [id].tsx             ← shopping list detail: items + "in cart" flow (§5.10); inline title rename
    new.tsx              ← modal: new shopping list

components/
  cookbook/
    CookbookForm.tsx     ← shared cookbook form (new + edit)
  recipe/
    RecipeForm.tsx       ← shared recipe form (new + edit)
    ImportSheet.tsx      ← single-recipe import: link / paste-text / photo / AI-transcribe mode picker (§5.15)
    IngredientChecklist.tsx ← ingredients as tap-to-check rows for cooking (§5.4)
  shopping/
    PasteListSheet.tsx   ← bulk-paste products into a shopping list (§5.16)
  ui/                    ← base components (§6): Button, IconButton, Input,
                           Card-level pieces, ScreenHeader, ModalHeader, Fab,
                           EmptyState, ActionSheet, SwipeableRow, SnackbarProvider,
                           FormattingHelpSheet (Markdown formatting help)

i18n/
  dictionary.ts          ← typed EN+PL dictionary of all UI strings (§5.11)
  LanguageProvider.tsx   ← language context (useT/useLanguage) + persistence

db/
  schema.ts              ← Drizzle table definitions + TypeScript types
  ddl.ts                 ← migration DDL shared by native and web clients
  client.ts              ← native SQLite connection, runs migrations
  client.web.ts          ← in-memory sql.js client (web test build only)
  cookbooks.ts           ← queries: cookbook CRUD
  recipes.ts             ← queries: recipe CRUD, search, delete-all-data
  import.ts              ← writes a parsed Markdown import (cookbook + recipes)
  shoppingLists.ts       ← queries: shopping list/item CRUD, check/uncheck (§5.10)
  settings.ts            ← key-value app settings (language, seed + backup flags, §5.11/§5.17.3/§5.20)
  backup.ts              ← full-backup read/restore: getFullBackupData, isDatabaseEmpty, restoreFullBackup (§5.17.1)
  seed.ts                ← one-shot sample-content seed on an empty library (§5.20)
  userEdited.ts          ← marks the library as user-touched on the first real mutation (§5.20)

utils/
  markdown.ts            ← pure per-recipe / per-cookbook-body .md builders + formatTime (§5.6)
  backupMarkdown.ts      ← pure full-app backup builder + §Uncategorized sentinel (§5.6)
  importMarkdown.ts      ← parser for backup / legacy .md files (parseBackupMarkdown, §5.8)
  backupArchive.ts       ← pure: buildBackupJson / parseBackupJson for the .zip archive (§5.17.1)
  backupArchiveFs.ts     ← native: exportBackupZip / loadBackupZip / commitBackupRestore (§5.17.1)
  backupAuto.ts          ← pure: auto-backup retention helpers (parseKeepCount, backupsToPrune) (§5.17.3)
  backupTrigger.ts       ← change-driven dirty flag + flushAutoBackup on app-background (§5.17.3)
  backupStatus.ts        ← module-level pub/sub for the "backup running" banner (useBackupRunning)
  recipeShareText.ts     ← pure localized recipe → plain-text builder (§5.13)
  cookbookPdfHtml.ts     ← pure localized cookbook → HTML builder (§5.14)
  cookbookPdf.ts         ← native: HTML → PDF via expo-print, share (§5.14)
  imageStorage.ts        ← persisting picked images into documentDirectory + cleanup
  imageDownscale.ts      ← caps newly picked photos (1280px / JPEG 0.7) to bound storage + backup size
  seedData.ts            ← pure: localized sample cookbook + showcase recipe builder (§5.20)
  toTry.ts               ← pure: to-try / cooked partition helper for recipe lists (§5.19)
  shoppingListShareText.ts ← pure localized shopping list → plain-text builder (§5.18)
  cookbookForm.ts        ← cookbook form logic (normalize, dirty-check)
  recipeForm.ts          ← recipe form logic (mapping, dirty-check)
  numeric.ts             ← numeric field parsing (integer ≥ 1 or null)
  search.ts              ← diacritics-safe title search
  shoppingList.ts        ← shopping list logic: partition, counts, input normalization
  ingredients.ts         ← pure parsers: ingredients Markdown → rendered lines (§5.4) / shopping item candidates (§5.12)
  recipeImport.ts        ← pure parsers: Recipe JSON-LD + pasted-text → RecipeFormData (§5.15)
  recipeImportFetch.ts   ← native: fetch a recipe URL's HTML for parsing (§5.15)
  recipeOcr.ts           ← native: on-device ML Kit text recognition wrapper (§5.15)
  ocrText.ts             ← pure: OCR blocks → plain text for parsePastedRecipe (§5.15)
  aiTranscribe.ts        ← pure: AI-handoff prompt builder + response cleanup for parsePastedRecipe (§5.15)
  sharedUrl.ts           ← pure: Android share text → URL / import intent (§5.15 share target)
  shareIntent.ts         ← native gate: isShareIntentAvailable (expo-share-intent module present) (§5.15)
  i18n.ts                ← pure i18n logic: preference/locale resolution, interpolation, PL plurals
  appReady.ts            ← one-shot "first screen loaded" signal for the splash gate (§5.20)
  pendingDelete.ts       ← deferred-delete registry behind the Undo snackbar (§6)
  motion.ts              ← animateLayout + prefersReducedMotion (reduce-motion aware)
  haptics.ts             ← lightTap wrapper
  keepAwake.ts           ← keeps the screen on in the recipe view; web-safe (§5.4)

constants/
  theme.ts               ← design tokens: light/dark palettes + useTheme(), typography, spacing, shadows
  ThemeProvider.tsx      ← theme context: persisted Light/Dark/System preference + ready flag (§6)
```

### Data flow

The app does not use global state management (Redux, Zustand, etc.). Each screen:
1. Fetches data from the database on focus (`useFocusEffect`)
2. Mutates data directly through functions from `db/`
3. Reloads data after a mutation

This is a deliberate decision — at this app's scale, an extra state management layer would be over-engineering.

---

## 4. Database schema

### Tables

```sql
cookbooks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  cover_image_path TEXT,                        -- local URI path
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
)

recipes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cookbook_id     INTEGER REFERENCES cookbooks(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  prep_time       INTEGER,                      -- in minutes, nullable
  cook_time       INTEGER,                      -- in minutes, nullable
  servings        INTEGER,                      -- nullable
  image_path      TEXT,                         -- local URI path, nullable
  ingredients     TEXT NOT NULL DEFAULT '',     -- raw Markdown text
  instructions    TEXT NOT NULL DEFAULT '',     -- raw Markdown text
  notes           TEXT DEFAULT '',              -- notes; '' and NULL mean the same: no note
  to_try          INTEGER NOT NULL DEFAULT 0,   -- 1 = saved to try, not cooked yet (§5.19)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)

app_settings (                                   -- key-value preferences (§5.11)
  key             TEXT PRIMARY KEY NOT NULL,      -- e.g. 'language', 'demo_seeded', 'user_edited' (§5.20), backup_* (§5.17.3)
  value           TEXT NOT NULL                   -- e.g. 'system' | 'en' | 'pl'
)
```

> The `shopping_lists` / `shopping_items` tables are defined alongside the feature in §5.10.

> Tags have been removed from the MVP (see §7 and §8). The `tags` and `recipe_tags` tables do not exist in the schema; leftovers in the existing code must be removed (DDL, schema.ts, form, view, export).

### Indexes

```sql
CREATE INDEX idx_recipes_cookbook_id ON recipes(cookbook_id);
```

### Key behaviors

- **Deleting a cookbook** → `cookbook_id` on its recipes is set to `NULL` (ON DELETE SET NULL). Recipes do not disappear; they go to the "no cookbook" pool visible in the "All recipes" view.
- **`updated_at`** — updated **only when saving a recipe edit**. Merely opening or viewing a recipe does not change `updated_at` (and therefore the sort order). **One deliberate exception:** the "Tried it" action in the recipe view (§5.19) clears `to_try` **and bumps `updated_at`**, so a freshly tried recipe surfaces at the top of its cookbook.
- **`notes` field** — empty string and `NULL` are treated identically (no note) in all views and in export.
- **Dates** — stored as ISO 8601 strings (TEXT), not UNIX timestamps. More readable when debugging and exporting.

### Migrations

Migrations are hand-written as `CREATE TABLE IF NOT EXISTS` in `db/ddl.ts` (shared by the native client `db/client.ts` and the web test client `db/client.web.ts`) and run synchronously **when `db/client.ts` is imported** — not from a screen effect, because React fires child effects before the parent's and a screen's first query would otherwise outrun the schema on a fresh install (that race silently skipped the §5.20 first-launch seed). `_layout.tsx` still calls `runMigrations()`, now only as an idempotent retry. We do not use automatic Drizzle Kit migrations on a mobile device — too risky during app updates. For breaking changes, a migration will be added as an `ALTER TABLE` or a data migration.

---

## 5. Features

### 5.1 Home screen — "Recipes"

**Behavior:**
- Displays a **grid of cookbook tiles, 2 per row**, each tile = one cookbook
- Tiles have rotating background colors from the palette (`cookbookColors` in theme)
- If a cookbook has a cover (`cover_image_path`), the photo covers the background color with a slight dark overlay for title readability
- Header (left): "KeepTaste" eyebrow + "Cookbooks" title; header (right): a **settings gear** (→ §5.7) and a **"+" button → new cookbook modal** (§5.2)
- A fixed "All recipes" row above the grid — the **only entry point** to the `/cookbook/all` view
- Long-press on a tile (with a light haptic) → bottom **ActionSheet**: **Edit / Delete / Cancel**
  - **Edit** → opens the cookbook modal (§5.2) pre-filled with the current name and cover
  - **Delete** → confirmation Alert with the message: *"Recipes from this cookbook won't be deleted — you'll find them in 'All recipes'."*; on confirm the cookbook disappears behind a 5s **Undo** snackbar before the delete commits (§6)

**Edge cases:**
- No cookbooks → empty state with an icon and a message encouraging the user to create their first one
- Deleting a cookbook does not delete its recipes (see: DB schema)

**Refreshing:** `useFocusEffect` — data is loaded every time the user returns to the screen (e.g. after adding a cookbook).

**Search** lives in the "All recipes" view (see §5.3) — there is no search field on the home screen.

---

### 5.2 Creating and editing a cookbook

**Cookbook form (modal) — shared between create and edit:**
- Field: cookbook name (required) — at the very top of the form
- Optional: cover (image picker — gallery or camera). Entry point is a small icon-only camera button on the same row as the name field (right side); once a cover is picked, the button shows the cover as a thumbnail (tap to change/remove)

**Entry points:**
- Create: "+" button in the home-screen header → empty form
- Edit: long-press on a cookbook tile → "Edit" → form pre-filled with the current name and cover

**On save:**
- Name is trimmed before saving; empty name → inline error under the field, the form is not saved
- Cover is stored as a local URI (path to a file on the device)
- Edit: saving overwrites the name and cover; removing the cover sets `cover_image_path` to NULL
- Editing the name/cover **does not affect** the recipes in the cookbook

**Abandoning the form:** if the form has unsaved changes, closing the modal (gesture / back / cancel button) → Alert *"Discard changes?"* with options Discard (destructive) / Keep editing.

---

### 5.3 Recipe list in a cookbook

**Behavior:**
- **Vertical list of recipe cards** (one per row): photo thumbnail on the left (or placeholder), title, total time (prep + cook), number of servings. **Missing metadata (time, servings) is hidden** — we don't show "—" or empty labels
- URL `/cookbook/[id]` — recipes assigned to a specific cookbook
- URL `/cookbook/all` — all recipes from all cookbooks and unassigned ones
- Recipes sorted descending by `updated_at` (most recently modified on top)
- **To-try partition (§5.19):** recipes marked "to try" sink to a **"To try" section** at the bottom of the list, under an uppercase section header; within both parts the `updated_at` ordering is unchanged. The header renders only when the section is non-empty. Applies to both specific-cookbook and "All recipes" views
- "+" button in the header → new recipe (with pre-filled `cookbook_id` when inside a specific cookbook)
- **Share (PDF) icon in the header** → generates and shares the cookbook as a PDF (§5.14). Available only in a specific cookbook's view, not in "All recipes"

**Search (only in the `/cookbook/all` view):**
- Text field above the list, filtering by recipe title across **all** cookbooks
- Case-insensitive comparison, **correct for non-ASCII characters (e.g. Polish diacritics)** — filtering happens on the JS side via `title.toLowerCase().includes(query.toLowerCase())`, not via SQL `LIKE` (which is case-insensitive only for ASCII — searching "żurek" would not find "Żurek")
- Search runs on every text change (no "search" button); tapping a result opens the recipe view
- **"To try" filter chip (§5.19)** below the search field: shown only when at least one to-try recipe exists, labeled with a live count ("To try (7)"). Active chip restricts the list to to-try recipes across all cookbooks; combines with the text query (AND). Session-only state — leaving the screen resets it
- No results → grayed-out text *"No results"* (color `textMuted`)
- The field is **not shown** in a specific cookbook's view — search is global by design

**Edge cases:**
- Empty cookbook → empty state with an icon and a "tap + to add" message

---

### 5.4 Recipe view

**Sections:**
- Photo (full width, 240px tall) or a gray placeholder
- Title — with a small **"To try" badge** next to it when `to_try` is set, plus a **"Tried it ✓"** action that clears the flag, bumps `updated_at` (§4 exception) and confirms with a snackbar (§5.19)
- Metadata: prep time, cook time, total time, servings — **items without a value are hidden** (no "—"); if all are missing, the whole metadata row disappears
- **Ingredients** and **Instructions** as two stacked sections of a single scrollable view (no tabs, no switching) — each with an uppercase section header; an empty section is hidden entirely (consistent with the no-placeholder rule)
- Section content rendered by `react-native-markdown-display`; ingredients are the one exception — they render as a **check-off list** (below), one `Markdown` per line so inline `**bold**` still works
- Notes (if present) — highlighted box with a left border in the primary color

**Ingredient check-off (cooking aid):**
- Every ingredient line is a **checkbox row** — tapping it strikes the ingredient through and mutes it, tapping again brings it back. This is the "what have I already put in" tracker for cooking, not a shopping list
- Lines come from `parseIngredientLines` (`utils/ingredients.ts`) — the same normalization as the shopping-list parser (§5.12), so `#` grouping labels stay plain headings (not checkable) and item indices line up 1:1 with `parseIngredients`
- **Ephemeral by design**, exactly like the text zoom below: the checked set lives in the recipe screen's state — no `app_settings` key, no column, nothing in the backup. Leaving the recipe clears it, and so does an ingredients edit (the indices would point at reordered lines)
- A **"Clear"** text button appears next to the INGREDIENTS header while at least one ingredient is checked
- The checkbox scales with the text zoom; ingredients that parse into no items at all (e.g. only headings) fall back to plain Markdown rendering

**Markdown in ingredients and instructions:**

| Syntax | Effect |
|---|---|
| `# Section heading` | Prominent grouping heading |
| `**text**` | Bold |
| `- item` or dash | Bullet list item |
| Double line break | Section separator / new paragraph |

**Navigation:**
- Back button (arrow-back)
- **Text zoom (A− / A+)** — two header buttons (left of Share) scale the recipe **content** read while cooking: ingredients, instructions, step numbers, in-content `#` headings and the Notes box. Title and metadata are unaffected. The scale runs 1×–1.8× in 0.2 steps; each button disables at its bound. The zoom is **ephemeral by design** — it lives in component state (no persistence, no `app_settings` key), so leaving the recipe resets it to 1× on the next open. Ionicons has no clean "A+/A−" glyph, so these are text buttons, not `IconButton`. This is a polish of the existing reading view, **not** the step-by-step cooking mode that stays out of scope (§7).
- Share button (share-outline) → shares the recipe as plain text (§5.13)
- "⋯" menu (ActionSheet, same pattern as the cookbook and shopping-list headers):
  - **Edit** → opens `/recipe/edit?id=X`
  - **Delete** → confirmation Alert ("Delete \"{title}\"?"); on confirm goes back and the delete commits after a 5s **Undo** snackbar (§6)

**Add to shopping list:** a button below the Ingredients section ("Add to shopping list", cart icon) opens the ingredient-picker modal (§5.12). Shown only when the parsed ingredients yield at least one item (§5.12 parsing rules) — consistent with the no-placeholder rule.

---

### 5.5 Recipe form (create and edit)

One shared `RecipeForm.tsx` component used by `/recipe/new` and `/recipe/edit`.

**Form fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Title | TextInput | YES | Trimmed before saving |
| Prep | TextInput numeric | NO | Minutes as a positive integer |
| Cook | TextInput numeric | NO | Minutes as a positive integer |
| Servings | TextInput numeric | NO | Positive integer |
| Photo | ImagePicker | NO | Gallery or camera, 4:3 aspect |
| To try | Switch | NO | Marks the recipe as saved-to-try (§5.19); default off, edit preserves the stored value |
| Ingredients | TextInput multiline | NO | Raw text, supports Markdown; carries a "See formatting tips" link |
| Instructions | TextInput multiline | NO | Raw text, supports Markdown; carries a "See formatting tips" link |
| Notes | TextInput multiline | NO | Exported together with the recipe (it's a cookbook, not a diary) |

**Formatting help:** the average user doesn't know "Markdown". Under the Ingredients and Instructions fields a tappable text link ("See formatting tips", `recipeForm.formatHelpLink`, primary-colored) opens a bottom sheet (`components/ui/FormattingHelpSheet.tsx`, same overlay pattern as `ActionSheet`). The sheet is a plain-language "you type → you see" table (`# heading`, `**bold**`, `- bullet`) plus a note that a blank line starts a new section — never the word "Markdown" in the field UI.

**Validation:**
- The only required field: title. Missing title → inline error under the field, the form is not saved.
- Numeric fields — **unambiguous parsing rule:** the value is parsed to an integer (`parseInt`); it is saved only if the result is an integer ≥ 1. Everything else (empty field, text, zero, negative values, `NaN`) → we save `null`. Implementation note: the pattern `value ? Number(value) : null` is **wrong** — for text it saves `NaN` to the database.

**Photo:**
- The title field sits at the very top of the form with a small icon-only camera button on the same row (right side) as the photo entry point. Once a photo is picked, the button shows it as a thumbnail; tapping it opens an ActionSheet with options: Gallery / Camera / Remove photo (if one exists)
- Photo processed by ImagePicker with `allowsEditing: true`, aspect ratio 4:3, quality 0.8
- **Downscaled on pick** (`utils/imageDownscale.ts`, via `expo-image-manipulator`): every newly picked/captured photo is capped to **1280px on its longer edge** and re-encoded as **JPEG quality 0.7** before being stored. A recipe card/header never needs full sensor resolution, and full-res originals (3–5 MB each) are what bloat the `.zip` backup and push the single-base64-string export toward OOM (§5.17, `docs/backup-freeze-rootcause.md`). Best-effort: a failed shrink falls back to the original so a photo is never lost. Applies to **new** photos only — existing stored photos are left as-is. The shrink is lossy by design.
- The photo file is **copied to `FileSystem.documentDirectory`** when the recipe is saved (the picker URI points to the system cache, which may be cleared — see §8, high priority); the same applies to cookbook covers
- Deleting a recipe/cookbook or replacing a photo → delete the copied file from `documentDirectory` (cleanup so the directory doesn't grow indefinitely)

**Abandoning the form:** if the form has unsaved changes, closing the modal (gesture / back / cancel) → Alert *"Discard changes?"* with options Discard (destructive) / Keep editing.

**New vs edit:**
- `new.tsx` — starts with an empty form, optionally accepts `cookbookId` as a URL param
- `edit.tsx` — loads the recipe data from the database, fills the form, calls `updateRecipe` instead of `createRecipe` on save

---

### 5.6 Full-app backup to Markdown

**Trigger:** an "Export all data" button in the Settings screen (§5.7), in the "Your data" section → the whole library is written to a single `.md` file and shared via the system share sheet (`Sharing.shareAsync()`, `text/markdown`). This replaces the former per-cookbook Markdown export; cookbook headers now share a **PDF** instead (§5.14).

> **Scope note:** the `.md` backup is the human-readable escape hatch (§1), but **not a complete copy** — it omits photos, shopping lists, timestamps, and the language preference. The complete, restore-fidelity backup (and online-backup options) is the `.zip` archive in **§5.17**, which embeds this same `.md` as its readable layer.

**Format of the resulting backup `.md` file:** one file holds every cookbook as a `# Name` section in the per-cookbook body format below, in cookbook order, followed by an optional **uncategorized bucket** for recipes whose `cookbook_id` is `NULL`, under the reserved sentinel heading `# §Uncategorized`. The uncategorized section is omitted entirely when there are no loose recipes. The format is **English-only** (never localized). An empty library yields an empty file.

```markdown
# Cookbook Name

*Exported: 01/06/2026*
*Recipes: 12*

---

## Recipe Title

**Prep:** 15 min | **Cook:** 45 min | **Servings:** 4

### Ingredients

(content of the ingredients field — raw text, may contain Markdown)

### Instructions

(content of the instructions field — raw text, may contain Markdown)

### Notes

(content of the notes field — if present)

---

## Next Recipe
...

# §Uncategorized

*Exported: 01/06/2026*
*Recipes: 2*

---

## Loose Recipe
...
```

**Implementation details:**
- Pure builders live in `utils/markdown.ts` (`recipeToMarkdown`, `cookbookBodyToMarkdown`, `formatTime`) and `utils/backupMarkdown.ts` (`buildBackupMarkdown`, `UNCATEGORIZED_HEADING`, `BackupSection`); the `recipes.md` produced by these is embedded as the readable layer of the `.zip` archive (§5.17), built and shared by `utils/backupArchiveFs.ts` (`exportBackupZip`), fed by `db/recipes.ts` `getBackupSections()`.
- Within each section, recipes are sorted the same as in the list (descending by `updated_at`)
- The metadata line (`**Prep:** ... | ...`): segments without a value are **omitted**; if a recipe has no metadata at all, the whole line is omitted
- A to-try recipe (§5.19) carries the line `**Status:** to try` directly below the metadata line (or in its place when there is no metadata); tried recipes carry no Status line (consistent with the omit-when-absent rule). English-only, like the rest of the format
- The "Notes" section appears in the file only if the `notes` field is not empty
- Export date in `DD/MM/YYYY` format
- The file is written to `FileSystem.cacheDirectory` as `keeptaste-backup.md`, then shared via `Sharing.shareAsync()`
- The user decides what to do with the file (save to Drive, email it, AirDrop, etc.) — the app does not manage this process

**Backward compatibility:** a legacy single-cookbook export (one `# Name` section, no `# §Uncategorized`) is just a one-section backup and remains importable (§5.8).

**Time format (in the app and in export):**
- < 60 min → `"45 min"`
- ≥ 60 min → `"1 hr 30 min"` or `"2 hr"` (no minutes if = 0)
- No value → item hidden / omitted (see §5.3, §5.4 and above)

### 5.7 Settings

**Entry point:** a gear icon (`settings-outline`) in the home screen header, next to the "+" button. Tapping it pushes the `/settings` screen (a regular card, with its own in-screen back header — not a modal).

**Content:**
- **App info** — the app name ("KeepTaste") and version, read from `Constants.expoConfig?.version` (fallback `1.0.0`).
- **Data / no-backup notice** — explains that recipes are stored only on this device, that there are no accounts and no cloud sync, that uninstalling the app deletes all recipes, and that exporting all data to a Markdown file (§5.6) is the only backup mechanism.
- **Export all data** — a button (in the "Your data" section) that backs up the whole library (§5.6/§5.17). On Android it opens a two-option ActionSheet — **Share / send** (share sheet) or **Save to a folder** (SAF, §5.17.2) — elsewhere it goes straight to the share sheet. On failure surfaces `Alert('Export failed', …)`.
- **Import from Markdown** — restores cookbooks and recipes from a backup file (§5.8).
- **Delete all data** — a destructive button that wipes every cookbook, recipe and shopping list.

**Delete all data flow:**
- Double confirmation: first an `Alert` ("Delete all data?") explaining what will be removed, then on confirm a second `Alert` warning the action cannot be undone. Both use destructive button styles.
- On final confirm: `deleteAllData()` (in `db/recipes.ts`) deletes all recipes, then all cookbooks, then all shopping items and lists (in that order) and returns the stored image paths; the screen then deletes those image files via `deleteStoredImage` and navigates back home (which reloads via `useFocusEffect`).

### 5.8 Import from Markdown

**Entry point:** an "Import from Markdown" button in the Settings screen, in the "Your data" section (above the Danger zone).

**Accepted format:** KeepTaste's own full-app backup (§5.6) **and** legacy single-cookbook exports. The parser (`utils/importMarkdown.ts`, pure, no native imports) is the inverse of the export builder. `parseBackupMarkdown(content)` returns `{ ok: true, sections: { cookbookName: string | null; recipes: ImportedRecipe[] }[] }` or `{ ok: false, error }`:
- A backup is a sequence of `# Name` sections. A `# ` heading begins a new section **only when not inside an open `## ` recipe block** — recipe bodies may themselves contain `# ` Markdown headings, so a heading is treated as a section boundary only before the first `##` of a section or after a `---` closed the previous recipe.
- The `# §Uncategorized` sentinel heading maps to a section with `cookbookName: null`; a cookbook literally named `Uncategorized` (no `§`) stays a normal section. A legacy single-cookbook export parses as one section.
- `*Exported:*` / `*Recipes:*` lines are informational and never trusted (the recipe count is derived from the actual `## ` blocks, not the header).
- Each `## ` block is a recipe, running until the next `## `, a `---` line, or EOF. Trailing `---` / whitespace produce no phantom recipes.
- The meta line `**Prep:** … | **Cook:** … | **Servings:** …` is parsed token-by-token; each token is independent and absent tokens stay `null`. Prep/Cook strings are inverted via `parseTimeToMinutes` (the lockstep inverse of export's `formatTime` — "45 min", "1 hr 30 min", "2 hr"; the time-string mapping must stay in sync if `formatTime` ever changes). Servings is a plain integer.
- An optional `**Status:** to try` line (§5.19) sets `toTry: true` on the recipe; absence — or any unrecognized status value — means `false`.
- `### Ingredients` / `### Instructions` bodies default to `''` when the section is absent. `### Notes` is `null` when absent, the body when present, and `''` when the header is present but the body empty.
- Internal body Markdown is preserved exactly; only `# `, `## `, and `### Ingredients|Instructions|Notes` are structural. Hand-edited files are best-effort — unescaped bodies that contain those structural markers may mis-split (documented limitation).

**Persistence:** `db/import.ts` `importBackup(sections)` walks the sections: each named section creates a cookbook (`createCookbook`) and its recipes (`createRecipe`); the `null`-name section creates recipes with `cookbookId: null` (they appear under "All recipes"). It returns `{ cookbooks, recipes }` counts. No transaction (consistent with the rest of `db/`); a failure mid-import may leave a partial result. (`importCookbook()` is retained for the legacy single-cookbook persistence path / tests.)

**Flow:** pick a file via `DocumentPicker.getDocumentAsync` (canceled → no-op) → read with `FileSystem.readAsStringAsync` → `parseBackupMarkdown`. Parse failure surfaces via `Alert('Import failed', error)`. On success, a confirm `Alert` (`Import {C} cookbooks with {R} recipes?`, Polish plurals on the recipe count) gates the write; on confirm `importBackup` runs in try/catch, then a success `Alert` with both counts and `router.back()` (home reloads via `useFocusEffect`). A thrown error surfaces an Alert noting the import may be partial.

**Semantics:** duplicates are allowed — importing the same file twice creates a second copy of every cookbook. A zero-recipe section imports an empty cookbook.

---

### 5.9 Bottom tab navigation

A persistent bottom tab bar with two tabs, introducing the second product area (Shopping, §5.10):

| Tab | Icon (Ionicons) | Destination |
|---|---|---|
| **Recipes** | `book-outline` / `book` (active) | The existing cookbook home (§5.1) and everything reachable from it |
| **Shopping** | `cart-outline` / `cart` (active) | Shopping lists (§5.10) |

**Mechanism:** Expo Router tab layout — the `app/` tree is restructured into a `(tabs)` group:

```
app/
  _layout.tsx            ← root Stack (modals, recipe/cookbook screens) + DB init
  (tabs)/
    _layout.tsx          ← Tabs navigator (bottom bar)
    index.tsx            ← Recipes tab: cookbook home (moved from app/index.tsx)
    shopping.tsx         ← Shopping tab: list of shopping lists
```

**Rules:**
- The tab bar is visible on the two tab roots; modal forms (recipe/cookbook/list forms) and detail screens open **over** it via the root Stack, consistent with the current modal pattern.
- Tab bar colors come from the theme palettes (`surface` background, `primary` active tint, `textMuted` inactive tint, `border` top hairline) via `useTheme()` — works in both light and dark mode.
- The settings gear stays in the Recipes tab header (§5.1) — Shopping has its own header. The Shopping "+" action arrives with §5.10; until then the Shopping tab shows only a header and an empty state.

---

### 5.10 Shopping lists

A second product area: simple, offline shopping lists. Same philosophy as recipes — local-only, no accounts, no magic.

**Shopping tab root — list of shopping lists:**
- Vertical list of cards styled like the recipe list (§5.3) but **without photos**: list name + item progress (e.g. "3/8 in cart"; counts hidden when the list is empty)
- Lists sorted descending by `updated_at`
- "+" button in the header → "New shopping list" form
- Tap a card → opens the list detail view
- Long-press a card (light haptic) → bottom **ActionSheet**: **Rename / Delete / Cancel**; swipe-left on a card reveals the same two actions. Rename opens the list detail with the inline title editor active (`?rename=1`); renaming refreshes the list's `updated_at`. Delete removes the list immediately behind a 5s **Undo** snackbar — no confirmation dialog (deleting a list deletes its items — unlike cookbooks there is no orphan pool)
- Empty state: icon + a message encouraging creating the first list

**"New shopping list" form (modal):**
- Title: "New shopping list"
- Input: "List name" (required; trimmed; empty → inline error under the field, not saved)
- Button: "Create list"
- An "✕" close button in the corner dismisses the form (dirty-check Alert like other forms, §5.2/§5.5)
- On create → navigates straight to the new (empty) list's detail view

**List detail view — header:** the title is tappable (pencil affordance) and turns into an inline text input for renaming (done/blur saves, empty input cancels); a "⋯" menu offers Rename and Delete list (undo snackbar, then back). There is no separate rename modal.

**List detail view — empty state:**
- Title: "Your shopping list is empty"
- Below it, regular text: "Add products and build your shopping list"
- Button: "Add product"

**Adding a product:**
- "Add product" reveals an inline row with two inputs: **product name** (required, trimmed) and **quantity** (optional, free-form text — "2", "1 kg", "3 packs"; stored as TEXT, no numeric parsing so units stay possible)
- Confirming adds the product to the list and clears the inputs so the next product can be typed immediately; the row stays open until dismissed
- The "Add product" affordance remains available on a non-empty list (e.g. as the header "+" or a persistent row)

**List items & the "In cart" flow:**
- Each product renders as a row: name (+ quantity, muted, when present) with a **checkbox on the right**
- Unchecked items appear at the top, newest first — a just-added product shows up at the top of the list, not below the fold
- Tapping the checkbox: it becomes checked, the row is **grayed out** (muted text/checkbox) and **moves to the bottom of the list**, under an "In cart" section header (the header appears only when at least one item is checked)
- Unchecking moves the item back to the unchecked group
- Item edits update the parent list's `updated_at` (so active lists float to the top of the Shopping tab)
- Long-press an item (light haptic) → bottom **ActionSheet**: **Edit / Delete / Cancel**; swipe-left reveals the same actions. Delete removes the item behind a 5s **Undo** snackbar, no confirmation. Edit reuses the inline row in edit mode: inputs pre-filled with the item's name/quantity, the confirm button shows a checkmark, and saving updates the item in place (clearing quantity stores NULL); editing touches the parent list's `updated_at`

**Database (new tables, added to `db/ddl.ts` + `db/schema.ts`; CREATE TABLE IF NOT EXISTS keeps existing installs safe):**

```sql
shopping_lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)

shopping_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id     INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    TEXT,                               -- free-form ("2", "1 kg"); NULL/'' = none
  checked     INTEGER NOT NULL DEFAULT 0,         -- 0/1
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)

CREATE INDEX idx_shopping_items_list_id ON shopping_items(list_id);
```

`ON DELETE CASCADE` (not SET NULL like recipes): a shopping item has no meaning outside its list.

**Out of scope for the first iteration:** ~~linking products to recipes/ingredients~~ (now specified — see §5.12), ~~sharing lists~~ (now specified — see §5.18), quantities as structured numbers/units, reordering by drag & drop, Markdown export of lists.

### 5.11 Language selection

The UI ships in two languages: English and Polish. On first launch the app follows the device locale (via `expo-localization`): a device language starting with `pl` shows Polish, everything else shows English.

Users can override this manually in Settings. A "Language" row (above the "Your data" area) shows the current preference's localized label (System / English / Polski) and, on tap, opens a bottom ActionSheet with options: **System**, **English**, **Polski**, **Cancel**. Choosing **System** restores the device-locale default.

The chosen preference is persisted in the SQLite `app_settings` key-value table (key `language`, value `system` | `en` | `pl`). Changing it re-renders the entire app immediately — tab labels, pushed screen titles, and Alerts all switch — through a `LanguageProvider` React context that wraps the app. This whole-app context is the **approved exception** to the otherwise strict no-global-state rule (§3) and the no-extra-settings rule (§7): it is the only in-app preference.

All user-facing strings live in `i18n/dictionary.ts` with an English and a Polish translation; components never hardcode user-facing strings. Pure resolver logic (preference parsing, locale resolution, interpolation, Polish plurals) lives in `utils/i18n.ts`. The **Markdown export/import format stays English-only** regardless of UI language, so exported files round-trip across devices and locales.

---

### 5.12 Adding recipe ingredients to a shopping list

The bridge between the two product areas (§1): a one-way **copy** of a recipe's ingredients into a shopping list. No persistent link is stored — once added, items are ordinary shopping items (editable, deletable, unaffected by later recipe edits). This deliberately sidesteps the structured-ingredients problem (§7): ingredients stay raw text, and each text line simply becomes a product.

**Entry point:** the "Add to shopping list" button in the recipe view, below the Ingredients section (§5.4). It pushes the modal `/recipe/add-to-list?id=X` over the tab bar via the root Stack, like the other modal forms.

**Parsing ingredients into item candidates (`utils/ingredients.ts`, pure, no native imports):**

The ingredients field is raw Markdown (§5.4), so the parser is line-based and forgiving:
- Split the text on line breaks; trim each line
- **Skip**: empty/whitespace-only lines, Markdown headings (lines starting with `#`) — headings are grouping labels ("Dough", "Sauce"), not products
- **Strip leading list markers**: `- `, `* `, `+ `, `• `, and ordered markers (`1. `, `1) `); strip surrounding bold markers (`**…**`) when they wrap the whole line
- Everything left over is the candidate's **name, verbatim** — quantities embedded in the text ("2 cups flour") stay in the name; the `quantity` column is **not** populated (no numeric/unit parsing, consistent with §5.10 and §7)
- Result order = order of appearance in the text

If parsing yields zero candidates (e.g. ingredients contain only headings), the entry button in the recipe view is hidden.

**Picker modal — one screen, two decisions:**

1. **Which products** — the parsed candidates as a checklist, **all checked by default**; the user unchecks what they already have. A "Select all / none" toggle in the section header.
2. **Which list** — below the checklist, a list-picker section showing existing shopping lists (sorted descending by `updated_at`, same as the Shopping tab; the most recently used list is therefore first and is **pre-selected**) plus a **"New list"** option. Choosing "New list" reveals a name input pre-filled with the recipe title.

- Title: "Add to shopping list"; "✕" close button (no dirty-check — nothing here is destructive to abandon, unlike the forms in §5.2/§5.5)
- Confirm button ("Add N products") shows the live count of checked candidates and is **disabled at 0 checked**; also disabled when "New list" is selected and the trimmed name is empty
- With no shopping lists in the database, the picker shows only the "New list" option, already expanded

**On confirm:**
- "New list" selected → `createShoppingList(name)` first (trimmed name)
- Items are inserted via a bulk helper `createShoppingItems(listId, names)` in `db/shoppingLists.ts` (inserts all rows, touches the list's `updated_at` **once**) — added as **unchecked**, appended after the list's existing items, `quantity = NULL`
- **Duplicates are allowed** — no merging with items already on the list (same philosophy as import, §5.8: no magic)
- The modal closes back to the recipe view; a snackbar confirms the add and offers a **"View list"** action (→ `/shopping/[id]`)

**i18n:** all new strings (button, modal title, section headers, select-all toggle, confirm button with count — using the existing plural rules for Polish, snackbar confirmation) get EN+PL entries in `i18n/dictionary.ts` (§5.11).

**Testing:** the parser and any candidate-selection logic are pure and live in `utils/` → unit tests in `__tests__/` (TDD pipeline per CLAUDE.md); the modal UI is verified by running the app.

---

### 5.13 Sharing a recipe as text

**Trigger:** a share icon (`share-outline`) in the recipe view (§5.4) nav bar.

**Behavior:** builds a localized plain-text message via the pure `buildRecipeShareText(recipe, t)` (`utils/recipeShareText.ts`) and hands it to React Native's `Share.share({ message, title })`. Unlike the other share flows it uses **RN `Share`, not `expo-sharing`**, so the result is ready-to-send text for SMS, Messenger, email, etc. — not a file attachment.

**Content:** the title, then (when present) a compact metadata line, then the Ingredients / Instructions / Notes sections, each under its **localized** label (reusing `recipe.prep`, `recipe.cook`, `recipe.servingsLabel`, `recipe.ingredients`, `recipe.instructions`, `recipe.notes`). Missing fields are omitted — a title-only recipe yields essentially just the title, with **no `—` placeholders**. Localized to the current UI language (EN/PL).

### 5.14 Sharing a cookbook as PDF

**Trigger:** the share icon in the `/cookbook/[id]` header (unavailable in "All recipes", same as before).

**Behavior:** the pure `buildCookbookHtml(cookbook, recipes, t)` (`utils/cookbookPdfHtml.ts`) renders a full HTML document; `utils/cookbookPdf.ts` (`shareCookbookPdf`) turns it into a PDF via `expo-print` `printToFileAsync({ html })` and shares it via `Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle })`. On failure surfaces `Alert('Export failed', …)`.

**Content/styling:** cookbook name as the document title, then each recipe (title, optional metadata, then Ingredients / Instructions / Notes). All labels are **localized** (current UI language). User content is **HTML-escaped** (`&`, `<`, `>`) and newlines become `<br>`; missing metadata/sections are omitted (no `—`). Print styling uses values consistent with `constants/theme.ts` (light palette).

---

### 5.15 Importing a single recipe (link / paste text / photo / AI)

A low-effort way to add **one** recipe from an external source by pre-filling the recipe form, instead of typing everything by hand. **Deterministic only — no in-app AI, no network "smart parsing" service** — so the local-first, private philosophy (§1) is preserved: the only network call is a user-initiated `fetch` of a URL the user pasted, which goes straight to that site (no backend, nothing synced). The **Transcribe with AI (T4)** mode is a *user-mediated* handoff — the app itself still makes **no network call and embeds no AI**; it only copies a prompt and shares the photo to the user's own AI app.

This is distinct from the full-app Markdown **backup** import (§5.8), which restores a whole library from KeepTaste's own export format. §5.15 imports a single recipe from arbitrary external content into a form the user then reviews.

**Scope:** four modes — **From link** (T1), **Paste text** (T2), **From a photo (OCR)** (T3, July 2026 iteration), and **Transcribe with AI** (T4, July 2026 iteration). T3 uses an **on-device** OCR native module (ML Kit), so it needs a development build (like the `.zip` backup, §5.17.1) — in Expo Go and on web the mode is hidden. T4 makes **no network call and embeds no AI** (a user-mediated handoff to the user's own AI app); it works in **Expo Go** (no dev build, unlike T3) and is hidden **on web** (no system share sheet). Importing video / transcripts (YouTube, Reels, TikTok video) and scraping raw HTML when no structured data exists stay **out of scope** (§7).

**Entry point:** an **"Import"** affordance on the **new-recipe form** (`RecipeForm` in create mode only — never in edit mode), placed above the title field. Tapping it opens the **Import sheet** (a themed bottom sheet, same overlay pattern as `ActionSheet`/`FormattingHelpSheet`, §6) with a mode picker: **From link**, **Paste text**, **From photo** (only when the OCR module is available — see T3), and **Transcribe with AI** (only when a system share sheet is available — hidden on web; see T4). The single recipe-creation entry point (FAB → new recipe) is unchanged; import lives inside it.

**Result handling — review, never auto-save:** a successful parse closes the sheet and **fills the already-open new-recipe form** with the parsed fields. The user reviews and edits everything, then taps **Save** as usual (no silent writes). Import only populates the recipe **content** fields (title, prep, cook, servings, ingredients, instructions, notes); it does **not** change the cookbook context — a `cookbookId` passed into `/recipe/new` (when launched from inside a cookbook, §5.3) is preserved. Import does not pull a photo (see below); `imagePath` is left untouched.

**Mode: From link (T1) — structured data only.**
- The user pastes (or shares — see below) a recipe URL. The app does a native `fetch(url)` and parses **Schema.org `Recipe` JSON-LD** embedded in the page (`<script type="application/ld+json">`). The large majority of recipe blogs and portals (WordPress recipe plugins, etc.) emit this, which is exactly why it works without AI and strips ads / life-story prose by construction — we read the structured block, not the page prose.
- **Mapping** (pure `parseRecipeJsonLd(html)` in `utils/recipeImport.ts`):
  - Multiple `<script type="application/ld+json">` blocks and `@graph` arrays are scanned; the **first** object whose `@type` is (or includes) `Recipe` wins.
  - `name` → title.
  - `recipeIngredient[]` → ingredients, joined with `\n` (one per line, becomes the raw-text ingredients field, §5.4).
  - `recipeInstructions` → instructions, joined with `\n`. Handles all three shapes: a plain string, `HowToStep[]` (use each `.text`), and `HowToSection[]` (flatten each section's `itemListElement` steps).
  - `prepTime` / `cookTime` are ISO 8601 durations (`PT1H30M`) → total **minutes** (helper `parseIsoDuration`). `totalTime` is ignored (the form has no total field; total is derived as prep + cook).
  - `recipeYield` → servings, parsed with the standard rule (integer ≥ 1 or `null`, §5.5 / `utils/numeric.ts`).
  - **Source URL** → appended to the **notes** field as a localized `Source: <url>` line (no schema change — there is no `source_url` column; §4). If notes already has parsed content, the source line is appended after a blank line.
  - **Photo is skipped in v1** — JSON-LD `image` is not downloaded; the user adds a photo manually if they want one.
- **Anti-bot reality:** `fetchRecipeFromUrl` sends **browser-like headers** (a Chrome-on-Android `User-Agent`, `Accept`, `Accept-Language`) because React Native's default `okhttp` UA is rejected by many WAFs that otherwise serve the same JSON-LD (recipe sites keep it readable for SEO). This single cheap lever recovers most UA-filtered sites. Sites behind a **full JS challenge / CAPTCHA / paywall** (e.g. hard Cloudflare, NYT Cooking) still can't be read by an on-device fetch — that is accepted and handled by the paste-text fallback, **not** by headless browsers or a scraping proxy (both rejected: the former is impossible on device, the latter breaks no-backend and a datacenter IP is blocked *more* than the user's residential IP).
- **No structured data found** (HTTP 200 but no `Recipe` JSON-LD — common on many blogs and all social media): a friendly message ("Couldn't read this page automatically — paste the recipe text instead") and the sheet **switches to Paste-text mode**, so the user is never left stranded.
- **Error taxonomy** (`fetchRecipeFromUrl` returns a `reason`): a **`blocked`** result (any non-OK HTTP status — WAF refusal, paywall, 4xx/5xx) shows "This site blocks automatic import — paste the recipe text instead." and switches to Paste-text mode; a **`network`** result (offline, DNS, timeout/abort — no usable response at all) shows "Couldn't load that page. Check the link and your connection." Both leave the form untouched.

**Mode: Paste text (T2) — real-world blog heuristic.**
- The user pastes free text copied from a recipe blog / caption. A pure `parsePastedRecipe(text)` in `utils/recipeImport.ts` returns `{ title?, prepTime, cookTime, servings, ingredients, instructions, notes }`. It was tuned on real copied samples from popular PL blogs (which carry nutrition tables, author prose, UI buttons, image alt-text, late titles, and split name/amount lines). Deterministic, **conservative** (an unclassifiable line is kept, never dropped) with a graceful fallback. The passes:
  - **Metadata** (PL + EN labels) — `Czas przygotowania/szykowania` · `Prep`/`Preparation time` → prep; `Czas gotowania/pieczenia/smażenia/duszenia` · `Cook`/`Cooking`/`Bake`/`Total` → cook (hours+minutes summed, "1 godzina" / "20 mins"); `Liczba/ilość porcji` · `Porcje` · `Dla N osób` · `Serves`/`Servings`/`Makes`/`Yield` · a standalone `N sztuki/porcji` yield right after `Składniki` → servings. Matched label lines are removed from the body.
  - **Title** — first content line *unless* it is a section header, a metadata/`kcal` line, or starts with a number (then no title — e.g. a page that opens with the times block). A `Przepis … na:` marker takes the **next** line as the title (some portals print the dish name late, after the ingredients). A later line that merely repeats the title (a duplicated page heading) is dropped.
  - **Sections** — ingredient headers (`Składniki`/`Ingredients`, and `Składniki na X` → kept as a `# X` group heading); step headers (`Przygotowanie` / `Sposób przygotowania` / `Wykonanie` / `Instructions` / `Method` / …); **and**, when no step header exists, the **start of a step list** — the first item `1.`/`1)` (only `1`, so a stray `2./3.` nav list can't misfire) or a labeled `Krok N` / `Step N` — begins the instructions (the lines before it are the ingredient list). Trailing tip sections (`Wskazówki` / `Rady/porady` / `Porada` / `Uwagi` / `Tip(s)`) route to the **notes** field. Within ingredients, a long (>80-char) prose line not starting with a quantity is treated as the (header-less) start of the method.
  - **Intro drop** — when an ingredients header exists, everything between the title and it (tagline, breadcrumb, author intro) is dropped.
  - **Noise** — a conservative denylist removes UI chrome (`Udostępnij/Zapisz/Drukuj przepis`, `Skomentuj`, `Dodaj do ulubionych/notatkę/komentarz`, `Kopiuj`, `Ukryj/Pokaż zdjęcia`, `Komentarze`, `Video`, `Ilość lajków…`), nutrition lines (`kcal`, `Węglowodany`, `Białko`, `Tłuszcze`, `Dieta:`, `Nutrition…`), and rating lines (`Średnia 4.8 / 5 …`, `Oceń!`).
  - **Quantity merge** — a quantity-only line (`250 g`, `1 sztuka`) is merged onto the preceding ingredient name (`ryż do sushi – 250 g`) for portals that print name and amount on separate lines.
  - **Fallback (bounded downside):** with no recognized structure the whole body goes to **instructions** — identical to a no-heuristic dump, so the heuristic can only *improve* the split.
- **Documented limitation:** without a step header *or* numbered steps (rare), method paragraphs can't be cleanly separated from a long ingredient/prose block; and **image alt-text** interleaved with steps is indistinguishable from instructions without AI — both are accepted, not faked. Positioned as **"paste any text"** — an honest light-assist the user reviews, not magic.

**Mode: From photo (T3) — on-device OCR feeding the T2 pipeline.**
- **Use case:** a screenshot of a recipe (Instagram caption, messenger, a website that blocks fetch) or a photo of a cookbook page / handwritten card. OCR turns the image into plain text; everything downstream **reuses T2's `parsePastedRecipe` unchanged** — T3 adds a text source, not a second parsing pipeline.
- **Engine:** `@react-native-ml-kit/text-recognition` — Google **ML Kit Text Recognition v2**, fully **on-device** (no network, no accounts, free; consistent with §1 — the §7 exclusion covers *network* AI parsing, not local OCR). The Latin-script model handles Polish diacritics. It is a **native module**: available only in a development / production build (same constraint as `react-native-zip-archive`, §5.17.1); in Expo Go and on web a module-availability check hides the "From photo" tile.
- **Flow:** tapping **From photo** opens the standard photo-source `ActionSheet` (camera / gallery, same pattern as the form's photo picker, §6) → the picked image goes to `recognizeRecipeText(uri)` (`utils/recipeOcr.ts`, thin native wrapper) **at original resolution** — the 1280px downscale used for stored photos (§5.5) is *not* applied; OCR accuracy needs the full-size source and nothing is persisted. A spinner replaces the sheet content while recognition runs.
- **Text assembly:** ML Kit returns text blocks (with per-line granularity and bounding boxes). A pure `ocrBlocksToText(blocks)` (`utils/ocrText.ts`, unit-tested) assembles the paste-text input: blocks sorted **top-to-bottom by bounding-box y** (ML Kit's block order is not guaranteed to be reading order), lines joined with `\n`, blocks separated with `\n`, whitespace-only lines collapsed. The result feeds `parsePastedRecipe` and pre-fills the form exactly like T2 (review-then-save).
- **The image is not attached to the recipe** — a screenshot of text is not a dish photo; `imagePath` stays untouched (consistent with T1's photo-skipped rule). The user adds a real photo manually if they want one.
- **Errors:** recognition returning no text (blurry photo, non-text image) → "No text found in this photo — try a sharper image, or paste the text instead." and the sheet **switches to Paste-text mode** (same never-stranded rule as T1). A thrown recognition error shows the generic import error. Both leave the form untouched. Camera/gallery permission denials follow the existing photo-picker handling.
- **Documented limitation:** OCR of multi-column layouts, decorative fonts, or low-contrast screenshots can shuffle or drop lines; T2's conservative fallback bounds the downside (worst case: everything lands in instructions for the user to tidy). Same honest light-assist positioning as T2.

**Mode: Transcribe with AI (T4) — user-mediated AI handoff, feeding the T2 pipeline.**
- **Use case:** **cursive / joined handwriting** that on-device OCR (T3) can't read — verified on a real handwritten notebook where ML Kit produced garbage but a general-purpose vision AI transcribed it cleanly. This is the "photo of grandma's recipe card" case OCR misses.
- **Design rationale:** shipping an **in-app cloud AI** was rejected — it would mean bundling/API keys (cost, key management, abuse), and it would break §1's local-first, no-backend, no-account, Play data-safety story (an outbound network call to an AI provider with the user's content). Instead T4 is an **assisted redirect** that keeps §1 intact: **the app performs zero network calls and embeds no AI** — the user shares the photo to their *own* AI app (ChatGPT / Gemini / Claude / …) and brings the answer back by hand. KeepTaste just orchestrates copy + share + paste.
- **Flow:** tapping **Transcribe with AI** shows a three-step instruction and a **Pick photo & copy prompt** button →
  1. the button opens the standard photo-source `ActionSheet` (camera / gallery, reusing T3's picker path) at **original resolution** (nothing persisted, image never attached to the recipe);
  2. on pick, the app copies a carefully engineered **prompt to the clipboard** (`expo-clipboard`) and shares the **photo** via the system share sheet (`Sharing.shareAsync`), so the user drops the image into their AI app and pastes the prompt as the message. A small hint confirms the prompt was copied. **Why clipboard, not a combined image+text share:** Android's `ACTION_SEND` can carry `EXTRA_STREAM` + `EXTRA_TEXT` together (would need `react-native-share`, losing Expo Go support), but this was tested empirically (July 2026, via adb on-device) — **both ChatGPT and Gemini discard the text extra when an image is attached**, so the combined share buys nothing. Retest occasionally; if the major AI apps start honoring `EXTRA_TEXT`, a conditional `react-native-share` path (clipboard kept as fallback) becomes worthwhile;
  3. the user copies the AI's answer and **pastes it back** into a multiline field in the same sheet;
  4. on submit the pasted answer runs through `cleanAiResponse` (see below) and then **T2's `parsePastedRecipe` unchanged** — T4, like T3, adds a text source, not a second parsing pipeline. The parsed fields pre-fill the form for **review-then-save** (no silent writes; `imagePath` untouched).
- **The prompt** lives in `utils/aiTranscribe.ts` (`buildAiTranscribePrompt(lang)`), **not** the i18n dictionary: it is a **unit-tested parser contract** (it steers the AI toward the exact `Title / Ingredients: / Instructions: / Servings:` shape `parsePastedRecipe` expects), so localizers must not casually edit it. It is bilingual (EN/PL) with `lang` passed in from the UI (the active `useLanguage().language`); the PL prompt asks the AI to keep Polish diacritics and marks illegible words `[?]`. It forbids commentary / code fences / Markdown so the answer needs minimal cleanup.
- **Response cleanup:** `cleanAiResponse(text)` (pure, unit-tested, **idempotent**) is a **conservative** tidy before parsing — it unwraps a single outer triple-backtick fence, strips one leading assistant preamble line ("Oto przepis:", "Here's the recipe:") only when content follows, drops trailing separator-only lines, and removes per-line Markdown emphasis/heading/blockquote markers while keeping the content. It **never empties non-whitespace input** (falls back to the trimmed original), so a surprising AI reply can only be tidied, never destroyed.
- **Never-stranded rules:** submitting with an empty (or whitespace-only after cleanup) paste field shows **"Nothing to import — paste the AI's answer first."** (`import.aiEmpty`) and does nothing; if the device has no share sheet, the handoff shows **"Sharing isn't available on this device."** (`import.aiNoShare`) and the mode is anyway hidden on web. Both leave the form untouched.
- **Documented limitations:** T4 requires the user to **have some AI app** (KeepTaste ships none); the AI's answer format is **not guaranteed** — this is bounded by the conservative `cleanAiResponse` + the tolerant `parsePastedRecipe` (unclassifiable lines are kept, worst case everything lands in instructions) + the **always-editable** review form. Honest light-assist, same as T2/T3.

**Implementation notes:**
- All parsing is **pure logic** (`parseRecipeJsonLd`, `parsePastedRecipe`, `parseIsoDuration` in `utils/recipeImport.ts`; `ocrBlocksToText` in `utils/ocrText.ts`; `buildAiTranscribePrompt` + `cleanAiResponse` in `utils/aiTranscribe.ts`) → unit-tested in `__tests__/` via the TDD pipeline (tester → coder). Native parts are thin wrappers: `utils/recipeImportFetch.ts` (`fetchRecipeFromUrl`) and `utils/recipeOcr.ts` (`recognizeRecipeText` + `isOcrAvailable`); T4's clipboard + share I/O lives inline in `ImportSheet.tsx` via `expo-clipboard` and `expo-sharing`. Consistent with the pure-builder + native-wrapper split used by export/PDF (§5.6/§5.14).
- The sheet (`components/recipe/ImportSheet.tsx`) maps a parse result onto a partial `RecipeFormData` and hands it back to the open `RecipeForm`.
- **Platforms:** `fetch` of an arbitrary recipe site works on native only. On the web test build it will typically fail CORS — link import is **not** expected to work there (web is a test environment only, §2); the pure parsers are still exercised by unit tests. **From photo** requires a development build (native ML Kit module) — `isOcrAvailable` gates the tile off in Expo Go and on web; OCR behavior is verified on-device, `ocrBlocksToText` by unit tests. **Transcribe with AI** works in **Expo Go** (only `expo-clipboard` + `expo-sharing`, no custom native module) and is gated off on web (`isSharingSupported`, `Platform.OS !== 'web'`); its prompt/cleanup logic is unit-tested, the clipboard + share handoff verified on-device.
- **i18n:** all new strings (Import affordance, sheet title, mode labels, URL/paste placeholders, the "couldn't read this page" message, network/error messages, the "recognizing…" progress label, the "no text found in this photo" message, the `Source:` prefix) get EN + PL entries in `i18n/dictionary.ts` (§5.11). The `Source:` prefix is localized to the UI language (it lands in user-facing notes, not the English-only backup format).

#### Android share target

A convenience entry into §5.15's import flow: from any app's **Share** menu (a browser sharing a recipe link, a notes app sharing plain text), the user picks KeepTaste and lands on the **new-recipe form with the import already pre-armed**. Android-only (iOS is out of scope, §2). Wired with **`expo-share-intent@^8`** (the library ships one major per Expo SDK — 4→53, 5→54, 6→55, 7→56, 8→57 — so it moves with the SDK; peers `expo: ^57`, `expo-constants`, `expo-linking`, the last promoted from transitive to a direct dependency), configured as an **Android-only** text/URL intent-filter via its config plugin (`disableIOS: true`, `androidIntentFilters: ["text/*"]`). The 3→8 jump during the SDK 57 upgrade needed **no code change** — the hook, the `ShareIntent` shape and the native module name are unchanged. Each config change bumps `android.versionCode`.

- **Pure decision logic** lives in `utils/sharedUrl.ts` (unit-tested): `extractSharedUrl(text)` pulls the first `http(s)://` URL out of arbitrary shared text (stops at whitespace, strips trailing `) . , >` and wrapping angle brackets, preserves query strings, ignores `ftp:`/`mailto:`), and `toImportIntent(text)` maps it to `{mode:'link', url}` (URL only, not surrounding title text) or, when there's no URL but some non-whitespace content, a **never-stranded** `{mode:'paste', text}` fallback so the user always lands somewhere useful. Empty/whitespace/null → ignored.
- **Delivery** (both **cold start** and **warm/foreground**) is consumed in `app/_layout.tsx` by a `ShareIntentHandler` child mounted inside `SnackbarProvider`, using `expo-share-intent`'s `useShareIntent()` (`hasShareIntent`, `shareIntent.webUrl`/`.text`, `resetShareIntent`). The intent is reset immediately after handling, and a last-handled-signature ref blocks double-delivery on re-render/foreground refresh. The cold-start push runs from an effect after mount, not synchronously.
- **Form-busy guard:** if a recipe form modal is already open (`usePathname()` is `/recipe/new` or `/recipe/edit`), the share is **ignored and notified** via a snackbar (`share.formBusy`) rather than stacking a second modal or clobbering an in-progress edit. Otherwise it `router.push`es `/recipe/new` with a single `sharedText` param (raw string, so arbitrary text survives URL-encoding; `new.tsx` re-derives the intent via `toImportIntent`). Shares land with **no cookbook**.
- **Pre-arm:** `RecipeForm` gains an `initialImport` prop that opens `ImportSheet` on mount (create/import mode only); the sheet's new `initialImport` prop seeds link/paste mode — a **link auto-runs the existing fetch** (same spinner + never-stranded paste fallback), a **paste just prefills** (no auto-submit). Consumed once per open; a manual reopen starts blank.
- **Expo Go / web degradation:** `expo-share-intent`'s native module is absent in Expo Go and on web. `utils/shareIntent.ts` exposes `isShareIntentAvailable` (mirrors `isOcrAvailable`, gated on `requireOptionalNativeModule('ExpoShareIntentModule')`); the handler is only mounted when it's true, so Expo Go/web never call the hook and never throw. The share target is verified on a development/production build.

---

### 5.16 Pasting products into a shopping list

A fast way to fill an existing shopping list from text the user already has (a note, a message, a recipe copied from elsewhere): paste the whole block, review the parsed products, add the ones they want. Same philosophy as §5.12 — line-based, deterministic, no AI — and it **reuses §5.12's machinery wholesale**: the `parseIngredients(text)` parser (`utils/ingredients.ts`) and the `createShoppingItems(listId, names)` bulk insert (`db/shoppingLists.ts`). No new parser, DB helper, schema, or migration.

**Scope:** paste targets the **currently open list only** — there is no list-picker and no "create a new list from a paste" path (unlike §5.12's recipe bridge, which must choose a destination). To start a fresh list the user creates it first (§5.10), then pastes into it.

**Entry point:** a **"Paste products"** item (`clipboard-outline`) in the "⋯" header menu of the list detail view (§5.10), between "Rename" and "Delete list". It opens the `PasteListSheet`.

**`PasteListSheet` (`components/shopping/PasteListSheet.tsx`):** a bottom sheet modeled on `ImportSheet` (§5.15) — overlay (no native `<Modal>`), `translateY` animation, keyboard-height lift, hardware-back handling — with two steps:
1. **Paste** — a multiline input (placeholder "Paste products, one per line") and a "Next" button (disabled while empty). On Next: `parseIngredients(text)`. Zero candidates → inline "No products found", stay on step 1.
2. **Review** — the candidates as a checklist, **all checked by default** (same row markup and "Select all / none" toggle as §5.12); a confirm button "Add N" with the live checked count and Polish plurals, disabled at 0 checked.

**On confirm:** `createShoppingItems(listId, selectedNames)` — products added **unchecked**, `quantity = NULL`, list `updated_at` touched once; quantities embedded in a line stay in the name (§5.12 parsing rules). **Duplicates are allowed** — no merging with existing items (consistent with §5.8/§5.12). The sheet closes; the list reloads and a snackbar confirms the add (reusing §5.12's `added.*` strings).

**i18n:** new `pasteList.*` strings (sheet title, placeholder, "Next", empty message) and a `shoppingList.pasteProducts` menu label get EN+PL entries (§5.11); the checklist, select-all toggle, and confirmation reuse the existing `addToList.*` strings.

**Testing:** `parseIngredients` is pure → its existing `__tests__/` coverage is extended with loose-paste cases (numbered lines, bullets, blank lines between items, `#` headings skipped); the sheet UI is verified by running the app.

---

### 5.17 Complete backup archive (.zip) and online backup

**Why:** the Markdown backup (§5.6) is the human-readable escape hatch, but it is **not a complete copy** — it omits photos (`image_path` / `cover_image_path`), shopping lists, timestamps (`created_at` / `updated_at`), and the language preference. For an app whose entire value proposition is "your data, your device" (§1), a reinstall or lost phone today loses photos and lists even if the user did export. §5.17 closes that gap with a **complete archive** and makes "backup to the user's own cloud" possible **without a backend, accounts, or any provider integration** — the app never touches Google/Dropbox; it only writes a file the user (or their cloud app) moves.

This is **not cloud sync** (§7) — there is no automatic two-way reconciliation, no server, no merge logic. It is a one-way snapshot the user owns.

#### 5.17.1 Archive format (the foundation)

A single `keeptaste-backup.zip` containing:

```
backup.json   ← machine format, full fidelity (the source of truth for restore)
recipes.md    ← the §5.6 Markdown (kept verbatim — the readable escape hatch)
images/       ← every referenced photo, copied from documentDirectory
```

- `backup.json` carries `schemaVersion` (see 5.17.4), all cookbooks (incl. `cover_image_path`), all recipes (incl. `created_at` / `updated_at` / `image_path` / `to_try` — §5.19; archives from before the field restore with `to_try = 0`), all `shopping_lists` + `shopping_items`, and `app_settings`. Photo fields store the **relative** `images/<file>` path, not the device URI.
- `recipes.md` stays English-only and byte-identical to the §5.6 output, so the readability/round-trip promise (§1) is untouched even if `backup.json` is never opened by a human.
- **Restore prefers `backup.json`**; a `.zip` with no JSON (or a plain legacy `.md`, §5.8) falls back to the Markdown path. A `.md` import remains supported forever (backward compatibility).

**Restore semantics (replace vs add).** Driven by the user stories: the word "restore" means "my data becomes the backup," yet the dominant case — disaster recovery into a fresh install — has an **empty** database where replace and append are identical. So:
- **Empty database (or nothing but the untouched demo seed, §5.20) → silent clean restore.** No prompt; the archive is simply restored 1:1 (the pristine-seed case takes the Replace path, which wipes first, so the seed is cleanly overwritten). The gate is `canSilentReplace()` = empty OR (`demo_seeded && !user_edited`).
- **Non-empty database → a confirm dialog with two choices:**
  - **Replace all** *(recommended, default)* — wipe via `deleteAllData()` (it already returns stored image paths for cleanup, then delete those files) and `restoreFullBackup` → a faithful 1:1 copy. Covers "test my backup" and "undo a mess," which append would turn into a full-library duplicate.
  - **Add to library** — the existing append behavior (duplicates allowed, §5.8 semantics) for the merge / combine-two-devices case.
  - Cancel.
- **Before a Replace, write a silent safety `.zip` to `cacheDirectory`** (best-effort, reusing the export builder) so a mis-tap is recoverable.
- **The legacy `.md` import stays append-only** — it cannot be a faithful 1:1 restore anyway (it omits photos, lists, timestamps), so it does not offer Replace.

**ZIP library:** `react-native-zip-archive` (RNZA) — packs a staging directory **natively, off the JS thread**, so photo bytes never enter the JS heap. This **supersedes the earlier `jszip` choice** and its deliberate rejection of RNZA: the freeze and packing-time OOM documented in `docs/backup-freeze-rootcause.md` are intrinsic to a pure-JS packer on RN's single thread and cannot be fixed in the Expo Go runtime. **Cost:** RNZA is a native module absent from Expo Go, so backup development now requires a **custom dev client** (`expo-dev-client` + the EAS `development` profile, already in `eas.json`); Expo Go stays usable for all non-backup work. Production shipping is unchanged (already an EAS app-bundle); **no new Android permissions** (RNZA uses app-scoped `cacheDirectory`/`documentDirectory` only). The packer materializes `backup.json` + `recipes.md` + `images/` on disk (native `copyAsync`, no base64) and `zip()`s the directory with `NO_COMPRESSION` (already-compressed JPEGs gain nothing from DEFLATE); restore `unzip()`s natively into a cache dir and `copyAsync`s the photos out. **SAF write (no base64 ceiling):** the legacy expo-file-system API (`expo-file-system/legacy`, which this app still uses) has no stream/append for `content://`, so rather than base64-read the whole finished archive to hand it to `StorageAccessFramework`, the SAF auto-backup path (§5.17.3) streams the cache file into the SAF document URI via the local **`safwriter` Expo module** (`modules/safwriter/`): its `copyFileToSaf` opens the document URI with `ContentResolver.openOutputStream` and copies on a 1 MiB native buffer — no base64, no whole-file JS allocation. Peak heap is constant regardless of archive size, so **library size no longer caps a SAF backup**. A custom module was needed because `react-native-blob-util` (tried first) misroutes primary-storage SAF document URIs — its `getRealPathFromURI` fabricates a real path, so it writes to the wrong place and leaves the SAF file 0 bytes (`docs/backup-freeze-rootcause.md`). Still dev-build-only; **no new Android permissions** (writes to a SAF URI the user granted). Full rationale: `docs/backup-native-zip-plan.md`, `docs/backup-freeze-rootcause.md`.

**New/changed code:**
- *Pure (unit-tested, TDD pipeline per CLAUDE.md):* `utils/backupArchive.ts` — `buildBackupJson(data): string` and `parseBackupJson(text): BackupData` (validates `schemaVersion`). Tests in `__tests__/backupArchive.test.ts`.
- *Data layer:* `db/recipes.ts` `getFullBackupData()` (gathers everything `getBackupSections` omits); `db/import.ts` `restoreFullBackup(data)`. Restore must **preserve timestamps**, so add `createRecipeRaw` / `createCookbookRaw` that accept explicit `created_at` / `updated_at` / image paths (the existing `createRecipe` overwrites both with `now`).
- *Native I/O:* `utils/backupArchiveFs.ts` — `exportBackupZip(dialogTitle)` (gather → stage JSON + MD + `images/` on disk via native `copyAsync` → native `zip()` to `cacheDirectory` → `Sharing.shareAsync(uri, { mimeType: 'application/zip' })`) and `loadBackupZip(uri)` / `commitBackupRestore(loaded, mode)` (native `unzip()` into a cache dir → `parseBackupJson` → `copyAsync` photos into `documentDirectory` with fresh `generateImageFilename` names, remapping old→new paths → `restoreFullBackup`; the extracted dir is cleaned up after).
- *UI:* `app/settings.tsx` — `handleExportAll` calls `exportBackupZip`; `handleImport` detects `.zip` vs `.md` and routes accordingly. New EN+PL strings in `i18n/dictionary.ts`.

#### 5.17.2 Level 0 — share to Drive (free once 5.17.1 ships)

`exportBackupZip` already hands the file to the system share sheet, where **"Save to Drive" / "Upload to Drive"** (and Dropbox, email, etc.) appear as targets on Android. No extra export code. Settings gains a one-line hint that the share sheet is how you send a backup to the cloud. This covers "online backup" for most users with **zero** OAuth, accounts, or provider integration.

**Manual "Save to a folder" (Android).** The share sheet is fire-and-forget: Android reports neither the chosen target nor whether it succeeded, so a share target that silently fails (or a user picking a Google Drive location in a downstream picker) produces **no feedback** the app can act on. To give the manual export a path with guaranteed feedback, on Android "Export all data" opens an ActionSheet with **Share / send** (the share sheet, unchanged) and **Save to a folder**: a SAF directory pick + app-controlled write (`exportBackupZipToFolder` — dated archive via `createFileAsync` + the streamed `safwriter` copy, §5.17.1; **no pruning and no settings writes**, unlike the §5.17.3 auto path). Because the app owns this write, a Google Drive folder is refused **up front** (`isGoogleDriveFolderUri`, same detection as §5.17.3) with a message pointing at "Share / send" + the Drive app, a successful write confirms with an alert, and a failed one surfaces the size-aware write-failed message.

#### 5.17.3 Level 1 — automatic export to a chosen folder (SAF)

A "set and forget" option: the app writes a dated archive to a folder the user picks once; if that folder is synced by a cloud app, the backup goes online automatically. The app still knows nothing about any network.

- **Mechanism:** `expo-file-system` `StorageAccessFramework` (works in Expo Go on Android). `requestDirectoryPermissionsAsync` once → persisted URI → `createFileAsync` writes `keeptaste-backup-YYYY-MM-DD-HH-MM.zip` (local date **and** time, so the filename matches the "Last backup" line in Settings; colons are illegal in filenames so the time uses a `HH-MM` dash form). The date half is still the prune key, so retention stays one generation per calendar day. **Write-then-prune ordering:** `writeBackupToFolder` first lists the folder and *computes* which archives to prune (`backupsToPrune`: any same-day archive plus everything beyond the chosen retention count), but only **after** the new archive is successfully written does it delete them. This guarantees an existing backup is never removed before its replacement is on disk — if the write throws, nothing is pruned. Trade-off: a second backup on the same day briefly coexists with the old same-day file, so SAF may hand the new write a `... (1).zip` suffix before the old one is pruned; the filename alternates between the clean name and the `(1)` variant across same-day writes, but the file **count** always settles at `backup_keep`.
- **New `app_settings` keys** (the table already exists — no `ALTER`): `backup_folder_uri`, `backup_last_export_at` (ISO), `backup_auto_enabled` (`'0'`/`'1'`), `backup_keep` (retention count; default 2 — keeps one prior generation so a corrupt or interrupted new write is still recoverable). Getters/setters in `db/settings.ts` (mirror the `language` pattern).
- **Pure decisions (unit-tested):** `utils/backupAuto.ts` `parseKeepCount(raw, fallback)` and `backupsToPrune(uris, todayDate, keep): string[]`; the dirty-flag/flush/suppression logic in `utils/backupTrigger.ts` (`scheduleAutoBackup`, `flushAutoBackup`, `withAutoBackupSuppressed`) is also unit-tested.
- **Retention UI:** the "Automatic backup" Settings section offers a "Backups to keep" picker (`AUTO_BACKUP_KEEP_OPTIONS` = 1/2/3/7/14/30) once a folder is set.
- **Trigger:** change-driven, debounced. (Historically the write was *forced off the foreground entirely*: the JSZip build froze the single JS thread for hundreds of ms on a photo-rich library, so it could only run hidden on the `AppState` background edge. With native off-thread packing (§5.17.1) **and** the streamed native SAF write (§5.17.1) the build **no longer touches the JS thread**, so the app stays responsive while it runs and we can mirror eagerly in the foreground; see `docs/backup-freeze-rootcause.md`.) A change to a **recipe or cookbook** (the `db/recipes.ts` and `db/cookbooks.ts` mutations call `scheduleAutoBackup`; shopping lists/items and settings never trigger) **marks the mirror dirty** and **(re)arms a 5s debounce**, so a burst of edits collapses into one write fired ~5s after the last change. The write is additionally **rate-limited to once per 30s** (`MIN_INTERVAL_MS`): since the whole archive is re-packed every time (no incrementality), changes arriving inside the window just re-arm and coalesce rather than triggering back-to-back repacks — this keeps a large (500MB+) library from thrashing disk/battery during active editing. **`flushAutoBackup()`** on the `AppState` `active → background` edge (`app/_layout.tsx`) is the **forced** path: it bypasses both timers and writes the latest state **now**, because the user is leaving. (iOS `inactive` — control-centre / notification-shade pulls while the app is still on top — is ignored; `background` means a real leave. Auto-backup Level 1 is Android-only anyway, gated on `Platform.OS === 'android'`.) A crash mid-session is healed on next launch (below). **Concurrency is safe on every path:** `inFlight` runs at most one write at a time (a second trigger dedupes onto it — never two 500MB packs at once), `dirty` is cleared when a write *starts* so a change landing mid-write re-arms a **trailing** flush (still min-interval-paced), and write-then-prune keeps the previous archive intact if a write is interrupted. Bulk import/restore is wrapped in `withAutoBackupSuppressed` so the many internal creates (and any background flush mid-restore) fire a single backup at the end, reflecting the final data. `runAutoBackupNow` is best-effort and silent: if enabled and a folder is set → `writeBackupToFolder` (native packing runs off-thread, so no UI-idle gate is needed), then stamp `backup_last_export_at`. Enabling auto-backup in Settings performs an immediate first write. **Data safety:** every edit is already committed to SQLite synchronously, so a hard-kill before the background flush completes loses no data — only the *external mirror* lags by one session, and write-then-prune (below) keeps the previous good archive intact even if a flush is truncated mid-write. **Crash recovery:** the dirty flag is in-memory, so a kill that skips backgrounding (typically a crash) loses it; on startup `maybeBackupOnLaunch` (called from `app/_layout.tsx` after migrations) compares `getLatestDataChangeAt()` (MAX of `recipes.updated_at` / `cookbooks.created_at`) against `backup_last_export_at` via the pure `isMirrorStale(...)` and re-arms a backup via `scheduleAutoBackup` (so it flushes ~5s after launch, or on the next background) if the data is newer. A bare delete bumps no timestamp so a delete-then-crash isn't detected this way, but the data is safe in SQLite and the next edit re-arms. There is no startup/daily schedule.
- **UI:** a new "Automatic backup" Settings section — pick folder, on/off toggle, "Last backup: …" line, and a note that a folder synced by **Dropbox/Nextcloud/Drive-desktop** is the reliable choice (plain Google Drive on Android exposes a DocumentsProvider, not a normally synced local folder, so for Drive the share sheet of Level 0 is more dependable).

**Deliberately out of scope:** direct **Google Drive / Dropbox API** integration (OAuth, account sign-in, app folders). It is the most work, requires Google/Dropbox app verification (OAuth), and breaks "no accounts" (§7) for little gain over the share sheet. See §7.

#### 5.17.4 Schema versioning (prerequisite for safe restore)

Restoring an archive made on a different schema version is a corruption vector, and the current migration mechanism (`CREATE TABLE IF NOT EXISTS`, §4) has no version tracking. Before restore ships, introduce **`PRAGMA user_version`** in `db/client.ts` with an explicit migration ladder (v1→v2→…), and stamp `schemaVersion` into `backup.json`. Importing an archive from a **newer** schema surfaces a clear message instead of silently mis-restoring. This is cheap now and removes the §9 "migrations don't handle schema changes" risk for every future feature, not just backup.

#### 5.17.5 Build order

`5.17.1 archive` + `5.17.4 versioning` (in parallel) → `5.17.2 Level 0` (free) → `5.17.3 Level 1`. The archive is the bulk of the work; the levels are thin wrappers over it.

---

### 5.18 Sharing a shopping list as text

**Why:** the app is local-only with no sync (§1/§7), so two people can't see the same list. The common scenario — one person writes the list at home, the other does the shopping — has no path today. §5.18 closes that gap the same way recipes share (§5.13): ready-to-send plain text over whatever messenger the users already have. No backend, no accounts.

**The round-trip is the point.** The shared text is built so the recipient can paste it straight back into a list via **"Paste products"** (§5.16): the format is line-based bullets that `parseIngredients` (§5.16/§5.12) strips on re-paste. Sender shares → recipient pastes → both have the list. One-way, manual, user-owned — not sync.

**Entry point:** a **"Share list"** item (`share-outline`) in the "⋯" header menu of the list detail view, between "Paste products" and "Delete list" (`app/shopping/[id].tsx`).

**Content (`utils/shoppingListShareText.ts`, pure, unit-tested):** `buildShoppingListShareText(listName, items)` returns the list name, a blank line, then one `- {name}` bullet per item (`- {name} ({quantity})` when a quantity is set). **Only active items** are included — products already in the cart are omitted so the recipient starts from a clean list. A list with no active items shares just its name. No "—" placeholders, consistent with the rest of the app. Shared via React Native `Share.share` (like §5.13), localized dialog title (`shopping.shareDialogTitle`).

**Scope / fidelity:** lossy and deliberately so — on re-paste a quantity stays embedded in the item name (the `quantity` column isn't repopulated), matching §5.10/§5.12, which never parse quantities. The share is **not** the backup path (that's the `.md`/`.zip`, §5.6/§5.17) and is **not importable** as structured data.

**i18n:** `shopping.shareList` (menu label) and `shopping.shareDialogTitle` get EN+PL entries (§5.11).

**Testing:** the builder is pure → covered in `__tests__/shoppingListShareText.test.ts` (name + bullets, quantity in parens, checked items omitted, empty list, and a round-trip assertion through `parseIngredients`); the menu action is verified by running the app.

---

### 5.19 To-try recipes

**Problem:** recipes saved "to cook someday" (from websites, other apps, screenshots) get lost — they either pollute the cookbook they land in or are never seen again. KeepTaste gives them an explicit, lightweight status. This is deliberately a **dedicated boolean, not a tag** (§7): behaviors — the bottom section, the filter chip, the badge — hang off a flag the app understands, which free-form labels cannot provide.

**Data:** `recipes.to_try INTEGER NOT NULL DEFAULT 0` (§4), added as an `ALTER TABLE ... ADD COLUMN` step in the `user_version` migration ladder (§5.17.4). Default `0` (= tried / normal): existing libraries are unaffected; marking is always an explicit user action.

**Marking and unmarking:**
- **Recipe form (§5.5):** a "To try" switch, default off for new recipes; edit preserves the stored value. Import flows (§5.8 backup, §5.15 link/paste) never set it except when a backup's `**Status:** to try` line says so.
- **Recipe view (§5.4):** when the flag is set, a small "To try" badge appears next to the title and a **"Tried it ✓"** action is shown. Tapping it clears the flag, **bumps `updated_at`** (the one deliberate exception to the edit-only rule, §4 — the freshly tried recipe "graduates" to the top of its cookbook) and confirms with a snackbar. No Undo path — re-marking takes one switch flip in the edit form.
- **Recipe cards (§5.3):** a small muted icon badge (Ionicons `flask-outline`, `textMuted`) next to the title — visible at a glance, quiet enough not to shout. No text on cards.

**List behavior (§5.3):** in every recipe list (specific cookbook and "All recipes") to-try recipes are **partitioned to the bottom** under an uppercase "To try" section header; within both partitions the ordering stays `updated_at` descending. The header renders only when the partition is non-empty. A visible section, not a silent sort tweak — otherwise a recently edited to-try recipe "missing" from the top of the list would look like a bug. The partitioning is a pure helper (unit-tested), applied after the existing sort.

**Aggregation — the filter chip (§5.3):** below the search field in "All recipes" (the search's only home), a **"To try (N)"** chip:
- Hidden entirely when N = 0 — users who never mark anything never see the feature.
- Tap toggles it. Active chip restricts the list to to-try recipes across all cookbooks; with an empty query this *is* the "what should I cook next" aggregation view, with a query it searches within to-try only (AND).
- Session-only state (component state, no persistence) — a quick filter, not a mode.

**Export / import round-trip:**
- `.md` backup (§5.6/§5.8): the `**Status:** to try` line, present only when set; absence → tried. English-only.
- `.zip` archive (§5.17.1): `backup.json` recipes gain `to_try`; **`schemaVersion` bump** (§5.17.4). Older archives restore with `to_try = 0`.
- **Shares omit the status** (recipe text §5.13, cookbook PDF §5.14) — it is personal workflow state, not recipe content.

**i18n:** new EN+PL strings in `dictionary.ts` (badge/section label, chip label with count, form switch label, "Tried it" button, confirmation snackbar).

**Out of scope for this feature:** a dedicated "To try" virtual cookbook tile (the chip covers aggregation; revisit only if it proves too hidden), reminders/nudges, a "tried on" date, auto-marking imported recipes.

---

### 5.20 Sample content on first launch

**Problem:** a brand-new install opens on an empty home screen, so a first-time user has nothing to look at and no example of what a filled-in recipe looks like. KeepTaste seeds a small, localized sample cookbook **once**, as ordinary user data the person can edit, delete, or export like anything they wrote themselves.

**One-shot guard:** a `demo_seeded` (`'1'`) key in `app_settings` marks the seed as handled so it never runs again — set after a successful seed, and also set (without seeding) whenever the library is found non-empty at first check, so a library that predates this feature is never seeded on top of. The seed additionally requires `isDatabaseEmpty()` (belt-and-suspenders — it never lands on real data). Helpers live in `db/settings.ts` (`isDemoSeeded` / `markDemoSeeded`, and `isUserEdited` / `markUserEdited` below).

**Content:** `utils/seedData.ts` is a pure builder — `buildSeedContent(language)` returns a localized cookbook ("Breakfasts" / "Śniadania") and a **single** fully filled-in showcase recipe (EN "Pancakes" / PL "Naleśniki" — the user's own beer-batter thin-pancake recipe) with all of prep/cook/servings set, Markdown-list ingredients and numbered instructions (§5.6 style; the 1h batter chilling lives in the instruction text, not the numeric fields). The Notes field says it is a sample and may be edited or deleted. The pure builder always leaves `imagePath` null and never marks to-try — the photo is attached by the DB seed layer (below). EN and PL stay in lockstep index-by-index (same recipe count, same nullness pattern) so translations don't drift (unit-tested).

**Bundled photos:** the showcase recipe ships with a bundled image, `assets/images/seed/pancakes.jpg`, and the cookbook cover with a separate one, `assets/images/seed/breakfast.jpg`. At seed time `db/seed.ts` resolves each via `expo-asset` (`Asset.fromModule(require(...))` + `downloadAsync()`) and copies it into the document directory through the existing `utils/imageStorage.ts` `persistImage`, exactly like a picked photo — so the recipe photo is deletable with the recipe and both are included in `.zip` backups. The cover is a **separate stored file** (not a shared path) so deleting the seeded recipe — which removes its stored image — can never orphan the cookbook's `coverImagePath` (the home-screen `CookbookTile` renders covers). The photo step is **best-effort**: any resolution/copy failure — or web, where `documentDirectory` is null — degrades gracefully to no image and never blocks seeding.

**When it runs:** from the home screen (`app/(tabs)/index.tsx`) on mount, once (an invocation-guard ref plus the `demo_seeded` idempotency), after `LanguageProvider` has resolved the active language so the seed is localized. If it seeds, the cookbook list reloads so the new tile appears immediately. `db/seed.ts` `seedSampleContentIfNeeded(language)` does the inserts inside `withAutoBackupSuppressed` (one backup at the end, and — see below — its own inserts skip the user-edited mark).

**"Pristine seed" vs edited — the `user_edited` flag:** a `user_edited` (`'1'`) key is set the **first time the user makes a real mutation** — any recipe create/update/delete/tried, cookbook create/update/delete, or **shopping-list/item** create/update/delete/check (`db/userEdited.ts` `noteUserEdit`, best-effort, once per process, and skipped while auto-backup is suppressed so the seed's own inserts don't count). Shopping-list mutations are deliberately included even though they never trigger auto-backup (§5.17.3), because `isDatabaseEmpty()` counts shopping lists as content — a user who only makes a list must still flip the flag, or a `.zip` restore would silently wipe that list as if the library were a pristine seed. This lets the app tell an untouched demo seed apart from a library the user has actually worked in.

**Launch gating:** the home screen holds back its "no cookbooks" empty state until the seed attempt has resolved (a local `booted` flag), and the logo stays on screen until the first screen is fully loaded. The home screen calls `markAppReady()` (`utils/appReady.ts`, one-shot signal, unit-tested) after the seed attempt + cookbook load. Launch therefore goes logo → complete home with no blank or partial frames. On non-first launches the seed attempt is a single settings read — imperceptible.

The wait is split across **two** splash layers in `app/_layout.tsx`, which is deliberate — they are not interchangeable:

- **`SplashGate`** hides the *native* splash as soon as the theme preference resolves. It is released early on purpose: the native splash draws above the app window, its colors are baked at build time, and Android 12+ fades its icon out on its own — so every extra millisecond it is held risks showing a wrong-colored, logo-less screen. It must never be used to wait for data.
- **`SplashOverlay`** is a themed, full-screen logo rendered by React from the first JS frame, and it carries the rest of the wait: theme + language preferences resolved, `appReady` fired, and a `MIN_SPLASH_VISIBLE_MS` (1.2s) floor so a fast device shows the logo as a launch moment rather than a flash. Then it fades out. It covers territory the native splash cannot: the dev-client bundle gap, a manual Dark override on a light-mode system, and the post-icon-fade window.

Both layers carry an independent 5s failsafe, so a hung preference read can never trap the user on a splash.

**Seamless handoff (three invariants).** The transition between the two layers must be invisible, which requires all three to hold — a mismatch in any one reads as a flicker:

1. **Background color.** `expo-splash-screen` in `app.json` sets `backgroundColor` `#FAFAF7` and `dark.backgroundColor` `#1C1814`, matching `lightColors.background` / `darkColors.background` in `constants/theme.ts`. Changing a theme background means changing `app.json` too. Note Android picks the native variant by *system* dark mode, not the app's own theme setting — a manual in-app override can still start on the other variant, which is exactly why the overlay exists.
2. **Logo size.** The plugin's `imageWidth` (160) and the overlay's `SPLASH_LOGO_SIZE` (160) both scale the same square source, so the glyph lands at 62 × 77 dp in both layers. Unequal values make the logo visibly jump the moment the overlay takes over.
3. **Continuity.** The logo must be present in *every* frame — no gap between the native icon fading and the overlay painting.

Verified on an Android 15 emulator (release build, 320 dpi) in both themes: background constant at the configured color from 0.4s, logo constant at 124 × 154 px (= 62 × 77 dp at 2×) across the whole splash, and no logo-less frame.

Changing any splash color or size requires a **native rebuild** — the Android drawables and `values-night` colors are generated at prebuild time, so a JS-only reload will not pick them up.

**Restore interaction (§5.17.1):** `canSilentReplace()` = library empty **OR** pristine seed (`demo_seeded && !user_edited`); the pure truth table is `shouldSilentReplace(flags)`. A `.zip` restore over a pristine seed skips the Replace/Add prompt and restores **1:1** like the empty-DB case (the replace path wipes first, so the seed is cleanly overwritten). Any real edit flips `user_edited`, after which a restore falls back to the Replace/Add confirm. A completed restore stamps **both** flags (it is real user data — never seed it later, never mis-read it as a pristine seed; this also covers pre-feature backups that carry neither flag).

**Web:** the web test client is in-memory and resets per reload (§2), so the seed re-runs on every reload there — expected, not a concern for the product platforms.

---


## 6. Design system

All tokens live in `constants/theme.ts`. Components do not use hardcoded color, size, or shadow values.

### Color palette

| Token | Value | Usage |
|---|---|---|
| `primary` | `#C84B31` | Actions, CTA buttons, accents |
| `onPrimary` | `#FFFFFF` | Text/icons on primary surfaces |
| `background` | `#FAFAF7` | Screen backgrounds |
| `surface` | `#FFFFFF` | Cards, inputs |
| `surfaceAlt` | `#F5F3EE` | Tabs, note boxes |
| `text` | `#1A1714` | Primary text |
| `textSecondary` | `#6B6560` | Labels, section headings |
| `textMuted` | `#756C65` | Placeholders, metadata, "No results" — darkened to meet WCAG AA (4.5:1) on `background` |
| `border` | `#E8E4DE` | Borders |

### Design philosophy
A warm, appetizing palette evoking the kitchen — paper, wood, ceramics. Not sterile white, not cold grays. Minimalist hierarchy without unnecessary decoration.

### Dark mode

**UX principle:** the app defaults to the system setting, with an optional in-app override in Settings → Appearance (**System / Light / Dark**). "System" keeps the original zero-config behavior; the explicit choices let users who prefer one mode pin it regardless of the OS.

**Mechanism:**
- `theme.ts` exports two palettes, `lightColors` / `darkColors`, with an identical set of tokens; the remaining tokens (typography, spacing, shadows) are shared
- `ThemeProvider` (`constants/ThemeProvider.tsx`) holds the persisted preference (`db/settings.ts` key `theme`, parsed by `parseThemePreference`) and resolves it against the live OS scheme via the pure `resolveScheme(preference, systemScheme)` (both unit-tested); it publishes the effective scheme + preference + setter through `ThemeContext`
- Components get colors through the `useTheme()` hook, which reads the resolved scheme from `ThemeContext` (falling back to `useColorScheme()` when no provider is present), not by importing a palette directly — switching is centralized and components don't know which mode is active. The Settings screen reads/writes the preference via `useThemePreference()`
- Components build their stylesheets with `makeStyles(palette)` factories (and, where present, `makeMarkdownStyles(palette)`), memoized on the active palette via `useMemo` so styles rebuild when the scheme changes; inline JSX color props read straight from the palette
- The Android navigation bar and status bar follow the resolved scheme (`SystemChrome` in `app/_layout.tsx`), so a manual override recolors the system chrome too

**Dark palette** — same philosophy: warm, not pitch black, not cold:

| Token | Value | Notes |
|---|---|---|
| `primary` | `#E06A4F` | Lightened primary for contrast on a dark background |
| `onPrimary` | `#1C1814` | Dark text on the lightened primary (better contrast than white) |
| `background` | `#1C1814` | Warm dark base (not #000) |
| `surface` | `#262019` | Cards, inputs |
| `surfaceAlt` | `#2F2820` | Tabs, note boxes |
| `text` | `#F0EBE4` | Primary text |
| `textSecondary` | `#A89F95` | Labels, section headings |
| `textMuted` | `#948A82` | Placeholders, metadata, "No results" — lightened to meet WCAG AA (4.5:1) on `background` |
| `border` | `#3A322A` | Borders |

Values to be verified on a device for contrast (target: WCAG AA for text). Photos and covers unchanged; the dark overlay on cookbook covers (§5.1) works in both modes.

### Base UI components and interaction patterns (June 2026 redesign)

Shared presentational components live in `components/ui/`: `ScreenHeader` (custom header with safe-area top inset and back button), `ModalHeader` (title + close for modals), `IconButton` (44pt round pressable, **requires** `accessibilityLabel`), `Button` (primary/secondary/destructive pill with loading spinner), `Input` (themed `TextInput`), `EmptyState` (icon + copy + optional action button). Native stack headers are disabled globally in `app/_layout.tsx` — every screen renders its own header.

Interaction rules:
- `Pressable` with a visible pressed state everywhere (no bare `TouchableOpacity`); touch targets ≥ 44pt, shopping-list rows ≥ 56pt (`Touch` tokens in `theme.ts`).
- Safe areas via `react-native-safe-area-context` only (the deprecated RN `SafeAreaView` is not used).
- The recipe view keeps the screen awake (`expo-keep-awake`) and renders ingredients/steps at ≥ 18pt (`Typography.size.reading`); header **A− / A+** buttons let the cook bump that base size up to 1.8× for the session (ephemeral, resets on exit — §5.4).
- Checking off a shopping item gives light haptic feedback (`utils/haptics.ts`) and animates via `LayoutAnimation` (`utils/motion.ts`), which is suppressed when the system reduce-motion setting is on.
- Images render through `expo-image` (fade-in transition, cover-fit); cookbook tiles get a bottom gradient scrim (`expo-linear-gradient`) so the white name stays readable on any photo.
- Animation durations come from `Motion` in `theme.ts` (150–250ms).
- Text on `primary`/`error` surfaces uses the `onPrimary` token, never hardcoded white.

Editing & deleting (June 2026 iteration):
- **Deletes go through a 5-second Undo snackbar** — the actual DB mutation (and image cleanup) is deferred in `utils/pendingDelete.ts` until the snackbar expires; screens hide pending objects and re-render via its subscription API. **Recipes and cookbooks additionally get a confirmation Alert first** (deliberate speed bump, user-requested); shopping lists and items rely on undo alone. "Delete all data" (Settings) keeps its double `Alert` confirmation. Avoid `LayoutAnimation` in the same frame a snackbar mounts — `configureNext` is global and makes the bar flicker.
- **Context menus are a themed bottom `ActionSheet`** (`components/ui/ActionSheet.tsx`), not `Alert.alert`: long-press on cookbook tiles / list cards / shopping items, "⋯" header menus in the cookbook and shopping-list views, the photo-source picker in forms, and the language picker in Settings. If the project ever moves to a development build, this is the single component to swap for native context menus (Zeego).
- **Swipe-left reveals Edit/Delete** (`components/ui/SwipeableRow.tsx`, gesture-handler + Reanimated) on shopping items, shopping list cards and recipe cards; long-press menus remain as the discoverable alternative.
- **Shopping list rename is inline** — tap the title on the list screen (also reachable via `?rename=1` from the lists tab). The `shopping/edit` modal route was removed.
- **Form validation is inline** (error text under the field) instead of Alerts; "Added to list" feedback is a snackbar with a "View list" action. `Alert` remains only for: discard-changes, permissions, import/export dialogs and delete-all.

Proposals that would require further logic changes are parked in `UX_NOTES.md`.

---

## 7. Out of scope (deliberate decisions)

| Feature | Reason for omission |
|---|---|
| Cloud sync (two-way reconciliation, server, merge) | Complexity, infrastructure costs, privacy concerns. **Note:** the one-way `.zip` backup to the user's own cloud folder (§5.17) is *not* sync — the app writes a file, never reconciles or talks to a server |
| Direct Google Drive / Dropbox API integration (OAuth, account sign-in, app folders) | Most work, needs provider app verification (OAuth), and breaks "no accounts" — for little gain over the system share sheet (§5.17.2). Online backup is achieved via the share sheet (Level 0) or a user-chosen synced folder (Level 1, SAF) |
| User accounts | Same as above — the app is deliberately private and local |
| Tags (recipe labels + filtering) | Removed from the MVP — title search is enough to start; may return in the future (see §8). The **to-try status (§5.19) is not tags**: it's a dedicated boolean the app can hang behavior on (bottom section, filter chip, badge), which free-form labels cannot provide |
| Ingredient scaling (servings multiplier) | Ingredients are text, not structured data — parsing would be brittle |
| Cooking mode (step-by-step active screen) | Complexity, beyond MVP. The *reading-view* affordances a cook actually needs — keep-awake and in-recipe text zoom (A−/A+) — already ship on the recipe view (§5.4/§6); only the dedicated one-step-at-a-time screen stays out |
| **In-app** AI / network "smart parsing" for recipe import | Breaks the local-first, no-backend philosophy (§1); per-call cost. Single-recipe import stays deterministic (§5.15). The **user-mediated Transcribe-with-AI handoff (T4)** *is* in scope — the app still ships no AI and makes no network call; it only copies a prompt and shares the photo to the user's own AI app |
| Scraping raw HTML when a page has no structured data | Brittle, garbage-prone. Link import (§5.15) reads Schema.org `Recipe` JSON-LD only; otherwise it falls back to paste-text |
| Importing recipes from video / transcripts (YouTube, Reels, TikTok video) | Needs transcription + AI; out of scope. Captions can be pasted as text (§5.15) |
| Sharing recipes between users | Requires a backend |
| Drag & drop step reordering | Steps live in one text field, not separate records |
| Notifications / timers | Out of scope |
| App language selection | **User-approved exception** to the no-extra-settings rule (§5.11). The UI is bilingual EN/PL; the Markdown export/import data format stays English-only |
| Theme override (System / Light / Dark) | **User-approved exception** to the no-extra-settings rule (Settings → Appearance; §6). Defaults to "System" |

---

## 8. TODO — open items

### High priority
- [x] **Bottom tab navigation** — restructure `app/` into a `(tabs)` group with a two-tab bottom bar: Recipes (existing home) and Shopping (§5.9); modals and detail screens keep opening over the bar via the root Stack
- [x] **Shopping lists** — the Shopping tab per §5.10: `shopping_lists`/`shopping_items` tables (DDL + schema), list-of-lists view, "New shopping list" modal, list detail with inline product adding and the checked/"In cart" flow. Depends on the tab bar landing first
- [x] **Remove tags from the existing code** — drop the `tags`/`recipe_tags` tables (DDL + `DROP TABLE IF EXISTS` for existing dev installs), fields in `schema.ts`, the tags field in `RecipeForm`, chips in the recipe view, and the section in export
- [x] **Cookbook create/edit modal** — form with a name field and an image picker for the cover (replacing the `Alert` placeholder in `index.tsx`); editing available via long-press on a tile; long-press also gains an "Edit" option and a second delete confirmation with a message about recipes surviving (§5.1, §5.2)
- [x] **Copying photos to `documentDirectory`** — critical data-loss risk: the image picker URI points to the system cache. Done in `utils/imageStorage.ts`: (1) on recipe/cookbook save the picked file is copied to `FileSystem.documentDirectory`, (2) the stored copy is deleted when the record is deleted or the photo is replaced/removed, (3) covers both recipe `image_path` and cookbook `cover_image_path`; graceful no-op on web (`documentDirectory` is null there)
- [x] **Correct numeric field parsing** — the current pattern `value ? Number(value) : null` saves `NaN` for text; implement the rule from §5.5 (integer ≥ 1 or `null`)
- [x] **Diacritics-safe search** — replace SQL `LIKE` with JS-side `toLowerCase()` filtering (§5.1)
- [x] **Add ingredients to a shopping list** — the recipe→shopping bridge per §5.12: line-based ingredient parser (`utils/ingredients.ts`), picker modal (`app/recipe/add-to-list.tsx`), bulk insert `createShoppingItems` in `db/shoppingLists.ts`, "Add to shopping list" button in the recipe view, EN+PL strings
- [x] **Complete backup archive (.zip) — foundation** — §5.17.1: `utils/backupArchive.ts` (`buildBackupJson` / `parseBackupJson`, unit-tested), `db/backup.ts` (`getFullBackupData()`, `isDatabaseEmpty()`, timestamp-preserving + id-remapping `restoreFullBackup()`, unit-tested), native `utils/backupArchiveFs.ts` (`exportBackupZip` / `loadBackupZip` / `commitBackupRestore`) via `react-native-zip-archive` (native, off-thread staging-dir pack; replaced `jszip` — resolves the freeze + packing-OOM walls, requires a dev build, §5.17.1), Settings export/import wired to detect `.zip` vs `.md`, EN+PL strings. Embeds the §5.6 `.md` as the readable layer; restore prefers JSON. **Restore semantics:** silent 1:1 into an empty DB; into a non-empty DB a "Replace all (recommended) / Add to library" confirm, with a silent safety `.zip` to cache before a Replace; legacy `.md` stays append-only
- [x] **DB schema versioning** — §5.17.4: `PRAGMA user_version` + a migration ladder in `db/client.ts`; stamp `schemaVersion` in `backup.json`; restore from a newer version surfaces a clear message. Prerequisite for safe restore; removes the §9 migration risk
- [x] **Online backup — Level 0 (share sheet)** — §5.17.2: once the archive ships this is ~free; add a Settings hint that the share sheet sends the backup to Drive/Dropbox. EN+PL string
- [x] **Online backup — Level 1 (SAF auto-export)** — §5.17.3: `StorageAccessFramework` folder pick, new `app_settings` keys (`backup_folder_uri`, `backup_last_export_at`, `backup_auto_enabled`) + `db/settings.ts` accessors, pure `utils/backupAuto.ts` retention helpers (`parseKeepCount`/`backupsToPrune`) + change-driven dirty-flag/flush trigger in `utils/backupTrigger.ts` (unit-tested; heavy write deferred to app-background via `flushAutoBackup`), best-effort `runAutoBackupNow` write, "Automatic backup" Settings section with the synced-folder note. **Second approved exception to the no-extra-settings rule (§7), after language (§5.11)**
- [x] **Single-recipe import (link / paste text)** — §5.15: pure parsers in `utils/recipeImport.ts` (`parseRecipeJsonLd`, `parsePastedRecipe`, `parseIsoDuration`) with unit tests, native fetch wrapper `utils/recipeImportFetch.ts`, `components/recipe/ImportSheet.tsx`, an "Import" affordance on the new-recipe form (create mode only) that pre-fills `RecipeFormData` (review-then-save; source URL → notes; photo skipped in v1), EN+PL strings. From-photo OCR and an Android share target are later phases
- [x] **Single-recipe import — From photo (OCR)** — §5.15 T3: on-device ML Kit text recognition (`@react-native-ml-kit/text-recognition`, native module → dev build, `versionCode` bump), pure `ocrBlocksToText` in `utils/ocrText.ts` (unit-tested: y-sorted blocks, line joins, blank-line collapse), native wrapper `utils/recipeOcr.ts` (`recognizeRecipeText` + `isOcrAvailable` gating the tile off in Expo Go/web), "From photo" mode in `ImportSheet` (photo-source ActionSheet → OCR at original resolution → `parsePastedRecipe`; image not attached to the recipe), no-text → switch to Paste-text mode, EN+PL strings
- [x] **Single-recipe import — Transcribe with AI** — §5.15 T4: user-mediated AI handoff (app makes **no network call**, embeds no AI; works in Expo Go, hidden on web), pure `utils/aiTranscribe.ts` (unit-tested: `buildAiTranscribePrompt(lang)` EN/PL parser-contract prompt + idempotent, non-empty-guaranteeing `cleanAiResponse`), "Transcribe with AI" mode in `ImportSheet` (photo-source ActionSheet reusing T3's picker → prompt copied via `expo-clipboard` + photo shared via `expo-sharing` at original resolution, image not attached → user pastes AI answer → `cleanAiResponse` → `parsePastedRecipe`; empty → `import.aiEmpty`, no share sheet → `import.aiNoShare`; `isSharingSupported` gate), EN+PL strings
- [x] **Single-recipe import — Android share target** — §5.15 share target: intent-filter via `expo-share-intent` (shipped on 3.2.3, now `^8` — one major per Expo SDK, see §5.15; `expo-linking` promoted to direct dep; Android-only config plugin `disableIOS`/`androidIntentFilters:["text/*"]`; `versionCode` bump), pure `utils/sharedUrl.ts` (unit-tested: `extractSharedUrl` first-http(s)-URL + trailing-punct/angle-bracket strip + query-string preserve, `toImportIntent` link/never-stranded-paste), cold+warm delivery in `app/_layout.tsx` `ShareIntentHandler` (inside `SnackbarProvider`, `useShareIntent()` + `resetShareIntent` + last-handled-signature ref, cold push from post-mount effect), form-busy guard (`usePathname` `/recipe/new`|`/recipe/edit` → ignore + `share.formBusy` snackbar) else `router.push('/recipe/new', {sharedText})`, `RecipeForm`/`ImportSheet` `initialImport` pre-arm (link auto-fetch, paste prefill; consumed once per open), Expo Go/web degradation via `utils/shareIntent.ts` `isShareIntentAvailable` (mirrors `isOcrAvailable`), EN+PL string

- [x] **To-try recipe status** — §5.19: `to_try` column (DDL + `schema.ts` + migration-ladder `ALTER TABLE`), form switch, card badge, recipe-view badge + "Tried it ✓" (bumps `updated_at` — approved exception, §4), bottom "To try" section in recipe lists (pure partition helper, unit-tested), "To try (N)" filter chip in "All recipes" search, `**Status:** to try` round-trip in `.md` (§5.6/§5.8), `to_try` in `backup.json` + `schemaVersion` bump (§5.17.1/§5.17.4), EN+PL strings
- [x] **Ingredient check-off while cooking** — §5.4: pure `parseIngredientLines` in `utils/ingredients.ts` (rendered lines: `#` headings kept, items carry an index that matches `parseIngredients` 1:1 — unit-tested), `components/recipe/IngredientChecklist.tsx` (checkbox row per ingredient, strike-through + muted when checked, per-line `Markdown` so inline bold survives, icon scales with the text zoom, `**` stripped from the a11y label, `lightTap`), ephemeral checked set in `app/recipe/[id].tsx` reset on ingredients change, "Clear" button in the INGREDIENTS header, EN+PL strings. No DB, no schema, no backup impact
- [x] **Sample content on first launch** — §5.20: pure localized builder `utils/seedData.ts` (EN+PL "Breakfasts"/"Śniadania" cookbook + one photographed pancakes showcase recipe, unit-tested), one-shot seed `db/seed.ts` `seedSampleContentIfNeeded` guarded by `demo_seeded` + `isDatabaseEmpty()` inside `withAutoBackupSuppressed`, bundled photos (`assets/images/seed/pancakes.jpg` recipe photo, `assets/images/seed/breakfast.jpg` cookbook cover) resolved via `expo-asset` + copied into the doc dir through `persistImage` as separate files (best-effort, degrades to no image), `demo_seeded`/`user_edited` flag helpers in `db/settings.ts`, best-effort once-per-process `user_edited` mark on real mutations (`db/userEdited.ts`, skipped while suppressed), `shouldSilentReplace` (pure, unit-tested) + `canSilentReplace()` in `db/backup.ts` wired into the `.zip` restore path (silent 1:1 over a pristine seed), restore stamps both flags, home-screen mount seed after language resolution

### Medium priority
- [x] **Discard-changes confirmations** — "Discard changes?" Alert when closing dirty forms (recipe and cookbook forms)
- [x] **Communicating the lack of backup** — onboarding / info in settings: data lives only on the device, .md export is the only backup
- [x] **Settings screen** — app info, "delete all data" option

### Low priority
- [ ] **Transition animations** — Reanimated 4, especially when opening a recipe
- [x] **Import from .md file** — parsing previously exported files (done — see §5.8)
- [ ] **Tags** — possible return of the feature: global, free-form labels (lowercase + trim, deduplication) + tag filtering; design only once title search stops being enough

---

## 9. Known limitations and risks

**Photos vs cache clearing:**
URIs returned by `expo-image-picker` may point to the system's temporary directory. If the system clears the cache, photos in the app will disappear. Mitigated: on save the file is copied to `documentDirectory` and cleaned up on replace/remove/delete (`utils/imageStorage.ts`, §5.5/§8). Images saved before this change still point at cache URIs and are re-persisted the next time the recipe/cookbook is saved.

**Database migrations — resolved, but carries an upkeep obligation:**
`PRAGMA user_version` + a migration ladder in `db/client.ts` (§5.17.4) shipped; `CURRENT_SCHEMA_VERSION` is currently `2`. The original risk (`CREATE TABLE IF NOT EXISTS` cannot alter existing tables) is gone. What remains is a **discipline requirement, not a defect**: every schema change must edit `db/schema.ts`, the DDL in `db/ddl.ts`, **and** add a ladder step plus bump `CURRENT_SCHEMA_VERSION` — skipping the ladder silently breaks upgrades for existing installs, which testing on a fresh install will not catch. Restoring a backup stamped with a **newer** `schemaVersion` than the running app is refused with a clear message rather than attempted.

**Backup — resolved; the residual risk is now the user's setup, not the format:**
The complete `.zip` archive and both online-backup levels shipped (§5.17): a full-fidelity snapshot (photos, shopping lists, timestamps — everything the `.md` export omits), share-sheet upload to the user's cloud (Level 0), and optional automatic export to a synced folder (Level 1). The `.md` export (§5.6) remains as the human-readable escape hatch, not as the backup of record. Three real limitations survive:

- **Backup is opt-in.** A user who never exports and never enables auto-backup still loses everything on reinstall or a lost device. Communicating the local-only nature in onboarding stays relevant.
- **Auto-backup cannot target Google Drive.** SAF rejects app-controlled writes into Drive-backed folders, so Level 1 means a *locally synced* folder; Drive is reachable only through the share sheet (§5.17.2/§5.17.3, which detect and refuse Drive URIs up front).
- **Backup flows need a real build.** `react-native-zip-archive` is a native module absent from Expo Go, so any export/restore/auto-backup work must be verified on a dev or production build.
