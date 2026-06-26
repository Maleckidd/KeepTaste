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
export const CURRENT_SCHEMA_VERSION = 1;

/** Reads the persisted SQLite user_version (0 on a brand-new database). */
export function getSchemaVersion(): number {
  const row = sqlite.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  return row?.user_version ?? 0;
}

// Migration — create tables if they don't exist, then advance the version.
export function runMigrations() {
  sqlite.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    ${MIGRATION_DDL}
  `);

  // Version ladder. The baseline DDL above brings any install up to v1; future
  // ALTER/data migrations slot in as `if (from < N) { … }` steps before the
  // stamp. Stamping unconditionally is safe because the DDL is idempotent.
  if (getSchemaVersion() < CURRENT_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
  }
}
