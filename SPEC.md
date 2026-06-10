# KeepTaste — Technical Specification (SDD)

> Living document. Update it with every significant design decision.
> Version: 1.2 | Date: 2026-06

---

## 1. Product goal

A private, local mobile app for storing and managing cooking recipes. Works fully offline — data is stored exclusively on the user's device. No accounts, no cloud sync, no ads. With export capability.

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
| File export | expo-file-system + expo-sharing | Write .md to cache, system share sheet |
| Markdown | react-native-markdown-display | Lightweight library, good support for a Markdown subset |
| Icons | @expo/vector-icons (Ionicons) | Bundled with Expo, zero configuration |
| Language | TypeScript (strict) | Type safety, better DX |

---

## 3. Project architecture

### Directory structure

```
app/
  _layout.tsx            ← root layout: DB initialization, Stack configuration
  index.tsx              ← home screen: list of cookbooks
  cookbook/
    [id].tsx             ← recipe grid; id="all" → all recipes
  recipe/
    [id].tsx             ← recipe view (read-only with Markdown)
    new.tsx              ← modal: new recipe
    edit.tsx             ← modal: edit recipe

components/
  recipe/
    RecipeForm.tsx       ← shared form (new + edit)

db/
  schema.ts              ← Drizzle table definitions + TypeScript types
  client.ts              ← SQLite connection, DDL migrations
  cookbooks.ts           ← queries: cookbook CRUD
  recipes.ts             ← queries: recipe CRUD, search

utils/
  markdown.ts            ← cookbook → .md file export logic
  imageStorage.ts        ← persisting picked images into documentDirectory + cleanup

constants/
  theme.ts               ← design tokens: colors, typography, spacing, shadows
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
```

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
- Displays a **list** of cookbook tiles, stacked vertically, each tile = one cookbook (full width)
- Tiles have rotating background colors from the palette (`cookbookColors` in theme)
- If a cookbook has a cover (`cover_image_path`), the photo covers the background color with a slight dark overlay for title readability
- "+" button in the header, right side → new recipe (with unset `cookbook_id`, since we're not inside any cookbook)
- A fixed "All recipes" row above the list — the **only entry point** to the `/cookbook/all` view
- Long-press on a tile → Alert with options: **Edit / Delete / Cancel**
  - **Edit** → opens the cookbook modal (§5.2) pre-filled with the current name and cover
  - **Delete** → second confirmation Alert with the message: *"Recipes from this cookbook won't be deleted — you'll find them in 'All recipes'."* + Delete (destructive) / Cancel buttons
- The last tile is an empty tile with a plus, "New cookbook" → adds a new cookbook

**Edge cases:**
- No cookbooks → empty state with an icon and a message encouraging the user to create their first one
- Deleting a cookbook does not delete its recipes (see: DB schema)

**Refreshing:** `useFocusEffect` — data is loaded every time the user returns to the screen (e.g. after adding a cookbook).

**Search:**
- Text field filtering by recipe title, across **all** cookbooks
- Case-insensitive comparison, **correct for non-ASCII characters (e.g. Polish diacritics)** — filtering happens on the JS side via `title.toLowerCase().includes(query.toLowerCase())`, not via SQL `LIKE` (which is case-insensitive only for ASCII — searching "żurek" would not find "Żurek")
- Search runs on every text change (no "search" button)
- Empty field → normal view (cookbook list + "All recipes" row)
- Non-empty field → the cookbook list disappears, replaced by a **results list: recipe titles only, stacked vertically, no photos**; tapping a title → recipe view
- No results → grayed-out text *"No results"* (color `textMuted`)

---

### 5.2 Creating and editing a cookbook

**Cookbook form (modal) — shared between create and edit:**
- Field: cookbook name (required)
- Optional: cover (image picker — gallery or camera)

**Entry points:**
- Create: "New cookbook" tile on the home screen → empty form
- Edit: long-press on a cookbook tile → "Edit" → form pre-filled with the current name and cover

**On save:**
- Name is trimmed before saving; empty name → Alert, the form is not saved
- Cover is stored as a local URI (path to a file on the device)
- Edit: saving overwrites the name and cover; removing the cover sets `cover_image_path` to NULL
- Editing the name/cover **does not affect** the recipes in the cookbook

**Abandoning the form:** if the form has unsaved changes, closing the modal (gesture / back / cancel button) → Alert *"Discard changes?"* with options Discard (destructive) / Keep editing.

---

### 5.3 Recipe list in a cookbook

**Behavior:**
- **Tile grid, 2 per row**
- The first tile is a plus tile, "Add recipe"
- URL `/cookbook/[id]` — recipes assigned to a specific cookbook
- URL `/cookbook/all` — all recipes from all cookbooks and unassigned ones
- Recipes sorted descending by `updated_at` (most recently modified on top)
- Each tile shows: photo thumbnail (or placeholder), title, total time (prep + cook), number of servings. **Missing metadata (time, servings) is hidden** — we don't show "—" or empty labels
- "+" button in the header → new recipe (with pre-filled `cookbook_id` when inside a specific cookbook)
- Three-dot icon in the header → drop-down menu; it contains an "Export" item with an export icon. Available only in a specific cookbook's view, not in "All recipes"

**Edge cases:**
- Empty cookbook → only the "Add recipe" tile is visible; no extra empty state needed

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
- Edit button (create-outline) → opens `/recipe/edit?id=X`
- Delete button (trash) → confirmation Alert; on confirm, deletes and goes back

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
| Ingredients | TextInput multiline | NO | Raw text, supports Markdown |
| Instructions | TextInput multiline | NO | Raw text, supports Markdown |
| Notes | TextInput multiline | NO | Exported together with the recipe (it's a cookbook, not a diary) |

**Validation:**
- The only required field: title. Missing title → `Alert` with a message, the form is not saved.
- Numeric fields — **unambiguous parsing rule:** the value is parsed to an integer (`parseInt`); it is saved only if the result is an integer ≥ 1. Everything else (empty field, text, zero, negative values, `NaN`) → we save `null`. Implementation note: the pattern `value ? Number(value) : null` is **wrong** — for text it saves `NaN` to the database.

**Photo:**
- Tap on the photo area → Alert with options: Gallery / Camera / Remove photo (if one exists)
- Photo processed by ImagePicker with `allowsEditing: true`, aspect ratio 4:3, quality 0.8
- The photo file is **copied to `FileSystem.documentDirectory`** when the recipe is saved (the picker URI points to the system cache, which may be cleared — see §8, high priority); the same applies to cookbook covers
- Deleting a recipe/cookbook or replacing a photo → delete the copied file from `documentDirectory` (cleanup so the directory doesn't grow indefinitely)

**Abandoning the form:** if the form has unsaved changes, closing the modal (gesture / back / cancel) → Alert *"Discard changes?"* with options Discard (destructive) / Keep editing.

**New vs edit:**
- `new.tsx` — starts with an empty form, optionally accepts `cookbookId` as a URL param
- `edit.tsx` — loads the recipe data from the database, fills the form, calls `updateRecipe` instead of `createRecipe` on save

---

### 5.6 Exporting a cookbook to Markdown

**Trigger:** three-dot icon in the `/cookbook/[id]` screen header → drop-down → "Export" (unavailable in the "All recipes" view).

**Format of the resulting `.md` file:**

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
```

**Implementation details:**
- Recipes in the file are sorted the same as in the list (descending by `updated_at`)
- The metadata line (`**Prep:** ... | ...`): segments without a value are **omitted**; if a recipe has no metadata at all, the whole line is omitted
- The "Notes" section appears in the file only if the `notes` field is not empty
- Export date in `DD/MM/YYYY` format
- The file is written to `FileSystem.cacheDirectory`, then shared via `Sharing.shareAsync()`
- The user decides what to do with the file (save to Drive, email it, AirDrop, etc.) — the app does not manage this process

**File name:** `{cookbook_name}.md`, where the name is sanitized:
- characters not allowed in file names are removed: `/ \ : * ? " < > |` plus control characters
- spaces and dots trimmed at both ends, sequences of spaces reduced to one
- non-ASCII letters (e.g. Polish diacritics) are **preserved**
- if the name is empty after sanitization → fallback `recipes.md`

**Time format (in the app and in export):**
- < 60 min → `"45 min"`
- ≥ 60 min → `"1 hr 30 min"` or `"2 hr"` (no minutes if = 0)
- No value → item hidden / omitted (see §5.3, §5.4 and above)

### 5.7 Settings

**Entry point:** a gear icon (`settings-outline`) in the home screen header, next to the "+" button. Tapping it pushes the `/settings` screen (a regular card, with its own in-screen back header — not a modal).

**Content:**
- **App info** — the app name ("KeepTaste") and version, read from `Constants.expoConfig?.version` (fallback `1.0.0`).
- **Data / no-backup notice** — explains that recipes are stored only on this device, that there are no accounts and no cloud sync, that uninstalling the app deletes all recipes, and that exporting a cookbook to Markdown (§5.6) is the only backup mechanism.
- **Delete all data** — a destructive button that wipes every cookbook and recipe.

**Delete all data flow:**
- Double confirmation: first an `Alert` ("Delete all data?") explaining what will be removed, then on confirm a second `Alert` warning the action cannot be undone. Both use destructive button styles.
- On final confirm: `deleteAllData()` (in `db/recipes.ts`) deletes all recipes then all cookbooks (in that order) and returns the stored image paths; the screen then deletes those image files via `deleteStoredImage` and navigates back home (which reloads via `useFocusEffect`).

---

## 6. Design system

All tokens live in `constants/theme.ts`. Components do not use hardcoded color, size, or shadow values.

### Color palette

| Token | Value | Usage |
|---|---|---|
| `primary` | `#C84B31` | Actions, CTA buttons, accents |
| `background` | `#FAFAF7` | Screen backgrounds |
| `surface` | `#FFFFFF` | Cards, inputs |
| `surfaceAlt` | `#F5F3EE` | Tabs, note boxes |
| `text` | `#1A1714` | Primary text |
| `textSecondary` | `#6B6560` | Labels, section headings |
| `textMuted` | `#A09890` | Placeholders, metadata, "No results" |
| `border` | `#E8E4DE` | Borders |

### Design philosophy
A warm, appetizing palette evoking the kitchen — paper, wood, ceramics. Not sterile white, not cold grays. Minimalist hierarchy without unnecessary decoration.

### Dark mode

**UX principle:** the app follows the system setting (`useColorScheme()` from React Native). **No in-app toggle** — zero extra settings, in line with the simplicity philosophy.

**Mechanism:**
- `theme.ts` exports two palettes (`light` / `dark`) with an identical set of tokens; the remaining tokens (typography, spacing, shadows) are shared
- Components get colors through a `useTheme()` hook (a thin wrapper over `useColorScheme()`), not by importing a palette directly — switching is centralized and components don't know which mode is active
- Components already avoid hardcoded colors today, so the migration boils down to swapping the token source

**Dark palette** — same philosophy: warm, not pitch black, not cold:

| Token | Value | Notes |
|---|---|---|
| `primary` | `#E06A4F` | Lightened primary for contrast on a dark background |
| `background` | `#1C1814` | Warm dark base (not #000) |
| `surface` | `#262019` | Cards, inputs |
| `surfaceAlt` | `#2F2820` | Tabs, note boxes |
| `text` | `#F0EBE4` | Primary text |
| `textSecondary` | `#A89F95` | Labels, section headings |
| `textMuted` | `#7A716A` | Placeholders, metadata, "No results" |
| `border` | `#3A322A` | Borders |

Values to be verified on a device for contrast (target: WCAG AA for text). Photos and covers unchanged; the dark overlay on cookbook covers (§5.1) works in both modes.

---

## 7. Out of scope (deliberate decisions)

| Feature | Reason for omission |
|---|---|
| Cloud sync | Complexity, infrastructure costs, privacy concerns |
| User accounts | Same as above — the app is deliberately private and local |
| Tags (recipe labels + filtering) | Removed from the MVP — title search is enough to start; may return in the future (see §8) |
| Ingredient scaling (servings multiplier) | Ingredients are text, not structured data — parsing would be brittle |
| Cooking mode (step-by-step active screen) | Complexity, beyond MVP |
| Importing recipes from a URL | Page-parsing complexity, beyond MVP |
| Sharing recipes between users | Requires a backend |
| Drag & drop step reordering | Steps live in one text field, not separate records |
| Notifications / timers | Out of scope |
| Manual dark mode toggle in the app | Dark mode follows the system setting only (§6) — no extra settings |

---

## 8. TODO — open items

### High priority
- [x] **Remove tags from the existing code** — drop the `tags`/`recipe_tags` tables (DDL + `DROP TABLE IF EXISTS` for existing dev installs), fields in `schema.ts`, the tags field in `RecipeForm`, chips in the recipe view, and the section in export
- [x] **Cookbook create/edit modal** — form with a name field and an image picker for the cover (replacing the `Alert` placeholder in `index.tsx`); editing available via long-press on a tile; long-press also gains an "Edit" option and a second delete confirmation with a message about recipes surviving (§5.1, §5.2)
- [x] **Copying photos to `documentDirectory`** — critical data-loss risk: the image picker URI points to the system cache. Done in `utils/imageStorage.ts`: (1) on recipe/cookbook save the picked file is copied to `FileSystem.documentDirectory`, (2) the stored copy is deleted when the record is deleted or the photo is replaced/removed, (3) covers both recipe `image_path` and cookbook `cover_image_path`; graceful no-op on web (`documentDirectory` is null there)
- [x] **Correct numeric field parsing** — the current pattern `value ? Number(value) : null` saves `NaN` for text; implement the rule from §5.5 (integer ≥ 1 or `null`)
- [x] **Diacritics-safe search** — replace SQL `LIKE` with JS-side `toLowerCase()` filtering (§5.1)

### Medium priority
- [x] **Discard-changes confirmations** — "Discard changes?" Alert when closing dirty forms (recipe and cookbook forms)
- [x] **Communicating the lack of backup** — onboarding / info in settings: data lives only on the device, .md export is the only backup
- [x] **Settings screen** — app info, "delete all data" option

### Low priority
- [ ] **Transition animations** — Reanimated 3, especially when opening a recipe
- [ ] **Import from .md file** — parsing previously exported files
- [ ] **Tags** — possible return of the feature: global, free-form labels (lowercase + trim, deduplication) + tag filtering; design only once title search stops being enough

---

## 9. Known limitations and risks

**Photos vs cache clearing:**
URIs returned by `expo-image-picker` may point to the system's temporary directory. If the system clears the cache, photos in the app will disappear. Mitigated: on save the file is copied to `documentDirectory` and cleaned up on replace/remove/delete (`utils/imageStorage.ts`, §5.5/§8). Images saved before this change still point at cache URIs and are re-persisted the next time the recipe/cookbook is saved.

**Database migrations:**
The current mechanism (`CREATE TABLE IF NOT EXISTS`) does not handle schema changes to existing tables. Any future column change requires a manual `ALTER TABLE` or a data migration in `client.ts`.

**No backup:**
The user can lose data when reinstalling the app or formatting the device. The only protection mechanism is Markdown export. Communicating this in onboarding — medium-priority TODO (§8).
