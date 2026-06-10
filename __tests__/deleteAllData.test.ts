// TDD red phase for deleteAllData (Settings → "delete all data").
//
// We mock db/client so importing db/recipes is pure. The mock models the two
// query shapes the implementation is expected to use, consistent with the rest
// of db/recipes.ts:
//   - db.select(...).from(table)  → awaitable, resolves to an array of rows
//   - db.delete(table)            → awaitable (Drizzle delete with no .where)
//
// Both select and delete return a thenable so they can be `await`ed directly,
// matching how unfiltered Drizzle queries behave at runtime.

import { recipes, cookbooks } from '../db/schema';

// Per-test queues of rows the next two `.from(...)` calls should resolve to.
// The implementation selects recipe rows first, then cookbook rows.
let selectResults: unknown[][] = [];

const deleteCalls: unknown[] = [];

function thenableArray(rows: unknown[]) {
  // An array-like awaitable: `await db.select(...).from(t)` yields `rows`.
  return Promise.resolve(rows);
}

const db = {
  select: jest.fn(() => ({
    from: jest.fn(() => {
      const rows = selectResults.shift() ?? [];
      return thenableArray(rows);
    }),
  })),
  delete: jest.fn((table: unknown) => {
    deleteCalls.push(table);
    // Unfiltered delete: awaitable, resolves to nothing meaningful.
    return Promise.resolve(undefined);
  }),
};

jest.mock('../db/client', () => ({ db, runMigrations: jest.fn() }));

import * as recipesModule from '../db/recipes';

beforeEach(() => {
  selectResults = [];
  deleteCalls.length = 0;
  db.select.mockClear();
  db.delete.mockClear();
});

describe('db/recipes — deleteAllData', () => {
  it('is exported as a function', () => {
    expect(typeof (recipesModule as Record<string, unknown>).deleteAllData).toBe(
      'function'
    );
  });

  it('deletes recipes before cookbooks (both tables, unfiltered)', async () => {
    // recipe rows, then cookbook rows
    selectResults = [[], []];

    await (recipesModule as any).deleteAllData();

    expect(db.delete).toHaveBeenCalledTimes(2);
    expect(deleteCalls).toEqual([recipes, cookbooks]);
  });

  it('returns combined non-null image paths from recipes and cookbooks', async () => {
    selectResults = [
      // recipe rows: imagePath, mix of strings and null
      [
        { imagePath: '/img/recipe-a.jpg' },
        { imagePath: null },
        { imagePath: '/img/recipe-b.jpg' },
      ],
      // cookbook rows: coverImagePath, mix of strings and null
      [
        { coverImagePath: '/img/cover-1.jpg' },
        { coverImagePath: null },
      ],
    ];

    const result = await (recipesModule as any).deleteAllData();

    expect(Array.isArray(result)).toBe(true);
    // No nulls survive.
    expect(result).not.toContain(null);
    // Both sources represented.
    expect(result).toEqual(
      expect.arrayContaining([
        '/img/recipe-a.jpg',
        '/img/recipe-b.jpg',
        '/img/cover-1.jpg',
      ])
    );
    expect(result).toHaveLength(3);
  });

  it('returns [] when both tables are empty', async () => {
    selectResults = [[], []];

    const result = await (recipesModule as any).deleteAllData();

    expect(result).toEqual([]);
  });
});
