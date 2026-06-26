# KeepTaste — Manual Test Plan (Mobile)

> Companion to [SPEC.md](SPEC.md). Covers everything that **cannot** be verified by the
> automated layers (unit tests for pure logic, browser smoke tests on the web build):
> native modules, Alert dialogs, gestures, permissions, file system, share sheet.
> Version: 1.0 | Date: 2026-06

---

## 1. Scope and test strategy

The project uses a layered verification strategy; this document is the top layer:

| Layer | Tool | What it covers |
|---|---|---|
| Unit tests | `npm test` (jest) | Pure logic: `db/` query helpers, `utils/` (parsing, search, dirty-checks, image-path decisions, export format) |
| Type check | `npx tsc --noEmit` | Strict TypeScript across the codebase |
| Web smoke | Playwright on `npm run web` | Browser-driven flows: form → save → list, navigation, rendering |
| **Manual (this plan)** | Expo Go / dev build on device | Alerts, image picker, camera, permissions, file persistence, share sheet, gestures, app lifecycle |

**Why manual:** `Alert.alert` is a no-op on web, the in-memory web DB resets on
reload, and `expo-file-system` / `expo-image-picker` / `expo-sharing` have no web
implementation. Every test case below exercises at least one of those gaps.

### Out of scope of this plan
- Web-only behavior (the web build is a test environment, not a product platform — SPEC §2).
- Features not implemented yet: animations, tags (SPEC §7/§8). Dark mode (SPEC §6), Markdown import (§5.8), and single-recipe import (§5.15) are implemented and covered below (DM, MI, and RI cases).
- Performance/load testing — the app is local-only and single-user; not a current risk.

---

## 2. Test environment

### Device matrix

| # | Device class | OS | Priority | Notes |
|---|---|---|---|---|
| E1 | Physical Android phone | Android 13+ | **P0 — primary** | Android is the primary platform (SPEC §2) |
| E2 | Android emulator | Android 13+ | P1 | Camera cases limited (emulated camera) |
| E3 | Physical Android, small screen / older OS | Android 10–12 | P2 | Layout + permission-dialog differences |
| E4 | iPhone (Expo Go) | iOS 17+ | P2 | Planned platform; run the smoke suite only |

### Preconditions for every session
1. `npm test` green and `npx tsc --noEmit` clean on the commit under test (entry criteria).
2. App installed fresh **or** state reset via Settings → Delete all data (each case states which).
3. Language is bilingual (EN/PL, §5.11). Unless a case says otherwise, set the in-app Language to **English** (Settings → Language → English) so expected strings match; the I18N cases below cover the Polish and device-locale paths explicitly.
4. For permission cases: app permissions reset (`Settings → Apps → Expo Go → Permissions` or `adb shell pm reset-permissions`).

### Standard test data
- **Cookbook A**: name `Desserts`, with cover photo.
- **Cookbook B**: name `Zupy i żurki` (Polish diacritics), no cover.
- **Recipe R1**: title `Strawberry Tart`, prep 15, cook 45, servings 4, photo, ingredients/instructions with Markdown (`# heading`, `**bold**`, `- bullets`), notes filled.
- **Recipe R2**: title `Żurek staropolski` (diacritics), title only — all other fields empty.
- **Recipe R3**: title `Quick Salad`, no photo, prep 5 only.

---

## 3. Conventions

- **ID scheme**: `<AREA>-<number>` — CB cookbooks, RC recipe create/edit, RV recipe view, LS lists & sorting, SR search, IM image persistence, EX export, DC discard dialogs, ST settings, PM permissions, LC app lifecycle.
- **Priority**: P0 = smoke (run on every build), P1 = full pass before release, P2 = extended/edge.
- **Result recording**: Pass / Fail / Blocked, with device ID from the matrix. A Fail needs: steps to reproduce, expected vs actual, screenshot/screen recording, device + OS.
- Each case lists the SPEC section it traces to.

---

## 4. Test cases

### CB — Cookbooks (SPEC §5.1, §5.2)

