import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { MIGRATION_DDL } from './ddl';

// Open the database
const sqlite = SQLite.openDatabaseSync('recipes.db');

// Initialize Drizzle with the database and schema
export const db = drizzle(sqlite, { schema });

/**
 * Current on-device schema version. The hand-written DDL (CREATE TABLE IF NOT
 * EXISTS) is the baseline (v1); future breaking changes add a step to the
 * ladder in runMigrations and bump this. Tracked via PRAGMA user_version so a
 * backup restore can refuse data from a newer schema (SPEC.md §5.17.4).
 */
export const CURRENT_SCHEMA_VERSION = 3;

/** Reads the persisted SQLite user_version (0 on a brand-new database). */
export function getSchemaVersion(): number {
  const row = sqlite.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  return row?.user_version ?? 0;
}

/** Guards against a second run; also lets a failed run be retried. */
let migrated = false;

// Migration — create tables if they don't exist, then advance the version.
export function runMigrations() {
  if (migrated) return;

  sqlite.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    ${MIGRATION_DDL}
  `);

  // Version ladder. The baseline DDL above brings any install up to v1; future
  // ALTER/data migrations slot in as `if (from < N) { … }` steps before the
  // stamp. Stamping unconditionally is safe because the DDL is idempotent.
  const from = getSchemaVersion();

  // v2 (SPEC.md §5.19): recipes.to_try. A fresh DB already has the column from
  // the DDL above, so the ALTER throws "duplicate column name" — swallow it,
  // matching this file's idempotent stance.
  if (from < 2) {
    try {
      sqlite.execSync(
        `ALTER TABLE recipes ADD COLUMN to_try INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      // column already exists (fresh DB created by the baseline DDL)
    }
  }

  // v3 (SPEC.md §5.10): shopping_items.checked_at — the "In cart" section is
  // ordered by check-off time. Items already in the cart keep NULL and sort
  // after the timed ones. Same duplicate-column swallow as v2.
  if (from < 3) {
    try {
      sqlite.execSync(`ALTER TABLE shopping_items ADD COLUMN checked_at TEXT`);
    } catch {
      // column already exists (fresh DB created by the baseline DDL)
    }
  }

  if (from < CURRENT_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
  }

  migrated = true;
}

// The schema is created here, at import time, not from a screen effect. React
// fires child effects before the parent's, so migrations kicked off from the
// root layout's effect landed *after* the home screen's first-launch seed had
// already queried app_settings — on a brand-new install that query hit tables
// that did not exist yet, the seed swallowed the error and the sample content
// (SPEC.md §5.20) silently never appeared. Every consumer goes through this
// module, so doing it on import means no query can outrun the schema. Failures
// are logged rather than thrown (an import-time throw would take the app down);
// `migrated` stays false, so the root layout's call retries.
try {
  runMigrations();
} catch (e) {
  console.error('Database migration error:', e);
}
