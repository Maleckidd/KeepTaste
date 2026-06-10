// Web-only database client. The web build exists purely as a test
// environment for agents/E2E smoke tests (see SPEC.md) — expo-sqlite has no
// web implementation in SDK 52, so we run sql.js (SQLite compiled to WASM)
// behind Drizzle's sqlite-proxy driver. The database is in-memory and resets
// on every page reload, which is exactly what repeatable E2E runs want.
import initSqlJs, { type BindParams, type Database } from 'sql.js';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { MIGRATION_DDL } from './ddl';

// Must match the installed sql.js version — the remotely fetched .wasm has to
// pair with the local JS loader.
const SQL_JS_VERSION = '1.14.1';

let initPromise: Promise<Database> | null = null;

function getDatabase(): Promise<Database> {
  if (!initPromise) {
    initPromise = initSqlJs({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/sql.js@${SQL_JS_VERSION}/dist/${file}`,
    }).then((SQL) => {
      const database = new SQL.Database();
      database.exec(`PRAGMA foreign_keys = ON; ${MIGRATION_DDL}`);
      return database;
    });
  }
  return initPromise;
}

export const db = drizzle(
  async (sql, params, method) => {
    const database = await getDatabase();
    if (method === 'run') {
      database.run(sql, params as BindParams);
      return { rows: [] };
    }
    const stmt = database.prepare(sql);
    try {
      stmt.bind(params as BindParams);
      const rows: unknown[][] = [];
      while (stmt.step()) {
        rows.push(stmt.get() as unknown[]);
      }
      return { rows: method === 'get' ? (rows[0] ?? []) : rows };
    } finally {
      stmt.free();
    }
  },
  { schema }
);

// Queries await getDatabase() themselves; kicking it off here just warms up
// the WASM download during app startup.
export function runMigrations() {
  void getDatabase();
}