**CB-01 · P0 · Create a cookbook (name only)**
Pre: fresh state.
1. Home → tap "+" area for a new cookbook.
2. Enter name `Desserts`, do not add a cover. Save.
- Expected: modal closes, tile `Desserts` appears on Home with a palette background color and book icon. No crash, no placeholder image.

**CB-02 · P1 · Create a cookbook with a cover from gallery**
1. New cookbook → tap cover area → choose **Gallery** → pick an image, confirm crop (4:3).
2. Name `Zupy i żurki`. Save.
- Expected: tile shows the photo with a dark overlay; the name stays readable on top of it.

**CB-03 · P1 · Empty name is rejected**
1. New cookbook → leave name empty (also try spaces only: `   `). Save.
- Expected: Alert about the missing name; modal stays open; nothing saved (Home unchanged after cancel).

**CB-04 · P0 · Edit a cookbook via long-press**
Pre: CB-01 done.
1. Long-press the `Desserts` tile.
2. Alert shows **Edit / Delete / Cancel** → tap Edit.
- Expected: modal opens pre-filled with the current name (and cover if present). Change name to `Desserts & Cakes`, save → tile updates.

**CB-05 · P1 · Editing a cookbook does not touch its recipes**
Pre: cookbook with ≥1 recipe.
1. Edit the cookbook: change name and replace the cover. Save.
2. Open the cookbook.
- Expected: all recipes still present and unchanged (titles, photos, sort order).

**CB-06 · P0 · Delete a cookbook — recipes survive**
Pre: cookbook with ≥2 recipes.
1. Long-press tile → Delete.
2. Verify the **second** confirmation Alert appears with the message that recipes won't be deleted and will be available under "All recipes"; Delete is styled destructive.
3. Confirm.
- Expected: tile disappears; recipes are still listed under **All recipes**; recipe detail opens correctly from there.

**CB-07 · P2 · Delete confirmation can be cancelled at both steps**
1. Long-press → Delete → Cancel on the second Alert. 2. Long-press → Cancel on the first Alert.
- Expected: nothing deleted in either path.

**CB-08 · P2 · Long cookbook name**
1. Create a cookbook with a ~60-character name.
- Expected: tile truncates gracefully (max 2 lines, no overflow); edit modal shows the full name.

**CB-09 · P1 · Remove a cover in edit**
Pre: CB-02 done.
1. Edit the cookbook → tap cover → **Remove photo** → Save.
- Expected: tile falls back to the palette color + icon. (File cleanup verified in IM-05.)

### RC — Recipe create & edit (SPEC §5.5)

**RC-01 · P0 · Create a recipe with title only**
1. Home → header "+" → fill only title `Żurek staropolski`. Save.
- Expected: saves successfully; recipe appears in All recipes; detail view shows **no** metadata row at all (no "—" placeholders).

**RC-02 · P0 · Create a full recipe**
1. From inside a cookbook, tap "+". Fill all fields of R1 (photo from gallery, Markdown in ingredients/instructions, notes).
- Expected: recipe saved **into that cookbook** (cookbook pre-selected); all data renders in the detail view.

**RC-03 · P0 · Title is required**
1. New recipe → fill everything except title (also try whitespace-only title). Save.
- Expected: Alert about missing title; form stays open; nothing saved.

**RC-04 · P1 · Numeric fields — invalid input saves null, never NaN**
For each of prep / cook / servings enter in turn: empty, `0`, `-5`, `abc`, `1.5`. Save with a valid title each time and reopen in edit.
- Expected: every invalid value comes back as an **empty field** (stored as null); the detail view hides that metadata item; no `NaN` anywhere. Valid `≥ 1` integers are kept.

**RC-05 · P1 · Edit updates content and sort position**
Pre: ≥2 recipes, the recipe under test NOT the most recent.
1. Edit the older recipe (change title), save.
- Expected: changes visible; the recipe jumps to **the top** of the list (`updated_at` refreshed on edit-save only — SPEC §4).

**RC-06 · P2 · Viewing does not change sort order**
1. Note list order. Open and close several recipes without editing.
- Expected: order unchanged.

