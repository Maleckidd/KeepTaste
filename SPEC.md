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
| Framework | React Native 0.76 | One codebase for Android and iOS |
| Expo SDK | 52 | Faster setup, manages native modules without ejecting |
| Navigation | Expo Router 4 | File-based navigation, typed routes, deep linking out of the box |
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
    ImportSheet.tsx      ← single-recipe import: link / paste-text mode picker (§5.15)
  ui/                    ← base components (§6): Button, IconButton, Input,
                           Card-level pieces, ScreenHeader, ModalHeader, Fab,
                           EmptyState, ActionSheet, SwipeableRow, SnackbarProvider

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
  settings.ts            ← key-value app settings (language preference, §5.11)

utils/
  markdown.ts            ← pure per-recipe / per-cookbook-body .md builders + formatTime (§5.6)
  backupMarkdown.ts      ← pure full-app backup builder + §Uncategorized sentinel (§5.6)
  backupExport.ts        ← native: gather sections, write backup .md to cache, share (§5.6)
  importMarkdown.ts      ← parser for backup / legacy .md files (parseBackupMarkdown, §5.8)
  recipeShareText.ts     ← pure localized recipe → plain-text builder (§5.13)
  cookbookPdfHtml.ts     ← pure localized cookbook → HTML builder (§5.14)
  cookbookPdf.ts         ← native: HTML → PDF via expo-print, share (§5.14)
  imageStorage.ts        ← persisting picked images into documentDirectory + cleanup
  cookbookForm.ts        ← cookbook form logic (normalize, dirty-check)
  recipeForm.ts          ← recipe form logic (mapping, dirty-check)
  numeric.ts             ← numeric field parsing (integer ≥ 1 or null)
  search.ts              ← diacritics-safe title search
  shoppingList.ts        ← shopping list logic: partition, counts, input normalization
  ingredients.ts         ← pure parser: ingredients Markdown → shopping item candidates (§5.12)
  recipeImport.ts        ← pure parsers: Recipe JSON-LD + pasted-text → RecipeFormData (§5.15)
  recipeImportFetch.ts   ← native: fetch a recipe URL's HTML for parsing (§5.15)
  i18n.ts                ← pure i18n logic: preference/locale resolution, interpolation, PL plurals

constants/
  theme.ts               ← design tokens: light/dark palettes + useTheme(), typography, spacing, shadows
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
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)

