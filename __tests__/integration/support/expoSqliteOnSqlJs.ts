// Integration-test stand-in for `expo-sqlite`, mapped in jest.config.js for
// the `integration` project only. It implements the synchronous surface the
// app touches — `openDatabaseSync` → `execSync` / `getFirstSync` (db/client.ts
// migrations) and `prepareSync` → `executeSync` / `executeForRawResultSync`
// (drizzle-orm's expo-sqlite driver) — on top of sql.js, which is real SQLite
// compiled to WebAssembly. So the production code path runs unchanged: the
// real db/client.ts with its migration ladder, the real drizzle driver and the
// real SQL engine. Only the native binding is replaced.
//
// sql.js initialises asynchronously (it loads its .wasm), but openDatabaseSync
// is synchronous, so a test prepares the database first (support/testDb.ts)
// and hands it over through a global slot before db/client.ts is required.
import type { BindParams, Database, SqlValue } from 'sql.js';

type Slot = { database: Database | null };
const SLOT_KEY = '__keeptasteIntegrationSqlite';

function slot(): Slot {
  const g = globalThis as unknown as Record<string, Slot | undefined>;
  if (!g[SLOT_KEY]) g[SLOT_KEY] = { database: null };
  return g[SLOT_KEY]!;
}

/** Makes `database` the one the next openDatabaseSync() call returns. */
export function __provideDatabase(database: Database): void {
  slot().database = database;
}

function toBindParams(params: unknown): BindParams {
  const list = Array.isArray(params) ? params : params == null ? [] : [params];
  return list.map((v): SqlValue => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v as SqlValue;
  });
}

function collect(
  database: Database,
  sql: string,
  params: unknown,
  mode: 'object' | 'array'
): unknown[] {
  const stmt = database.prepare(sql);
  try {
    stmt.bind(toBindParams(params));
    const rows: unknown[] = [];
    while (stmt.step()) {
      rows.push(mode === 'object' ? stmt.getAsObject() : stmt.get());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function result(database: Database, rows: unknown[]) {
  const changes = database.getRowsModified();
  const [[lastInsertRowId]] = database.exec('SELECT last_insert_rowid()')[0]
    .values as [[number]];
  return {
    changes,
    lastInsertRowId,
    getAllSync: () => rows,
    getFirstSync: () => rows[0] ?? null,
  };
}

class SqlJsExpoDatabase {
  constructor(private readonly database: Database) {}

  execSync(sql: string): void {
    this.database.exec(sql);
  }

  getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
    const rows = collect(this.database, sql, params.flat(), 'object');
    return (rows[0] as T) ?? null;
  }

  getAllSync<T>(sql: string, ...params: unknown[]): T[] {
    return collect(this.database, sql, params.flat(), 'object') as T[];
  }

  prepareSync(sql: string) {
    const database = this.database;
    return {
      executeSync: (params?: unknown) =>
        result(database, collect(database, sql, params, 'object')),
      executeForRawResultSync: (params?: unknown) =>
        result(database, collect(database, sql, params, 'array')),
      finalizeSync: () => {},
    };
  }

  closeSync(): void {
    // The test owns the sql.js database; nothing to release here.
  }
}

export function openDatabaseSync(_name: string): SqlJsExpoDatabase {
  const database = slot().database;
  if (!database) {
    throw new Error(
      'expoSqliteOnSqlJs: no database provided — use openTestDb() from ' +
        '__tests__/integration/support/testDb.ts before requiring db/client.'
    );
  }
  return new SqlJsExpoDatabase(database);
}