**RC-07 · P1 · Photo via camera**
1. New/edit recipe → photo area → **Camera** → take a photo, confirm crop.
- Expected: photo appears in the form and, after save, in detail and on the grid tile.

**RC-08 · P2 · Replace and remove photo in the form**
1. Edit a recipe with a photo: replace it; save; verify. 2. Edit again: **Remove photo**; save.
- Expected: replacement shows the new photo; removal shows the gray placeholder. (Files: IM-03/IM-04.)

### RV — Recipe view (SPEC §5.4)

**RV-01 · P0 · Unified content view (no tabs)**
Pre: R1 (both sections filled) and R2 (both empty) exist.
1. Open R1 — Ingredients and Instructions appear as two stacked sections on one scrollable view, each with an uppercase header; the whole screen scrolls smoothly through both.
2. Open R2 — neither section is rendered (no empty headers, no placeholder text).
- Expected: no tab buttons anywhere; empty sections are hidden entirely.

**RV-02 · P1 · Markdown rendering**
1. In R1's ingredients/instructions verify: `# heading` renders as a styled heading, `**bold**` is bold, `- item` renders bullets, a double line break separates paragraphs.
- Expected: matches the table in SPEC §5.4; plain text (no Markdown) renders as plain paragraphs.

**RV-03 · P1 · Metadata visibility rules**
1. Open R3 (prep only): only Prep + Total shown.
2. Open R2 (nothing): metadata row entirely absent.
3. Open R1 (all): Prep, Cook, Total (= prep+cook), Servings.
- Expected: missing items hidden, never "—". Time format: `45 min` under an hour, `1h 30m` style above (SPEC §5.6).

**RV-04 · P1 · Notes box**
1. Open R1 (has notes) — highlighted notes box visible below the content sections.
2. Open R2 (no notes) — no notes box, no empty frame.

**RV-05 · P0 · Delete a recipe**
1. Open a recipe → trash icon → confirmation Alert (destructive) → confirm.
- Expected: navigates back; recipe gone from every list. Cancel path leaves it intact.

### LS — Lists, grid, sorting (SPEC §5.1, §5.3)

**LS-01 · P0 · "All recipes" aggregates everything**
Pre: recipes in 2 cookbooks + ≥1 recipe without a cookbook.
1. Home → All recipes.
- Expected: every recipe appears exactly once, sorted by `updated_at` descending.

**LS-02 · P1 · Recipe list cards**
1. Open a cookbook with R1 and R2.
- Expected: vertical list of cards — thumbnail on the left (or placeholder), title, total time and servings **only when present**; no search field in a specific cookbook's view.

**LS-03 · P1 · Empty cookbook state**
1. Create a new cookbook, open it.
- Expected: empty state with an icon and a "tap + to add" message; adding via the header "+" works.

**LS-04 · P1 · Home empty state**
Pre: fresh state (no cookbooks).
- Expected: icon + "No cookbooks" message encouraging creating the first one; "All recipes" row still reachable.

**LS-05 · P1 · Export icon visibility**
1. Open a specific cookbook → export (share) icon visible in the header.
2. Open All recipes.
- Expected: **no** export icon in the All recipes view (SPEC §5.6).

### SR — Search (SPEC §5.1)

**SR-01 · P0 · Live title search**
1. All recipes view → type `tart` (lowercase) in search.
- Expected: results filter on each keystroke (no search button); `Strawberry Tart` found; results show titles only; tapping opens the recipe.

**SR-02 · P0 · Polish diacritics, case-insensitive**
1. Search `żurek`, then `ŻUREK`, then `Żur`.
- Expected: all three find `Żurek staropolski`. This is the regression test for the JS `toLowerCase()` filter vs SQL `LIKE`.

**SR-03 · P1 · No results state**
1. Search `xyzzy`.
- Expected: muted "no results" text; no crash; clearing the query restores the full list.

### IM — Image persistence (SPEC §5.5, §8, §9) — **data-loss critical**

