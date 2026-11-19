// The PRAGMA user_version migration ladder in db/client.ts, run for real.
//
// A fresh install never exercises the ladder: the baseline DDL already has
// every column, so each ALTER is swallowed as "duplicate column". The bug
// CLAUDE.md warns about — a schema change without its ladder step — only
// shows on a phone that has an older database. So every schema an older app
// version shipped (support/legacySchemas.ts, copied from git history) is
// built here with data in it, then today's db/client.ts migrates it.
//
// The yardstick is db/schema.ts: after migrating, every table must have
// exactly the columns Drizzle will query.
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '@/db/schema';
import {
  LEGACY_SCHEMAS,
  PRE_RELEASE_TAG_TABLES,
  type LegacySchema,
} from './support/legacySchemas';
import { columnsOf, openTestDb, rows, tablesOf, userVersion } from './support/testDb';

const TABLES: SQLiteTable[] = [
  schema.cookbooks,
  schema.recipes,
  schema.shoppingLists,
  schema.shoppingItems,
  schema.appSettings,
];

/** table name → column names, as db/schema.ts declares them. */
const EXPECTED = Object.fromEntries(
  TABLES.map((t) => {
    const cfg = getTableConfig(t);
    return [cfg.name, cfg.columns.map((c) => c.name).sort()];
  })
);

function migrate() {
  return require('@/db/client') as typeof import('@/db/client');
}

function expectSchemaMatchesDrizzle(database: Parameters<typeof columnsOf>[0]) {
  for (const [table, columns] of Object.entries(EXPECTED)) {
    expect({ table, columns: columnsOf(database, table).sort() }).toEqual({
      table,
      columns,
    });
  }
}

/** Inserts the rows a user of `legacy` would have, in that version's shape. */
function seedLegacyData(database: Parameters<typeof columnsOf>[0], legacy: LegacySchema) {
  database.exec(`
    INSERT INTO cookbooks (id, name, created_at) VALUES (1, 'Soups', '2026-06-01T10:00:00.000Z');
    INSERT INTO recipes (id, cookbook_id, title, prep_time, ingredients, created_at, updated_at)
      VALUES (1, 1, 'Tomato soup', 15, '- tomatoes', '2026-06-01T10:00:00.000Z', '2026-06-02T10:00:00.000Z');
    INSERT INTO recipes (id, cookbook_id, title, created_at, updated_at)
      VALUES (2, NULL, 'Loose recipe', '2026-06-01T11:00:00.000Z', '2026-06-01T11:00:00.000Z');
  `);
  if (legacy.hasShopping) {
    database.exec(`
      INSERT INTO shopping_lists (id, name, created_at, updated_at)
        VALUES (1, 'Weekend', '2026-06-03T09:00:00.000Z', '2026-06-03T09:00:00.000Z');
      INSERT INTO shopping_items (id, list_id, name, quantity, checked, created_at)
        VALUES (1, 1, 'Milk', '1 l', 1, '2026-06-03T09:00:00.000Z');
      INSERT INTO app_settings (key, value) VALUES ('language', 'pl');
    `);
  }
}

describe('fresh install', () => {
  it('creates every table with exactly the columns db/schema.ts declares', async () => {
    const database = await openTestDb();
    const { CURRENT_SCHEMA_VERSION, getSchemaVersion } = migrate();

    expect(tablesOf(database)).toEqual(Object.keys(EXPECTED).sort());
    expectSchemaMatchesDrizzle(database);
    expect(userVersion(database)).toBe(CURRENT_SCHEMA_VERSION);
    expect(getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('enables foreign keys on the connection (ON DELETE rules depend on it)', async () => {
    const database = await openTestDb();
    migrate();

    expect(rows(database, 'PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
  });
});

describe.each(LEGACY_SCHEMAS)('upgrade from $label ($commit)', (legacy) => {
  async function openLegacy() {
    return openTestDb((database) => {
      database.exec(legacy.ddl);
      database.exec(`PRAGMA user_version = ${legacy.userVersion}`);
      seedLegacyData(database, legacy);
    });
  }

  it('ends on the current schema: every column Drizzle queries exists', async () => {
    const database = await openLegacy();
    const { CURRENT_SCHEMA_VERSION } = migrate();

    expectSchemaMatchesDrizzle(database);
    expect(userVersion(database)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('keeps existing data and defaults the new columns', async () => {
    const database = await openLegacy();
    migrate();

    expect(
      rows(database, 'SELECT id, cookbook_id, title, prep_time, to_try, updated_at FROM recipes ORDER BY id')
    ).toEqual([
      { id: 1, cookbook_id: 1, title: 'Tomato soup', prep_time: 15, to_try: 0, updated_at: '2026-06-02T10:00:00.000Z' },
      { id: 2, cookbook_id: null, title: 'Loose recipe', prep_time: null, to_try: 0, updated_at: '2026-06-01T11:00:00.000Z' },
    ]);
    if (legacy.hasShopping) {
      expect(rows(database, 'SELECT name, checked, checked_at FROM shopping_items')).toEqual([
        { name: 'Milk', checked: 1, checked_at: null },
      ]);
      expect(rows(database, 'SELECT key, value FROM app_settings')).toEqual([
        { key: 'language', value: 'pl' },
      ]);
    }
  });

  it('serves the migrated data through the db/ query helpers', async () => {
    await openLegacy();
    const { getAllRecipes } = require('@/db/recipes') as typeof import('@/db/recipes');
    const { getItemsForList } = require('@/db/shoppingLists') as typeof import('@/db/shoppingLists');

    const recipes = await getAllRecipes();
    expect(recipes.map((r) => [r.title, r.toTry])).toEqual([
      ['Tomato soup', 0],
      ['Loose recipe', 0],
    ]);
    if (legacy.hasShopping) {
      const items = await getItemsForList(1);
      expect(items.map((i) => [i.name, i.checked, i.checkedAt])).toEqual([['Milk', 1, null]]);
    }
  });

  it('is idempotent: the next launch migrates nothing and loses nothing', async () => {
    const database = await openLegacy();
    const { CURRENT_SCHEMA_VERSION } = migrate();
    const before = rows(database, 'SELECT * FROM recipes ORDER BY id');

    // A second app launch: fresh module registry, same database file.
    jest.resetModules();
    require('./support/expoSqliteOnSqlJs').__provideDatabase(database);
    migrate();

    expect(rows(database, 'SELECT * FROM recipes ORDER BY id')).toEqual(before);
    expect(userVersion(database)).toBe(CURRENT_SCHEMA_VERSION);
    expectSchemaMatchesDrizzle(database);
  });
});

describe('edge cases', () => {
  it('drops the tag tables left by pre-release builds', async () => {
    const database = await openTestDb((db) => {
      db.exec(LEGACY_SCHEMAS[0].ddl + PRE_RELEASE_TAG_TABLES);
    });
    migrate();

    expect(tablesOf(database)).not.toEqual(expect.arrayContaining(['tags']));
    expect(tablesOf(database)).not.toEqual(expect.arrayContaining(['recipe_tags']));
  });

  it('never stamps a newer database down to the current version', async () => {
    // A database written by a newer app version (e.g. after a downgrade):
    // the ladder only ever moves forward.
    const database = await openTestDb((db) => {
      db.exec('PRAGMA user_version = 99');
    });
    const { getSchemaVersion } = migrate();

    expect(userVersion(database)).toBe(99);
    expect(getSchemaVersion()).toBe(99);
  });
});
