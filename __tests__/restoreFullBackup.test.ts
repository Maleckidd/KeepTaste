// db/backup.ts restoreFullBackup — id remapping + timestamp preservation.
// Mocks db/client (like deleteAllData.test.ts) with an insert() that records
// values and hands back incrementing ids per table, and db/settings to assert
// which settings are restored.
import {
  cookbooks,
  recipes,
  shoppingItems,
} from '../db/schema';
import type { BackupContent } from '../utils/backupArchive';

type Insert = { table: unknown; values: Record<string, unknown> };
let inserted: Insert[] = [];
let counters: Map<unknown, number>;

const db = {
  insert: (table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      inserted.push({ table, values: vals });
      const next = (counters.get(table) ?? 0) + 1;
      counters.set(table, next);
      const result = Promise.resolve(undefined) as Promise<undefined> & {
        returning: () => Promise<{ id: number }[]>;
      };
      result.returning = () => Promise.resolve([{ id: next }]);
      return result;
    },
  }),
};

jest.mock('../db/client', () => ({ db, runMigrations: jest.fn() }));
const setSetting = jest.fn();
jest.mock('../db/settings', () => ({
  setSetting: (...a: unknown[]) => setSetting(...a),
  markDemoSeeded: () => setSetting('demo_seeded', '1'),
  markUserEdited: () => setSetting('user_edited', '1'),
}));

import { restoreFullBackup } from '../db/backup';

function rowsFor(table: unknown) {
  return inserted.filter((i) => i.table === table).map((i) => i.values);
}

beforeEach(() => {
  inserted = [];
  counters = new Map();
  setSetting.mockClear();
});

const content: BackupContent = {
  cookbooks: [
    { id: 5, name: 'A', coverImagePath: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 9, name: 'B', coverImagePath: 'x', createdAt: '2026-01-02T00:00:00.000Z' },
  ],
  recipes: [
    { id: 100, cookbookId: 9, title: 'In B', prepTime: 10, cookTime: null, servings: 2, imagePath: null, ingredients: 'i', instructions: 'n', notes: null, toTry: 0, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
    { id: 101, cookbookId: null, title: 'Loose', prepTime: null, cookTime: null, servings: null, imagePath: null, ingredients: '', instructions: '', notes: null, toTry: 0, createdAt: '2026-02-03T00:00:00.000Z', updatedAt: '2026-02-03T00:00:00.000Z' },
  ],
  shoppingLists: [
    { id: 50, name: 'L', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-02T00:00:00.000Z' },
  ],
  shoppingItems: [
    { id: 1, listId: 50, name: 'Milk', quantity: null, checked: 1, checkedAt: '2026-03-05T00:00:00.000Z', createdAt: '2026-03-03T00:00:00.000Z' },
    { id: 2, listId: 999, name: 'Orphan', quantity: null, checked: 0, checkedAt: null, createdAt: '2026-03-04T00:00:00.000Z' },
  ],
  settings: [
    { key: 'language', value: 'pl' },
    { key: 'backup_folder_uri', value: 'content://somewhere' },
    // Running cooking timers are device state (SPEC.md §5.21) — older archives
    // may still carry the key; it must never be restored.
    { key: 'active_timers', value: '[]' },
  ],
};

describe('restoreFullBackup', () => {
  it('remaps recipe.cookbookId from old to newly-inserted ids', async () => {
    await restoreFullBackup(content);
    const recipeRows = rowsFor(recipes);
    // cookbooks inserted in order get new ids 1, 2 → old 9 maps to 2
    expect(recipeRows[0].cookbookId).toBe(2);
    expect(recipeRows[1].cookbookId).toBeNull();
  });

  it('preserves created_at / updated_at on recipes and cookbooks', async () => {
    await restoreFullBackup(content);
    expect(rowsFor(cookbooks)[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    const r = rowsFor(recipes)[0];
    expect(r.createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(r.updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('remaps shopping item list ids and skips orphans', async () => {
    await restoreFullBackup(content);
    const items = rowsFor(shoppingItems);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Milk');
    expect(items[0].listId).toBe(1); // the single list got new id 1
    expect(items[0].checked).toBe(1);
    expect(items[0].checkedAt).toBe('2026-03-05T00:00:00.000Z');
  });

  it('restores a missing checkedAt (archives from before §5.10 cart order) as null', async () => {
    const { checkedAt: _drop, ...legacyMilk } = content.shoppingItems[0];
    await restoreFullBackup({
      ...content,
      shoppingItems: [legacyMilk as typeof content.shoppingItems[0]],
    });
    expect(rowsFor(shoppingItems)[0].checkedAt).toBeNull();
  });

  it('restores normal settings but skips device-specific backup_* keys', async () => {
    await restoreFullBackup(content);
    expect(setSetting).toHaveBeenCalledWith('language', 'pl');
    expect(setSetting).not.toHaveBeenCalledWith(
      'backup_folder_uri',
      expect.anything()
    );
  });

  it('never restores active_timers (SPEC.md §5.21)', async () => {
    await restoreFullBackup(content);
    expect(setSetting).not.toHaveBeenCalledWith(
      'active_timers',
      expect.anything()
    );
    // the backup_* skip still holds alongside it
    expect(setSetting).not.toHaveBeenCalledWith(
      'backup_folder_uri',
      expect.anything()
    );
  });
});