**IM-01 · P0 · Picked photo is copied to documentDirectory**
1. Create a recipe with a gallery photo. Save.
2. Force-stop the app (swipe away / `adb shell am force-stop`), clear **Expo Go's cache** (Android Settings → Apps → Expo Go → Storage → Clear cache — *not* Clear data), relaunch.
- Expected: the recipe photo still displays. (Before this feature the URI pointed at the cleared cache and the image would vanish.)

**IM-02 · P0 · Cookbook cover survives cache clear**
Same as IM-01 but for a cookbook cover.

**IM-03 · P1 · Replacing a photo cleans up the old file**
1. Edit a recipe, replace its photo, save.
2. Inspect the app's documents directory (e.g. `adb shell run-as` or a file-manager dev tool, or repeat replace several times and watch directory size).
- Expected: exactly one stored image per recipe; old files do not accumulate.

**IM-04 · P1 · Removing a photo deletes the stored file**
1. Edit a recipe with a photo → Remove photo → save.
- Expected: detail shows placeholder; stored file removed from documents directory.

**IM-05 · P1 · Deleting a record deletes its image file**
1. Delete a recipe that has a photo; delete a cookbook that has a cover.
- Expected: their image files are removed from the documents directory.

**IM-06 · P2 · Editing without touching the photo does not re-copy**
1. Edit a recipe with a photo, change only the title, save. Repeat 3×.
- Expected: still exactly one image file for that recipe (no duplicates per save).

### EX — Markdown export (SPEC §5.6)

**EX-01 · P0 · Export a cookbook**
Pre: cookbook with R1 (full) and R2 (title only).
1. Cookbook view → export (share) icon in the header.
- Expected: system share sheet opens with a `.md` file named after the cookbook. Share to e.g. email/files and open the file.

**EX-02 · P1 · Export format correctness**
Inspect the exported file:
- `# Cookbook Name` header; `*Exported: DD.MM.YYYY*` with today's date; `*Recipes: N*` with the right count.
- Recipes in the same order as the list (updated_at desc), separated by `---`.
- R1: metadata line `**Prep:** 15 min | **Cook:** 45 min | **Servings:** 4`; Ingredients/Instructions sections with raw Markdown preserved; Notes section present.
- R2: **no** metadata line at all, **no** Notes section (omitted, not empty).

**EX-03 · P1 · Filename sanitization with diacritics**
1. Export `Zupy i żurki`; also create and export a cookbook named `A/B: test?*`.
- Expected: Polish characters preserved in the filename (`Zupy i żurki.md`); forbidden characters (`/ \ : * ? " < > |`) stripped; a name that sanitizes to nothing falls back to the default filename.

**EX-04 · P2 · Share sheet cancel**
1. Trigger export, dismiss the share sheet without choosing a target.
- Expected: app returns to the cookbook view; no crash; export can be re-triggered.

### MI — Markdown import (SPEC §5.8)

**MI-01 · P0 · Export → import round-trip**
Pre: cookbook with R1 (full: times, servings, Markdown sections, notes) and R2 (title only).
1. Export the cookbook (EX-01), save the `.md` file on the device.
2. Settings → Import from Markdown → pick the file → confirm the "Import ... with 2 recipes?" Alert.
- Expected: a new cookbook appears on Home with the same name; both recipes intact — R1's times/servings parsed back (incl. an over-an-hour time like "1 hr 30 min" → 90 min), Markdown in ingredients/instructions identical, notes preserved; R2 imported with title only (no metadata row in detail view).

**MI-02 · P1 · Malformed file is rejected**
1. Import a `.txt`/`.md` file that is not a KeepTaste export (e.g. random text without a `# ` heading).
- Expected: "Import failed" Alert with a reason; nothing created; app fully usable afterwards.

**MI-03 · P1 · Cancel paths**
1. Open the picker and dismiss it without choosing a file. 2. Pick a valid file but tap Cancel on the confirmation Alert.
- Expected: no cookbook created in either path; no crash.

**MI-04 · P2 · Duplicate import**
1. Import the same file twice, confirming both times.
- Expected: two separate cookbooks with the same name (duplicates are allowed by design — SPEC §5.8); recipes duplicated accordingly.

