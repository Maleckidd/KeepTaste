// Opens a real SQLite database (sql.js) for one test and wires it in as the
// database db/client.ts opens. Usage:
//
//   const sqlite = await openTestDb();   // fresh install
//   const recipes = require('@/db/recipes') as typeof import('@/db/recipes');
//   // ↑ requiring any db/ module imports db/client.ts, which migrates
//
// openTestDb resets Jest's module registry, so every test gets a fresh
// db/client.ts that runs its import-time migrations against the new database,
// exactly like an app launch.
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { __provideDatabase } from './expoSqliteOnSqlJs';

let SQL: SqlJsStatic | null = null;

export async function openTestDb(
  prepare?: (database: Database) => void
): Promise<Database> {
  SQL ??= await initSqlJs();
  const database = new SQL.Database();
  prepare?.(database);
  jest.resetModules();
  __provideDatabase(database);
  return database;
}

/** Column names of `table`, in declaration order. */
export function columnsOf(database: Database, table: string): string[] {
  const res = database.exec(`PRAGMA table_info(${table})`)[0];
  if (!res) return [];
  const nameIdx = res.columns.indexOf('name');
  return res.values.map((row) => String(row[nameIdx]));
}

export function tablesOf(database: Database): string[] {
  const res = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )[0];
  return res ? res.values.map((row) => String(row[0])) : [];
}

export function userVersion(database: Database): number {
  return Number(database.exec('PRAGMA user_version')[0].values[0][0]);
}

/** Runs a query and returns its rows as objects. */
export function rows<T = Record<string, unknown>>(
  database: Database,
  sql: string
): T[] {
  const res = database.exec(sql)[0];
  if (!res) return [];
  return res.values.map(
    (row) =>
      Object.fromEntries(res.columns.map((c, i) => [c, row[i]])) as T
  );
}
