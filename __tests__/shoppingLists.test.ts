// TDD red phase for the Shopping lists feature — db helpers.
//
// Target module (does NOT exist yet): db/shoppingLists.ts
// Target schema tables (do NOT exist yet): shoppingLists, shoppingItems in db/schema.ts
//
// We mock db/client so importing db/shoppingLists is pure. The mock models the
// Drizzle call shapes the implementation is expected to use, consistent with the
// rest of db/* (see recipes.test.ts / deleteAllData.test.ts):
//   - db.select(...).from(t)                       → thenable, resolves to rows
//   - db.select(...).from(t).where(...)            → thenable, resolves to rows
//   - db.select(...).from(t).orderBy(...)          → thenable, resolves to rows
//   - db.insert(t).values(v).returning(...)        → thenable, resolves to [{ id }]
//   - db.update(t).set(s).where(w)                 → thenable
//   - db.delete(t).where(w)                        → thenable

import { shoppingLists, shoppingItems } from '../db/schema';

// ---- Mock state ----------------------------------------------------------

// FIFO queue of result-sets the next `.from(...)` chains resolve to. Tests push
// rows in the exact order the implementation is expected to issue selects.
let selectResults: unknown[][] = [];

const insertCalls: { table: unknown; values: unknown }[] = [];
const updateCalls: { table: unknown; set: unknown }[] = [];
const deleteCalls: { table: unknown }[] = [];

let nextInsertId = 1;

// A thenable that also exposes the chain methods used after .from():
function selectChain() {
  const rows = selectResults.shift() ?? [];
  const promise: any = Promise.resolve(rows);
  promise.where = jest.fn(() => Promise.resolve(rows));
  promise.orderBy = jest.fn(() => Promise.resolve(rows));
  return promise;
}

