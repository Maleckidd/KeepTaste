# UX notes — proposals beyond the current scope

Findings from the June 2026 UX/UI audit. Items implemented since the audit are
marked ✅ (kept for context); the rest still require logic or tooling changes.
Several overlap with SPEC.md §7/§8 out-of-scope decisions — revisit those
deliberately, don't implement casually.

## Implemented since the audit ✅
- ✅ **Undo instead of delete confirmations** — deferred-delete registry
  (`utils/pendingDelete.ts`) + "Deleted — Undo" snackbar
  (`components/ui/SnackbarProvider.tsx`) for cookbooks, recipes, shopping
  lists and items. Failure mode is safe: if the app dies before commit,
  nothing was deleted.
- ✅ **Swipe-left Edit/Delete** on shopping items, shopping list cards and
  recipe cards (`components/ui/SwipeableRow.tsx`, RNGH + Reanimated).
- ✅ **Context menus via a themed bottom ActionSheet** instead of
  `Alert.alert` (`components/ui/ActionSheet.tsx`); "⋯" menus in the cookbook
  and shopping-list headers.
- ✅ **Inline rename of a shopping list** (tap the title; the rename modal
  was removed).
- ✅ **Inline form validation** (missing title/name) instead of Alerts;
  "Added to list" Alert replaced with a snackbar with a "View list" action.

## Remaining proposals

### Shopping list (store context)
- **"Clear checked" bulk action** — after shopping, the "In cart" section is
  cleared item by item. One bulk mutation in `db/shoppingLists.ts` + a button
  near the section header. Cheapest remaining win.
- **Reorder items (drag & drop)** — requires a sort-order column.

### Recipes & cookbooks
- **Move a recipe between cookbooks** — there is no UI for changing
  `cookbook_id` after creation. *Now specified as the form's Cookbook field
  (SPEC §5.5, §8 package A).*
- **Recipe count on cookbook tiles** — needs a `COUNT` join in
  `getCookbooks()`.
- **Multi-select mode** (batch delete / move) — most expensive, least urgent.

### Recipe view (cooking context)
- **Step-by-step cooking mode** — out of scope per SPEC §7; biggest possible
  kitchen-context win if that decision is revisited.
- **Checkable ingredients while cooking** — transient per-recipe state.
- **Servings scaling** — out of scope per SPEC §7 (ingredients are free text).

### Platform / tooling
- **Native context menus (Zeego / UIContextMenu)** — requires leaving Expo Go
  for a development build; `components/ui/ActionSheet.tsx` is the single
  place to swap when that happens.
- **Blurhash placeholders for photos** — hashes would need to be computed and
  stored at save time (schema change); today's fade-in is the approximation.
- **Search inside a single cookbook** — SPEC §5.3 deliberately scopes title
  search to the "All recipes" view only.

## Persona testing, iteration 1 (October 2026)

Ideas from the first persona-lab session (`persona-lab/history/01-2026-10-23.md`)
that are **not** part of the iteration-1 fix packages (SPEC §8). Problem
numbers refer to that file. Parked, not rejected — revisit when iteration 2
shows whether they still matter.

### Fits the spec — candidates for a later package
- **Import mode picked from the clipboard** (problem 7) — the import sheet
  opens on "From link" even with recipe text on the clipboard. Open on
  "Paste text" when the clipboard holds non-URL text, or remember the last
  mode. `expo-clipboard` is already a dependency. Re-check after package A:
  the FAB now leads straight to the form, so import is one tap closer.
- **Import as a first-class entry** (Tom) — a visible "Import recipe" next to
  the FAB / on the home screen instead of only inside the form.
- **Warn before sharing a PDF with title-only recipes** (problem 17) — "3
  recipes have only a title — share anyway?". Must not block saving such a
  recipe (§5.5).
- **PDF title page** (Margaret) — the cookbook cover (`cover_image_path`) and
  name on a first page; today the PDF opens with a bare `<h1>`.
- **"Save PDF to the phone"** (Margaret) — next to share, via SAF (already
  used by auto-backup, §5.17.3). Direct Drive integration stays out (§7).
- **Mark sample content as an example** (problem 14) — an "Example" caption
  on the seeded cookbook/recipe (§5.20); the seed also hides the home empty
  state that could say "Start by adding a recipe".
- **Gentler swipe peek** (problem 1) — shorter, partial reveal without the
  red Delete; the replay bug itself is fixed (PR #6).
- **Split one-line instructions into steps** (problem 8c) — a pasted method
  in a single paragraph could be split on sentence ends.
- **"Already on the list" notice** (Kasia) — a snackbar when a product being
  added is already active on the list.
- **Snackbar over tappable rows** (problem 12) — the "added to list"
  snackbar covers the last checklist row of the recipe view; a tap meant for
  the snackbar can tick an ingredient.
- **"New cookbook…" inside the form's Cookbook picker** — create the
  cookbook without leaving the recipe form (modal over modal; needs design).

### Conflicts with the spec — need a deliberate decision first
- **Link shopping items to their recipe** ("from: Salmon…", Kasia) —
  contradicts §5.12 ("no persistent link is stored"); needs a column and a
  three-place migration.
- **"What's in my fridge" ranking** (Bartek) — the AI version is out of
  scope (§7, no network AI). A local version (rank recipes by how many listed
  products their ingredients mention) is possible on top of package B's
  matching, but ingredients are free text, so it would be approximate.
- **Direct Google Drive upload** (Margaret) — out of scope (§7); the share
  sheet already reaches Drive.