**MI-05 · P2 · Empty cookbook file**
1. Export a cookbook with zero recipes, then import that file.
- Expected: confirmation says "0 recipes"; an empty cookbook is created; opening it shows only the "Add recipe" tile.

**MI-06 · P2 · Imported recipes have no photos**
1. After MI-01, open imported R1.
- Expected: gray placeholder instead of a photo (export does not carry images — known format property, not a bug); everything else intact.

### RI — Single-recipe import (SPEC §5.15)

> Distinct from MI (whole-library Markdown backup). The pure parsers are unit-tested
> (`__tests__/recipeImport.test.ts`); these cases cover the native sheet, `fetch`, and keyboard.

**RI-01 · P0 · Import affordance only when creating**
1. Open a recipe for **edit** (recipe view → ⋯ → Edit).
- Expected: **no** "Import from a link or text" affordance on the form.
2. Create a **new** recipe (FAB / "+").
- Expected: the "Import" affordance appears above the title; tapping it opens the Import sheet (modes "From link" / "Paste text", default "From link").

**RI-02 · P0 · Import from a link (JSON-LD)**
1. From-link mode, paste a recipe URL from a mainstream blog (e.g. AniaGotuje, Kwestia Smaku, BBC Good Food) → tap Import.
- Expected: the sheet closes and the new-recipe form is pre-filled — title, ingredients, instructions, and any prep/cook/servings the page exposes; a localized "Source: <url>" line is appended to Notes. No photo is pulled. Nothing is saved yet (RI-06).

**RI-03 · P1 · Link with no structured data / blocked site**
1. Paste a URL of a page with no Recipe JSON-LD (e.g. a social post), or a site that refuses the request → Import.
- Expected: an inline message ("couldn't read this page…" or "this site blocks automatic import…") **and** the sheet switches to Paste-text mode; the form is untouched.

**RI-04 · P1 · Link with no network**
1. Enable airplane mode, paste any URL → Import.
- Expected: inline "Couldn't load that page. Check the link and your connection."; the form is untouched; no crash.

**RI-05 · P0 · Paste text parsing**
1. Paste-text mode → paste a recipe copied from a blog (title line, a "Składniki/Ingredients" list, numbered or "Krok N" steps, and a trailing "Wskazówki/Tip" block) → Import.
- Expected: the form pre-fills — first line as title, ingredients vs. steps split correctly, prep/cook/servings filled if the text had labeled times, and the tip block lands in **Notes**; UI chrome / nutrition lines are dropped. Chaotic captions with no structure fall back to everything in instructions (no crash).

**RI-06 · P0 · Review-then-save & cookbook context**
1. Launch import from inside a specific cookbook, import a recipe, edit a field, then Save.
- Expected: import only pre-fills (never auto-saves); the saved recipe lands in the cookbook it was created from; abandoning the form before Save creates nothing.

**RI-07 · P1 · Keyboard does not cover the sheet**
1. Open the Import sheet and tap the URL field (and the paste field).
- Expected: the sheet lifts above the on-screen keyboard — the input and the Import button stay visible and tappable, not hidden behind the keyboard.

### SL — Shopping lists (SPEC §5.10)

**SL-01 · P0 · Create a shopping list**
1. Shopping tab → tap "+" → the "New shopping list" modal opens with the name field focused.
2. Leave the name empty → tap "Create list".
- Expected: blocked with a "Missing name" alert; no list is created.
3. Type a name, then tap the "✕" close button.
- Expected: "Discard changes?" alert (dirty-check); "Discard" closes without creating, "Keep editing" stays.
4. Type a name → tap "Create list".
- Expected: navigates straight into the new list's detail (empty state); tapping back returns to the Shopping tab with the new list visible.

**SL-02 · P0 · Add products**
1. In a list detail, reveal the add row (empty list: "Add product" button; non-empty: "+" in the header).
2. Confirm with an empty name.
- Expected: no-op (nothing added).
3. Add a product with a name only, then one with a quantity (e.g. "1 kg").
- Expected: each appears in the active section; quantity shown muted next to the name when present; after each add the inputs clear and the add row stays open with focus back on the name field.

