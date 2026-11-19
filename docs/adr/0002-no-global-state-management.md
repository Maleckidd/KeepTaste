# 0002. No global state manager: screens load on focus and reload after a mutation

- **Status:** Accepted
- **Date:** 2026-06-10 (in SPEC.md §3 and CLAUDE.md from the first commit,
  `874a292`; recorded retroactively on 2026-11-19)

## Context

The app has one user, one device and one local database, and no server
state to cache or reconcile ([0001](0001-local-only-offline.md)). The
database is fast and on the same device. The question was where the
screens' data should live between the database and the UI.

## Decision

There is no store library. Each screen loads what it needs from `db/` in
`useFocusEffect`, mutates through a `db/` function, and reloads
([SPEC.md §3 Data flow](../../SPEC.md#data-flow),
[CLAUDE.md](../../CLAUDE.md)). The five list and detail screens follow
this pattern: [`app/(tabs)/index.tsx`](<../../app/(tabs)/index.tsx>),
[`app/(tabs)/shopping.tsx`](<../../app/(tabs)/shopping.tsx>),
[`app/cookbook/[id].tsx`](<../../app/cookbook/[id].tsx>),
[`app/recipe/[id].tsx`](<../../app/recipe/[id].tsx>) and
[`app/shopping/[id].tsx`](<../../app/shopping/[id].tsx>).

State that is not database data and must outlive a screen uses plain React
context: the UI language (`i18n/LanguageProvider.tsx`), the theme
(`constants/ThemeProvider.tsx`), the snackbar
(`components/ui/SnackbarProvider.tsx`) and running cooking timers
(`components/timers/TimerProvider.tsx`). None of these holds a copy of
recipes, cookbooks or lists.

## Alternatives considered

- **Redux, Zustand or a similar store.** Rejected as over-engineering at
  this scale (SPEC.md §3). A store would hold a second copy of the
  database, and every mutation would then have to update both.
- **A query cache (TanStack Query or similar).** Its strengths are network
  concerns: deduplicating requests, retries, stale-while-revalidate. A
  local SQLite read has none of those problems.
- **A reactive database layer (live queries).** It would push changes to
  mounted screens, but it adds a subscription model to every query helper
  and makes `db/` harder to test as plain async functions.

## Consequences

- One source of truth. A screen cannot show stale data after it regains
  focus, because it has just read the database.
- A screen reloads more than it strictly needs to. At this data size the
  cost is not visible; if it ever is, the fix is a narrower query, not a
  store.
- The rule has to be defended in review, because adding a store looks like
  an improvement. [CLAUDE.md](../../CLAUDE.md) says so explicitly: "Do not
  introduce Redux/Zustand/etc."
- The data layer stays a set of async functions, which is what lets the
  integration suite run it against real SQLite
  ([docs/TESTING.md](../TESTING.md)).
