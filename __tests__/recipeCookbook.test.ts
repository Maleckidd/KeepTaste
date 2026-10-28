// Package A "First recipe" (SPEC.md §5.5 "Cookbook field") — db/recipes
// contract for the cookbook field on create/edit.
//
// These pin the payload shapes RecipeForm relies on: the cookbook the user
// picks (or clears) must reach the DB verbatim, and an update that does not
// mention cookbookId must leave it untouched. They may already pass against the
// current implementation; that is intended.
//
// Mocked Drizzle harness (same call shapes as shoppingLists.test.ts):
//   - db.insert(t).values(v).returning(...) → thenable, resolves to [{ id }]
//   - db.update(t).set(s).where(w)          → thenable

import { recipes } from '../db/schema';

const insertCalls: { table: unknown; values: unknown }[] = [];
const updateCalls: { table: unknown; set: unknown }[] = [];
let nextInsertId = 1;

const db = {
  select: jest.fn(() => ({
    from: jest.fn(() => {
      const promise: any = Promise.resolve([]);
      promise.where = jest.fn(() => Promise.resolve([]));
      promise.orderBy = jest.fn(() => Promise.resolve([]));
      return promise;
    }),
  })),
  insert: jest.fn((table: unknown) => ({
    values: jest.fn((values: unknown) => {
      insertCalls.push({ table, values });
      const id = nextInsertId++;
      const promise: any = Promise.resolve([{ id }]);
      promise.returning = jest.fn(() => Promise.resolve([{ id }]));
      return promise;
    }),
  })),
  update: jest.fn((table: unknown) => ({
    set: jest.fn((set: unknown) => {
      updateCalls.push({ table, set });
      return { where: jest.fn(() => Promise.resolve(undefined)) };
    }),
  })),
  delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve(undefined)) })),
};

jest.mock('../db/client', () => ({ db, runMigrations: jest.fn() }));
jest.mock('../db/userEdited', () => ({ noteUserEdit: jest.fn() }));
jest.mock('../utils/backupTrigger', () => ({
  scheduleAutoBackup: jest.fn(),
  withAutoBackupSuppressed: (fn: () => unknown) => fn(),
  isAutoBackupSuppressed: () => false,
}));

import { createRecipe, updateRecipe } from '../db/recipes';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  nextInsertId = 1;
  db.insert.mockClear();
  db.update.mockClear();
});

describe('db/recipes — updateRecipe cookbook field (§5.5)', () => {
  it('writes a chosen cookbookId', async () => {
    await updateRecipe(1, { cookbookId: 5 });

    expect(db.update).toHaveBeenCalledWith(recipes);
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].set as any).cookbookId).toBe(5);
  });

  it('writes cookbookId null as a present key (clearing the cookbook)', async () => {
    await updateRecipe(1, { cookbookId: null });

    const set = updateCalls[0].set as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(set, 'cookbookId')).toBe(true);
    expect(set.cookbookId).toBeNull();
  });

  it('does not add a cookbookId key when the payload omits it', async () => {
    await updateRecipe(1, { title: 'x' });

    const set = updateCalls[0].set as Record<string, unknown>;
    expect(set.title).toBe('x');
    expect(Object.prototype.hasOwnProperty.call(set, 'cookbookId')).toBe(false);
  });

  it.each([
    [{ cookbookId: 5 }],
    [{ cookbookId: null }],
    [{ title: 'x' }],
  ])('sets an ISO updatedAt on every update (%j)', async (payload) => {
    await updateRecipe(1, payload);

    const set = updateCalls[0].set as Record<string, unknown>;
    expect(typeof set.updatedAt).toBe('string');
    expect(set.updatedAt).toMatch(ISO_RE);
  });
});

describe('db/recipes — createRecipe cookbook field (§5.5)', () => {
  it('inserts cookbookId null for an uncategorized recipe and returns the new id', async () => {
    const id = await createRecipe({
      cookbookId: null,
      title: 'Pierogi',
      ingredients: '',
      instructions: '',
    });

    expect(db.insert).toHaveBeenCalledWith(recipes);
    expect(insertCalls).toHaveLength(1);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(values, 'cookbookId')).toBe(true);
    expect(values.cookbookId).toBeNull();
    expect(id).toBe(1);
  });

  it('inserts the chosen cookbookId', async () => {
    await createRecipe({
      cookbookId: 3,
      title: 'Sernik',
      ingredients: '',
      instructions: '',
    });

    expect((insertCalls[0].values as any).cookbookId).toBe(3);
  });
});