**SL-03 · P0 · Check / uncheck flow**
1. Tap a product (or its checkbox).
- Expected: it grays out (line-through, muted checkmark-circle) and moves under the uppercase "In cart" section header.
2. Observe the header.
- Expected: "In cart" header appears only when at least one item is checked.
3. Uncheck the item.
- Expected: it returns to the active section; header disappears when nothing is checked.

**SL-04 · P1 · Progress label + list reordering**
1. From the Shopping tab, observe a list with items.
- Expected: card shows "{checked}/{total} in cart" (hidden when the list is empty).
2. Check or add an item in another list, then return to the tab.
- Expected: the changed list floats to the top (sorted by `updated_at`).

**SL-05 · P1 · Delete a list removes its items (CASCADE — verify in Expo Go)**
1. Long-press a list card → Alert → "Delete".
- Expected: the list disappears; its `shopping_items` rows are removed via `ON DELETE CASCADE` (verify no orphaned items remain).

**SL-08 · P1 · Edit a product (name and quantity)**
1. Long-press a product → **Edit** → the bottom inline row opens pre-filled (name + quantity), confirm button shows a checkmark.
2. Change both values and confirm; also try clearing the quantity entirely.
- Expected: the row updates in place (no duplicate); cleared quantity disappears from the row; the list floats to the top of the Shopping tab (`updated_at` touched); checked state is unaffected.

**SL-07 · P1 · Rename a list**
1. Long-press a list card → **Rename** → modal opens pre-filled with the current name.
2. Change the name, Save; also try: clearing the name (blocked with an Alert) and closing via ✕ after editing (dirty-check Alert).
- Expected: card shows the new name; the renamed list floats to the top of the Shopping tab (`updated_at` refreshed); items untouched.

**SL-06 · P2 · Delete a product via long-press**
1. Long-press a product row → Alert → "Delete".
- Expected: the product is removed; the parent list's `updated_at` is touched.

### DC — Discard-changes dialogs (SPEC §5.2, §5.5)

**DC-01 · P0 · Dirty recipe form warns on Cancel**
1. New recipe → type anything in any field → tap Cancel.
- Expected: Alert "Discard changes?" with **Keep editing** / **Discard** (destructive). Keep editing → form intact with the typed text. Repeat → Discard → modal closes, nothing saved.

**DC-02 · P1 · Clean forms close silently**
1. Open new recipe and new cookbook forms, touch nothing, tap Cancel.
- Expected: closes immediately, no dialog.

**DC-03 · P1 · Dirty cookbook form warns on Cancel**
Same as DC-01 for the cookbook modal (name typed or cover picked).

**DC-04 · P2 · Edit form: reverting changes by hand**
1. Edit a recipe, change the title, then change it back exactly → Cancel.
- Expected: closes without a dialog (form equals initial state). *Known limitation:* the OS back gesture / hardware back bypasses the dialog on both forms (parity gap, tracked for a future pass) — verify it at least does not crash.

### ST — Settings (SPEC §5.7)

**ST-01 · P0 · Settings content**
1. Home → gear icon.
- Expected: app name + version matching `app.json`; "Your data" notice (device-only storage, no cloud, uninstall deletes data, Markdown export is the only backup); Danger zone with Delete all data. Back returns Home.

**ST-02 · P0 · Delete all data — full flow**
Pre: ≥2 cookbooks, ≥3 recipes, with photos.
1. Settings → Delete all data → first Alert → confirm → second "cannot be undone" Alert → confirm.
- Expected: returns to an empty Home (empty state); All recipes empty; stored image files removed (spot-check directory); app fully usable afterwards (create a new cookbook).

**ST-03 · P1 · Delete all data — cancel paths**
1. Cancel at the first Alert; re-enter and cancel at the second.
- Expected: nothing deleted in either path.

### PM — Permissions (SPEC §2)

**PM-01 · P1 · Photo library permission denied**
Pre: permissions reset.
1. New recipe → photo → Gallery → **deny** the permission.
- Expected: no crash; form still usable; retrying shows the system dialog or a rationale (per OS behavior).