const db = {
  select: jest.fn(() => ({
    from: jest.fn(() => selectChain()),
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
  delete: jest.fn((table: unknown) => {
    deleteCalls.push({ table });
    return { where: jest.fn(() => Promise.resolve(undefined)) };
  }),
};

jest.mock('../db/client', () => ({ db, runMigrations: jest.fn() }));

import * as listsModule from '../db/shoppingLists';

beforeEach(() => {
  selectResults = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  nextInsertId = 1;
  db.select.mockClear();
  db.insert.mockClear();
  db.update.mockClear();
  db.delete.mockClear();
});

describe('db/shoppingLists — exports', () => {
  it.each([
    'getShoppingLists',
    'getShoppingListById',
    'createShoppingList',
    'deleteShoppingList',
    'getItemsForList',
    'createShoppingItem',
    'setItemChecked',
    'deleteShoppingItem',
  ])('exports %s as a function', (name) => {
    expect(typeof (listsModule as Record<string, unknown>)[name]).toBe(
      'function'
    );
  });
});

describe('db/shoppingLists — createShoppingList', () => {
  it('inserts into shoppingLists and returns the new id', async () => {
    const id = await listsModule.createShoppingList('Weekly shop');

    expect(db.insert).toHaveBeenCalledWith(shoppingLists);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe(shoppingLists);
    expect((insertCalls[0].values as any).name).toBe('Weekly shop');
    expect(id).toBe(1);
  });

  it('sets createdAt === updatedAt on insert', async () => {
    await listsModule.createShoppingList('Weekly shop');
    const values = insertCalls[0].values as any;
    expect(values.createdAt).toBe(values.updatedAt);
    expect(typeof values.createdAt).toBe('string');
  });
});

describe('db/shoppingLists — createShoppingItem', () => {
  it('inserts the item and touches the parent list updatedAt', async () => {
    await listsModule.createShoppingItem(42, 'Milk', '1 l');

    // item insert
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe(shoppingItems);
    const values = insertCalls[0].values as any;
    expect(values.listId).toBe(42);
    expect(values.name).toBe('Milk');
    expect(values.quantity).toBe('1 l');

    // parent touch
    expect(db.update).toHaveBeenCalledWith(shoppingLists);
    expect(updateCalls.some((c) => c.table === shoppingLists)).toBe(true);
    const listUpdate = updateCalls.find((c) => c.table === shoppingLists)!;
    expect(typeof (listUpdate.set as any).updatedAt).toBe('string');
  });
});

describe('db/shoppingLists — setItemChecked', () => {
  it('updates the item checked flag and touches the parent list', async () => {
    // The helper may select the item first to learn its listId.
    // Queue that select to return one row.
    selectResults = [[{ id: 5, listId: 42, checked: 0 }]];

    await listsModule.setItemChecked(5, true);

    // item updated with checked = 1
    expect(db.update).toHaveBeenCalledWith(shoppingItems);
    const itemUpdate = updateCalls.find((c) => c.table === shoppingItems)!;
    expect(itemUpdate).toBeDefined();
    expect((itemUpdate.set as any).checked).toBe(1);

    // parent list touched
    expect(db.update).toHaveBeenCalledWith(shoppingLists);
    const listUpdate = updateCalls.find((c) => c.table === shoppingLists)!;
    expect(listUpdate).toBeDefined();
    expect(typeof (listUpdate.set as any).updatedAt).toBe('string');
  });

  it('stores checked = 0 when unchecking', async () => {
    selectResults = [[{ id: 5, listId: 42, checked: 1 }]];
    await listsModule.setItemChecked(5, false);
    const itemUpdate = updateCalls.find((c) => c.table === shoppingItems)!;
    expect((itemUpdate.set as any).checked).toBe(0);
  });
});

describe('db/shoppingLists — deleteShoppingItem', () => {
  it('deletes the item and touches the parent list updatedAt', async () => {
    // helper may select the item first to learn its listId
    selectResults = [[{ id: 9, listId: 42, checked: 0 }]];

    await listsModule.deleteShoppingItem(9);

    expect(db.delete).toHaveBeenCalledWith(shoppingItems);
    expect(deleteCalls.some((c) => c.table === shoppingItems)).toBe(true);

    expect(db.update).toHaveBeenCalledWith(shoppingLists);
    const listUpdate = updateCalls.find((c) => c.table === shoppingLists)!;
    expect(typeof (listUpdate.set as any).updatedAt).toBe('string');
  });
});

describe('db/shoppingLists — deleteShoppingList', () => {
  it('deletes from shoppingLists', async () => {
    await listsModule.deleteShoppingList(3);
    expect(db.delete).toHaveBeenCalledWith(shoppingLists);
    expect(deleteCalls.some((c) => c.table === shoppingLists)).toBe(true);
  });
});

describe('db/shoppingLists — updateShoppingListName', () => {
  it('updates the name and refreshes updatedAt', async () => {
    await (listsModule as any).updateShoppingListName(5, 'Weekend BBQ');

    expect(db.update).toHaveBeenCalledWith(shoppingLists);
    const call = updateCalls.find((c) => c.table === shoppingLists);
    expect(call).toBeDefined();
    const set = call!.set as { name?: string; updatedAt?: string };
    expect(set.name).toBe('Weekend BBQ');
    expect(typeof set.updatedAt).toBe('string');
    expect(set.updatedAt!.length).toBeGreaterThan(0);
  });
});

describe('db/shoppingLists — getShoppingLists', () => {
  it('annotates each list with totalCount and checkedCount, preserving list order', async () => {
    // Select ordering assumed: (1) lists, then (2) items across all lists.
    selectResults = [
      // lists query (already ordered, e.g. by updatedAt desc)
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ],
      // items query (all items, any order)
      [
        { listId: 1, checked: 0 },
        { listId: 1, checked: 1 },
        { listId: 2, checked: 1 },
        { listId: 2, checked: 1 },
        { listId: 2, checked: 0 },
      ],
    ];

    const result = await listsModule.getShoppingLists();

    expect(result.map((l: any) => l.id)).toEqual([1, 2, 3]);

    expect(result[0]).toMatchObject({
      id: 1,
      totalCount: 2,
      checkedCount: 1,
    });
    expect(result[1]).toMatchObject({
      id: 2,
      totalCount: 3,
      checkedCount: 2,
    });
    // List with no items → zero counts.
    expect(result[2]).toMatchObject({
      id: 3,
      totalCount: 0,
      checkedCount: 0,
    });
  });
});

describe('db/shoppingLists — getItemsForList', () => {
  it('selects items for the given list', async () => {
    selectResults = [
      [
        { id: 1, listId: 42, name: 'Milk', checked: 0 },
        { id: 2, listId: 42, name: 'Eggs', checked: 1 },
      ],
    ];

    const items = await listsModule.getItemsForList(42);
    expect(db.select).toHaveBeenCalled();
    expect(items).toHaveLength(2);
  });
});

describe('db/shoppingLists — getShoppingListById', () => {
  it('returns a single list or undefined', async () => {
    selectResults = [[{ id: 7, name: 'Party' }]];
    const list = await listsModule.getShoppingListById(7);
    expect(list).toMatchObject({ id: 7 });

    selectResults = [[]];
    const missing = await listsModule.getShoppingListById(999);
    expect(missing).toBeUndefined();
  });
});
