# 0003. Hand-written migrations with a `PRAGMA user_version` ladder, not Drizzle Kit

- **Status:** Accepted
- **Date:** 2026-06-26 (the ladder, commit `7110ee1`; hand-written DDL
  without Drizzle Kit dates from the first commit, 2026-06-10; recorded
  retroactively on 2026-11-19)

## Context

The schema lives on every user's phone, and the database is their only
copy of the library ([0001](0001-local-only-offline.md)). A failed
migration during an app update cannot be fixed on a server; it is data
loss on a device nobody else can reach.

The app started with idempotent `CREATE TABLE IF NOT EXISTS` DDL only. That
creates missing tables but cannot change an existing one, and nothing
recorded which schema a database was on. The `.zip` restore made that a
real risk: an archive from a newer schema could be restored silently into
an older app
([SPEC.md §5.17.4](../../SPEC.md#5174-schema-versioning-prerequisite-for-safe-restore)).

## Decision

Migrations are SQL written by hand and reviewed like any other code:

- [`db/ddl.ts`](../../db/ddl.ts) holds the baseline DDL, shared by the
  native client and the web test client.
- [`db/client.ts`](../../db/client.ts) runs it, then a ladder of
  `if (from < N)` steps keyed on SQLite's `PRAGMA user_version`, then
  stamps `CURRENT_SCHEMA_VERSION`. Each step is idempotent, because a
  fresh install already has every column from the baseline.
- Migrations run **when `db/client.ts` is imported**, not from a screen
  effect. React runs child effects before the parent's, so a migration
  started from the root layout once lost the race against the home screen's
  first-launch seed, and the sample content silently never appeared (the
  comment in `db/client.ts`;
  [SPEC.md §4 Migrations](../../SPEC.md#migrations)).

Any schema change edits three places: `db/schema.ts`, `db/ddl.ts`, and a
ladder step with a version bump ([CLAUDE.md](../../CLAUDE.md)).

## Alternatives considered

- **Drizzle Kit generated migrations.** Rejected as too risky to run
  unattended during app updates (SPEC.md §4). The SQL would be generated
  rather than written, and it would run on the user's only copy of their
  data. The unused `drizzle-kit` dev dependency was removed on 2026-11-18
  ([SECURITY.md](../../SECURITY.md#dependency-audit-allowlist)).
- **Keep `CREATE TABLE IF NOT EXISTS` only.** This was the state before
  the ladder. It cannot add a column to an existing table and gives a
  restore nothing to compare against
  ([SPEC.md §9](../../SPEC.md#9-known-limitations-and-risks)).
- **Store the version in an `app_settings` row.** `user_version` is built
  into the SQLite file header, so it can be read before any table exists
  and needs no table of its own.

## Consequences

- The ladder is a discipline, not a safety net: skip it and a fresh
  install still looks fine, because the baseline DDL has every column.
  Only existing users break. So
  [`__tests__/integration/migrations.test.ts`](../../__tests__/integration/migrations.test.ts)
  rebuilds every schema that ever shipped from git history
  ([`support/legacySchemas.ts`](../../__tests__/integration/support/legacySchemas.ts)),
  migrates it on real SQLite and compares each table with `db/schema.ts`
  ([docs/TESTING.md](../TESTING.md)). A bump must add the outgoing
  version's DDL there.
- The database schema version and the backup's `schemaVersion` are
  separate numbers. A column that carries user data bumps both; one that
  an older app can drop safely bumps only the database (SPEC.md §9).
- An archive from a newer `schemaVersion` is refused with a message
  instead of being restored.