**PM-02 · P1 · Camera permission denied**
Same for Camera.
- Expected: no crash; user can still pick from gallery.

**PM-03 · P2 · Permission granted after prior denial**
1. After PM-01, grant the permission from system settings, retry.
- Expected: picker opens normally.

### DM — Dark mode (SPEC §6)

**DM-01 · P1 · System theme switching**
1. With the app open on Home, switch the system theme to dark (quick settings tile), then walk through: cookbook view, recipe view, both forms, settings.
2. Switch back to light mid-session.
- Expected: every screen switches instantly without reload; no stale light/dark surfaces; text readable on all backgrounds (spot-check contrast per SPEC §6 WCAG AA goal); cookbook tiles and photos unchanged (dark overlay works in both modes); status bar style follows the theme.

### I18N — Language selection (SPEC §5.11)

**I18N-01 · P1 · Polish-locale device defaults to Polish UI**
1. Fresh install (clear Expo Go data) on a device whose system language is Polish (`pl-PL`). Launch the app without touching Settings.
- Expected: the whole UI is Polish by default — tab labels (Przepisy / Zakupy), Home title (Książki kucharskie), the "All recipes" tile (Wszystkie przepisy), empty states, and Alerts. A device in any non-Polish locale defaults to English.

**I18N-02 · P1 · Manual override switches the whole app immediately**
1. In Settings → Language, choose **System**, then **English**, then **Polski**, observing after each.
- Expected: each choice re-renders the entire app instantly with no reload — tab labels at the bottom, the Settings header, pushed/detail screen titles (open a recipe and a shopping list to confirm Stack titles), and Alert buttons (e.g. long-press a cookbook → Edytuj / Usuń / Anuluj) all switch language together. The Language row subtitle reflects the current choice (System / English / Polski).

**I18N-03 · P1 · Override persists across a full kill + restart**
1. Set Language to Polski. Force-stop the app, relaunch.
- Expected: the app comes back in Polish (preference read from the `app_settings` table), regardless of the device locale. Switching back to System and restarting returns to the device-locale default.

**I18N-04 · P2 · Export stays English while UI is Polish (round-trip)**
1. With UI language set to Polski, export a cookbook to Markdown, inspect the file, then re-import it (Settings → Importuj z Markdown).
- Expected: the exported `.md` headings/labels are English (the data format never localizes); the import succeeds and round-trips identically — recipe count and content match — even though every surrounding UI string and Alert shown during import is Polish.

### LC — App lifecycle & data durability (SPEC §4, §9)

**LC-01 · P0 · Data survives app restart**
1. Create data, force-stop the app, relaunch.
- Expected: everything intact (SQLite persistence; this differs from the web build by design).

**LC-02 · P1 · Backgrounding mid-form**
1. Fill half of a recipe form → background the app (home button) → return.
- Expected: form state preserved; saving afterwards works.

**LC-03 · P2 · Interruption during save**
1. Tap Save on a recipe with a large photo and immediately background the app.
- Expected: on return, either the recipe saved completely or not at all — no half-saved corrupt row, no orphan crash on the list.

**LC-04 · P2 · Fresh install / first run**
1. Clear Expo Go data (or reinstall), launch the app.
- Expected: migrations run silently; empty Home renders; creating the first cookbook works (DDL path — SPEC §4).

---

## 5. Smoke suite (run on every build)

The P0 set, in execution order:
`LC-01 → CB-01 → CB-04 → CB-06 → RC-01 → RC-02 → RC-03 → RV-01 → RV-05 → LS-01 → SR-01 → SR-02 → IM-01 → IM-02 → EX-01 → MI-01 → DC-01 → ST-01 → ST-02`

~20 minutes on one physical Android device. The full plan (P0+P1) is the release gate for the primary platform; P2 and the iOS pass are scheduled per release scope.

## 6. Exit criteria

- 100% of P0 passed on E1.
- No open defects in IM (data-loss class) or LC-01.
- P1 failures triaged: either fixed or explicitly accepted and recorded in SPEC §9 (known limitations).