app_settings (                                   -- key-value preferences (§5.11)
  key             TEXT PRIMARY KEY NOT NULL,      -- e.g. 'language'
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
- **`updated_at`** — updated **only when saving a recipe edit**. Merely opening or viewing a recipe does not change `updated_at` (and therefore the sort order).
- **`notes` field** — empty string and `NULL` are treated identically (no note) in all views and in export.
- **Dates** — stored as ISO 8601 strings (TEXT), not UNIX timestamps. More readable when debugging and exporting.

### Migrations

Migrations are hand-written as `CREATE TABLE IF NOT EXISTS` in `db/ddl.ts` (shared by the native client `db/client.ts` and the web test client `db/client.web.ts`) and run synchronously at app startup (`runMigrations()` in `_layout.tsx`). We do not use automatic Drizzle Kit migrations on a mobile device — too risky during app updates. For breaking changes, a migration will be added as an `ALTER TABLE` or a data migration.

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
- "+" button in the header → new recipe (with pre-filled `cookbook_id` when inside a specific cookbook)
- **Share (PDF) icon in the header** → generates and shares the cookbook as a PDF (§5.14). Available only in a specific cookbook's view, not in "All recipes"

**Search (only in the `/cookbook/all` view):**
- Text field above the list, filtering by recipe title across **all** cookbooks
- Case-insensitive comparison, **correct for non-ASCII characters (e.g. Polish diacritics)** — filtering happens on the JS side via `title.toLowerCase().includes(query.toLowerCase())`, not via SQL `LIKE` (which is case-insensitive only for ASCII — searching "żurek" would not find "Żurek")
- Search runs on every text change (no "search" button); tapping a result opens the recipe view
- No results → grayed-out text *"No results"* (color `textMuted`)
- The field is **not shown** in a specific cookbook's view — search is global by design

**Edge cases:**
- Empty cookbook → empty state with an icon and a "tap + to add" message

---

### 5.4 Recipe view

**Sections:**
- Photo (full width, 240px tall) or a gray placeholder
- Title
- Metadata: prep time, cook time, total time, servings — **items without a value are hidden** (no "—"); if all are missing, the whole metadata row disappears
- **Ingredients** and **Instructions** as two stacked sections of a single scrollable view (no tabs, no switching) — each with an uppercase section header; an empty section is hidden entirely (consistent with the no-placeholder rule)
- Section content rendered by `react-native-markdown-display`
- Notes (if present) — highlighted box with a left border in the primary color

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
- **Export all data** — a button (in the "Your data" section) that writes the whole library to a single Markdown backup and opens the share sheet (§5.6). On failure surfaces `Alert('Export failed', …)`.
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

### 5.15 Importing a single recipe (link / paste text)

A low-effort way to add **one** recipe from an external source by pre-filling the recipe form, instead of typing everything by hand. **Deterministic only — no AI, no network "smart parsing" service** — so the local-first, private philosophy (§1) is preserved: the only network call is a user-initiated `fetch` of a URL the user pasted, which goes straight to that site (no backend, nothing synced).

This is distinct from the full-app Markdown **backup** import (§5.8), which restores a whole library from KeepTaste's own export format. §5.15 imports a single recipe from arbitrary external content into a form the user then reviews.

**Scope:** two modes ship now — **From link** (T1) and **Paste text** (T2). **From a photo (OCR)** is a planned later phase (§8) — it needs an on-device OCR native module (ML Kit / Vision) and a development build, so it is deliberately out of this iteration. Importing video / transcripts (YouTube, Reels, TikTok video) and scraping raw HTML when no structured data exists stay **out of scope** (§7).

**Entry point:** an **"Import"** affordance on the **new-recipe form** (`RecipeForm` in create mode only — never in edit mode), placed above the title field. Tapping it opens the **Import sheet** (a themed bottom sheet, same overlay pattern as `ActionSheet`/`FormattingHelpSheet`, §6) with a mode picker: **From link**, **Paste text** (and later **From photo**). The single recipe-creation entry point (FAB → new recipe) is unchanged; import lives inside it.

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

**Implementation notes:**
- All parsing is **pure logic in `utils/recipeImport.ts`** (`parseRecipeJsonLd`, `parsePastedRecipe`, `parseIsoDuration`) → unit-tested in `__tests__/` via the TDD pipeline (tester → coder). The only native part is a thin `fetch` wrapper, `utils/recipeImportFetch.ts` (`fetchRecipeFromUrl`), consistent with the pure-builder + native-wrapper split used by export/PDF (§5.6/§5.14).
- The sheet (`components/recipe/ImportSheet.tsx`) maps a parse result onto a partial `RecipeFormData` and hands it back to the open `RecipeForm`.
- **Platforms:** `fetch` of an arbitrary recipe site works on native only. On the web test build it will typically fail CORS — link import is **not** expected to work there (web is a test environment only, §2); the pure parsers are still exercised by unit tests.
- **i18n:** all new strings (Import affordance, sheet title, mode labels, URL/paste placeholders, the "couldn't read this page" message, network/error messages, the `Source:` prefix) get EN + PL entries in `i18n/dictionary.ts` (§5.11). The `Source:` prefix is localized to the UI language (it lands in user-facing notes, not the English-only backup format).

**Optional later convenience (not required for v1):** an Android **share target** so the user can share a link from the browser directly into KeepTaste, landing on the new-recipe form with From-link import pre-run. Deferred — needs native intent-filter config; the in-app "Import → From link" path covers the same need first.

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

- `backup.json` carries `schemaVersion` (see 5.17.4), all cookbooks (incl. `cover_image_path`), all recipes (incl. `created_at` / `updated_at` / `image_path`), all `shopping_lists` + `shopping_items`, and `app_settings`. Photo fields store the **relative** `images/<file>` path, not the device URI.
- `recipes.md` stays English-only and byte-identical to the §5.6 output, so the readability/round-trip promise (§1) is untouched even if `backup.json` is never opened by a human.
- **Restore prefers `backup.json`**; a `.zip` with no JSON (or a plain legacy `.md`, §5.8) falls back to the Markdown path. A `.md` import remains supported forever (backward compatibility).

**Restore semantics (replace vs add).** Driven by the user stories: the word "restore" means "my data becomes the backup," yet the dominant case — disaster recovery into a fresh install — has an **empty** database where replace and append are identical. So:
- **Empty database → silent clean restore.** No prompt; the archive is simply restored 1:1.
- **Non-empty database → a confirm dialog with two choices:**
  - **Replace all** *(recommended, default)* — wipe via `deleteAllData()` (it already returns stored image paths for cleanup, then delete those files) and `restoreFullBackup` → a faithful 1:1 copy. Covers "test my backup" and "undo a mess," which append would turn into a full-library duplicate.
  - **Add to library** — the existing append behavior (duplicates allowed, §5.8 semantics) for the merge / combine-two-devices case.
  - Cancel.
- **Before a Replace, write a silent safety `.zip` to `cacheDirectory`** (best-effort, reusing the export builder) so a mis-tap is recoverable.
- **The legacy `.md` import stays append-only** — it cannot be a faithful 1:1 restore anyway (it omits photos, lists, timestamps), so it does not offer Replace.

**ZIP library:** `jszip` (pure JS — works in Expo Go, **no dev/custom build**). The native `react-native-zip-archive` is deliberately avoided (would force a custom build). Known limit: jszip holds image bytes in memory (base64) during pack/unpack — very large photo libraries risk OOM; acceptable for the MVP, revisit with streaming if it bites.

**New/changed code:**
- *Pure (unit-tested, TDD pipeline per CLAUDE.md):* `utils/backupArchive.ts` — `buildBackupJson(data): string` and `parseBackupJson(text): BackupData` (validates `schemaVersion`). Tests in `__tests__/backupArchive.test.ts`.
- *Data layer:* `db/recipes.ts` `getFullBackupData()` (gathers everything `getBackupSections` omits); `db/import.ts` `restoreFullBackup(data)`. Restore must **preserve timestamps**, so add `createRecipeRaw` / `createCookbookRaw` that accept explicit `created_at` / `updated_at` / image paths (the existing `createRecipe` overwrites both with `now`).
- *Native I/O:* `utils/backupArchiveFs.ts` — `exportBackupZip(dialogTitle)` (gather → build JSON + MD → read `images/` → jszip → write to `cacheDirectory` → `Sharing.shareAsync(uri, { mimeType: 'application/zip' })`) and `importBackupZip(uri)` (unzip → `parseBackupJson` → restore photos into `documentDirectory` with fresh `generateImageFilename` names, remapping old→new paths → `restoreFullBackup`).
- *UI:* `app/settings.tsx` — `handleExportAll` calls `exportBackupZip`; `handleImport` detects `.zip` vs `.md` and routes accordingly. New EN+PL strings in `i18n/dictionary.ts`.

#### 5.17.2 Level 0 — share to Drive (free once 5.17.1 ships)

`exportBackupZip` already hands the file to the system share sheet, where **"Save to Drive" / "Upload to Drive"** (and Dropbox, email, etc.) appear as targets on Android. No extra export code. Settings gains a one-line hint that the share sheet is how you send a backup to the cloud. This covers "online backup" for most users with **zero** OAuth, accounts, or provider integration.

#### 5.17.3 Level 1 — automatic export to a chosen folder (SAF)

A "set and forget" option: the app writes a dated archive to a folder the user picks once; if that folder is synced by a cloud app, the backup goes online automatically. The app still knows nothing about any network.

- **Mechanism:** `expo-file-system` `StorageAccessFramework` (works in Expo Go on Android). `requestDirectoryPermissionsAsync` once → persisted URI → `createFileAsync` writes `keeptaste-backup-YYYY-MM-DD.zip`. **Write-then-prune ordering:** `writeBackupToFolder` first lists the folder and *computes* which archives to prune (`backupsToPrune`: any same-day archive plus everything beyond the chosen retention count), but only **after** the new archive is successfully written does it delete them. This guarantees an existing backup is never removed before its replacement is on disk — if the write throws, nothing is pruned. Trade-off: a second backup on the same day briefly coexists with the old same-day file, so SAF may hand the new write a `... (1).zip` suffix before the old one is pruned; the filename alternates between the clean name and the `(1)` variant across same-day writes, but the file **count** always settles at `backup_keep`.
- **New `app_settings` keys** (the table already exists — no `ALTER`): `backup_folder_uri`, `backup_last_export_at` (ISO), `backup_auto_enabled` (`'0'`/`'1'`), `backup_keep` (retention count; default 2 — keeps one prior generation so a corrupt or interrupted new write is still recoverable). Getters/setters in `db/settings.ts` (mirror the `language` pattern).
- **Pure decisions (unit-tested):** `utils/backupAuto.ts` `parseKeepCount(raw, fallback)` and `backupsToPrune(uris, todayDate, keep): string[]`; the debounce/suppression logic in `utils/backupTrigger.ts` (`scheduleAutoBackup`, `withAutoBackupSuppressed`) is also unit-tested.
- **Retention UI:** the "Automatic backup" Settings section offers a "Backups to keep" picker (`AUTO_BACKUP_KEEP_OPTIONS` = 1/2/3/7/14/30) once a folder is set.
- **Trigger:** change-driven, not scheduled. A backup is scheduled whenever a **recipe or cookbook** is created/edited/deleted (the `db/recipes.ts` and `db/cookbooks.ts` mutations call `scheduleAutoBackup`); shopping lists/items and settings never trigger. `utils/backupTrigger.ts` debounces with a ~2.5s trailing window so a burst of edits collapses into one async write (`runAutoBackupNow`), which never blocks the db call. Bulk import/restore is wrapped in `withAutoBackupSuppressed` so the many internal creates fire a single backup at the end, reflecting the final data. `runAutoBackupNow` is best-effort and silent: if enabled and a folder is set → `writeBackupToFolder`, then stamp `backup_last_export_at`. There is no startup/daily schedule.
- **UI:** a new "Automatic backup" Settings section — pick folder, on/off toggle, "Last backup: …" line, and a note that a folder synced by **Dropbox/Nextcloud/Drive-desktop** is the reliable choice (plain Google Drive on Android exposes a DocumentsProvider, not a normally synced local folder, so for Drive the share sheet of Level 0 is more dependable).

**Deliberately out of scope:** direct **Google Drive / Dropbox API** integration (OAuth, account sign-in, app folders). It is the most work, requires a dev build + Google app verification, and breaks "no accounts" (§7) for little gain over the share sheet. See §7.

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

**UX principle:** the app follows the system setting (`useColorScheme()` from React Native). **No in-app toggle** — zero extra settings, in line with the simplicity philosophy.

**Mechanism:**
- `theme.ts` exports two palettes, `lightColors` / `darkColors`, with an identical set of tokens; the remaining tokens (typography, spacing, shadows) are shared
- Components get colors through the `useTheme()` hook (a thin wrapper over `useColorScheme()`), not by importing a palette directly — switching is centralized and components don't know which mode is active
- Components build their stylesheets with `makeStyles(palette)` factories (and, where present, `makeMarkdownStyles(palette)`), memoized on the active palette via `useMemo` so styles rebuild when the system scheme changes; inline JSX color props read straight from the palette

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
| Direct Google Drive / Dropbox API integration (OAuth, account sign-in, app folders) | Most work, needs a dev build + provider app verification, and breaks "no accounts" — for little gain over the system share sheet (§5.17.2). Online backup is achieved via the share sheet (Level 0) or a user-chosen synced folder (Level 1, SAF) |
| User accounts | Same as above — the app is deliberately private and local |
| Tags (recipe labels + filtering) | Removed from the MVP — title search is enough to start; may return in the future (see §8) |
| Ingredient scaling (servings multiplier) | Ingredients are text, not structured data — parsing would be brittle |
| Cooking mode (step-by-step active screen) | Complexity, beyond MVP. The *reading-view* affordances a cook actually needs — keep-awake and in-recipe text zoom (A−/A+) — already ship on the recipe view (§5.4/§6); only the dedicated one-step-at-a-time screen stays out |
| AI / network "smart parsing" for recipe import | Breaks the local-first, no-backend philosophy (§1); per-call cost. Single-recipe import stays deterministic (§5.15) |
| Scraping raw HTML when a page has no structured data | Brittle, garbage-prone. Link import (§5.15) reads Schema.org `Recipe` JSON-LD only; otherwise it falls back to paste-text |
| Importing recipes from video / transcripts (YouTube, Reels, TikTok video) | Needs transcription + AI; out of scope. Captions can be pasted as text (§5.15) |
| Sharing recipes between users | Requires a backend |
| Drag & drop step reordering | Steps live in one text field, not separate records |
| Notifications / timers | Out of scope |
| Manual dark mode toggle in the app | Dark mode follows the system setting only (§6) — no extra settings |
| App language selection | **User-approved exception** to the no-extra-settings rule (the only in-app preference; §5.11). The UI is bilingual EN/PL; the Markdown export/import data format stays English-only |

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
- [ ] **Add ingredients to a shopping list** — the recipe→shopping bridge per §5.12: line-based ingredient parser (`utils/ingredients.ts`), picker modal (`app/recipe/add-to-list.tsx`), bulk insert `createShoppingItems` in `db/shoppingLists.ts`, "Add to shopping list" button in the recipe view, EN+PL strings
- [x] **Complete backup archive (.zip) — foundation** — §5.17.1: `utils/backupArchive.ts` (`buildBackupJson` / `parseBackupJson`, unit-tested), `db/backup.ts` (`getFullBackupData()`, `isDatabaseEmpty()`, timestamp-preserving + id-remapping `restoreFullBackup()`, unit-tested), native `utils/backupArchiveFs.ts` (`exportBackupZip` / `loadBackupZip` / `commitBackupRestore`) via `jszip`, Settings export/import wired to detect `.zip` vs `.md`, EN+PL strings. Embeds the §5.6 `.md` as the readable layer; restore prefers JSON. **Restore semantics:** silent 1:1 into an empty DB; into a non-empty DB a "Replace all (recommended) / Add to library" confirm, with a silent safety `.zip` to cache before a Replace; legacy `.md` stays append-only
- [x] **DB schema versioning** — §5.17.4: `PRAGMA user_version` + a migration ladder in `db/client.ts`; stamp `schemaVersion` in `backup.json`; restore from a newer version surfaces a clear message. Prerequisite for safe restore; removes the §9 migration risk
- [x] **Online backup — Level 0 (share sheet)** — §5.17.2: once the archive ships this is ~free; add a Settings hint that the share sheet sends the backup to Drive/Dropbox. EN+PL string
- [x] **Online backup — Level 1 (SAF auto-export)** — §5.17.3: `StorageAccessFramework` folder pick, new `app_settings` keys (`backup_folder_uri`, `backup_last_export_at`, `backup_auto_enabled`) + `db/settings.ts` accessors, pure `utils/backupAuto.ts` retention helpers (`parseKeepCount`/`backupsToPrune`) + change-driven debounced trigger in `utils/backupTrigger.ts` (unit-tested), best-effort `runAutoBackupNow` write, "Automatic backup" Settings section with the synced-folder note. **Second approved exception to the no-extra-settings rule (§7), after language (§5.11)**
- [x] **Single-recipe import (link / paste text)** — §5.15: pure parsers in `utils/recipeImport.ts` (`parseRecipeJsonLd`, `parsePastedRecipe`, `parseIsoDuration`) with unit tests, native fetch wrapper `utils/recipeImportFetch.ts`, `components/recipe/ImportSheet.tsx`, an "Import" affordance on the new-recipe form (create mode only) that pre-fills `RecipeFormData` (review-then-save; source URL → notes; photo skipped in v1), EN+PL strings. From-photo OCR and an Android share target are later phases

### Medium priority
- [x] **Discard-changes confirmations** — "Discard changes?" Alert when closing dirty forms (recipe and cookbook forms)
- [x] **Communicating the lack of backup** — onboarding / info in settings: data lives only on the device, .md export is the only backup
- [x] **Settings screen** — app info, "delete all data" option

### Low priority
- [ ] **Transition animations** — Reanimated 3, especially when opening a recipe
- [x] **Import from .md file** — parsing previously exported files (done — see §5.8)
- [ ] **Tags** — possible return of the feature: global, free-form labels (lowercase + trim, deduplication) + tag filtering; design only once title search stops being enough

---

## 9. Known limitations and risks

**Photos vs cache clearing:**
URIs returned by `expo-image-picker` may point to the system's temporary directory. If the system clears the cache, photos in the app will disappear. Mitigated: on save the file is copied to `documentDirectory` and cleaned up on replace/remove/delete (`utils/imageStorage.ts`, §5.5/§8). Images saved before this change still point at cache URIs and are re-persisted the next time the recipe/cookbook is saved.

**Database migrations:**
The current mechanism (`CREATE TABLE IF NOT EXISTS`) does not handle schema changes to existing tables. Any future column change requires a manual `ALTER TABLE` or a data migration in `client.ts`. **Being addressed** by `PRAGMA user_version` + a migration ladder (§5.17.4), introduced as a prerequisite for safe backup restore.

**No / incomplete backup:**
The user can lose data when reinstalling the app or formatting the device. The Markdown export (§5.6) is the only protection today and is **incomplete** — it omits photos, shopping lists, and timestamps. **Being addressed** by the complete `.zip` archive and online-backup options (§5.17): a full-fidelity snapshot, share-sheet upload to the user's cloud (Level 0), and optional automatic export to a synced folder (Level 1). Communicating the local-only nature in onboarding stays relevant regardless.
