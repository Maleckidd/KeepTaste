// Wiring regression test: the change-driven backup (SPEC.md §5.17.3) must be
// scheduled by recipe and cookbook mutations, but NOT by shopping-list/item
// mutations (they churn constantly — checking items off). This guards against a
// future refactor silently dropping (or wrongly adding) a scheduleAutoBackup()
// call. We stub db/client so the mutations run without a real database, and mock
// the trigger so we can assert exactly when it fires.

// Chainable + thenable Drizzle stub: supports
//   db.insert(t).values(v).returning(c)        → resolves [{ id: 1 }]
//   db.update(t).set(v).where(w)               → awaitable (resolves undefined)
//   db.delete(t).where(w)                      → awaitable (resolves undefined)
//   db.select().from(t).where(w)               → awaitable (resolves [])
function makeChain(): any {
  const chain: any = {
    values: () => chain,
    set: () => chain,
    from: () => chain,
    where: () => chain,
    returning: () => Promise.resolve([{ id: 1 }]),
    // Awaiting the chain itself (update/delete/select terminals) resolves a
    // harmless empty result.
    then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
  };
  return chain;
}

jest.mock('../db/client', () => ({
  db: {
    insert: () => makeChain(),
    update: () => makeChain(),
    delete: () => makeChain(),
    select: () => makeChain(),
  },
  runMigrations: jest.fn(),
}));

jest.mock('../utils/backupTrigger', () => ({
  scheduleAutoBackup: jest.fn(),
  withAutoBackupSuppressed: (fn: () => unknown) => fn(),
}));

import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from '../db/recipes';
import {
  createCookbook,
  updateCookbook,
  deleteCookbook,
} from '../db/cookbooks';
import {
  createShoppingList,
  updateShoppingListName,
  deleteShoppingList,
  createShoppingItem,
  setItemChecked,
  deleteShoppingItem,
} from '../db/shoppingLists';
import { scheduleAutoBackup } from '../utils/backupTrigger';

const mockSchedule = scheduleAutoBackup as jest.MockedFunction<
  typeof scheduleAutoBackup
>;

beforeEach(() => {
  mockSchedule.mockClear();
});

describe('recipe mutations schedule a backup', () => {
  it('createRecipe', async () => {
    await createRecipe({ title: 'Test' } as any);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('updateRecipe', async () => {
    await updateRecipe(1, { title: 'Edited' } as any);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('deleteRecipe', async () => {
    await deleteRecipe(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('cookbook mutations schedule a backup', () => {
  it('createCookbook', async () => {
    await createCookbook({ name: 'Book' } as any);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('updateCookbook', async () => {
    await updateCookbook(1, { name: 'Renamed' } as any);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('deleteCookbook', async () => {
    await deleteCookbook(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('shopping-list mutations do NOT schedule a backup', () => {
  it('createShoppingList', async () => {
    await createShoppingList('Groceries');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('updateShoppingListName', async () => {
    await updateShoppingListName(1, 'Weekend');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('deleteShoppingList', async () => {
    await deleteShoppingList(1);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('createShoppingItem', async () => {
    await createShoppingItem(1, 'Milk', null);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('setItemChecked', async () => {
    await setItemChecked(1, true);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('deleteShoppingItem', async () => {
    await deleteShoppingItem(1);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
