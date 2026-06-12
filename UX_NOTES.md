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
  `cookbook_id` after creation. A "Move to cookbook…" entry in the recipe's
  menu with a simple picker.
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
