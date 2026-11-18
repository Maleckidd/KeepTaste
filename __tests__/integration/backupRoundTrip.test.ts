// Full backup export → restore round-trip through real SQLite (SPEC.md
// §5.17.1): db/backup.ts reads every table, utils/backupArchive.ts turns it
// into backup.json and back, and the restore writes it into a different,
// empty database — a new phone. The .zip packing and image files are native
// (utils/backupArchiveFs.ts) and verified on-device; this covers the data.
import { buildBackupJson, parseBackupJson, type BackupContent } from '@/utils/backupArchive';
import { openTestDb, rows } from './support/testDb';

type Db = {
  recipes: typeof import('@/db/recipes');
  cookbooks: typeof import('@/db/cookbooks');
  shopping: typeof import('@/db/shoppingLists');
  settings: typeof import('@/db/settings');
  backup: typeof import('@/db/backup');
};

function loadDb(): Db {
  return {
    recipes: require('@/db/recipes'),
    cookbooks: require('@/db/cookbooks'),
    shopping: require('@/db/shoppingLists'),
    settings: require('@/db/settings'),
    backup: require('@/db/backup'),
  };
}

function at(iso: string) {
  jest.setSystemTime(new Date(iso));
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  at('2026-11-01T08:00:00.000Z');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** A library with one of everything the archive must carry. */
async function buildLibrary({ recipes, cookbooks, shopping, settings }: Db) {
  at('2026-10-01T10:00:00.000Z');
  const soups = await cookbooks.createCookbook({
    name: 'Soups',
    coverImagePath: 'file:///data/images/cover-1.jpg',
    createdAt: '2026-10-01T10:00:00.000Z',
  });
  at('2026-10-02T10:00:00.000Z');
  await cookbooks.createCookbook({ name: 'Empty cookbook', createdAt: '2026-10-02T10:00:00.000Z' });

  at('2026-10-03T10:00:00.000Z');
  const tomato = await recipes.createRecipe({
    cookbookId: soups,
    title: 'Tomato soup',
    prepTime: 10,
    cookTime: 25,
    servings: 4,
    imagePath: 'file:///data/images/recipe-1.jpg',
    ingredients: '- 1 kg tomatoes\n- salt',
    instructions: '1. Roast.\n2. Blend for 2 minutes.',
    notes: 'Zupa pomidorowa — babcia',
  });
  at('2026-10-04T10:00:00.000Z');
  await recipes.createRecipe({ title: 'Loose idea', toTry: 1 });
  at('2026-10-05T10:00:00.000Z');
  await recipes.updateRecipe(tomato, { servings: 6 });

  at('2026-10-06T10:00:00.000Z');
  const weekend = await shopping.createShoppingList('Weekend');
  await shopping.createShoppingItem(weekend, 'Milk', '1 l');
  const bread = await shopping.createShoppingItem(weekend, 'Bread', null);
  at('2026-10-06T11:00:00.000Z');
  await shopping.setItemChecked(bread, true);

  await settings.setSetting('language', 'pl');
  await settings.setSetting('theme', 'dark');
  // Device-only state: must not leave this phone (db/settingKeys.ts).
  await settings.saveActiveTimersJson('[{"id":"t1"}]');
  await settings.setSetting('backup_folder_uri', 'content://old-phone/tree/backups');
}

/**
 * The library as a user sees it: ids are an implementation detail (the
 * restore reassigns them), so relations are expressed by name instead.
 */
function normalize(content: BackupContent) {
  const cookbookName = new Map(content.cookbooks.map((c) => [c.id, c.name]));
  const listName = new Map(content.shoppingLists.map((l) => [l.id, l.name]));
  const strip = <T extends { id: number }>({ id: _id, ...rest }: T) => rest;
  return {
    cookbooks: content.cookbooks.map(strip),
    recipes: content.recipes
      .map(({ cookbookId, ...r }) => ({
        ...strip(r),
        cookbook: cookbookId == null ? null : cookbookName.get(cookbookId),
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    shoppingLists: content.shoppingLists.map(strip),
    shoppingItems: content.shoppingItems
      .map(({ listId, ...i }) => ({ ...strip(i), list: listName.get(listId) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    settings: [...content.settings].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/**
 * What utils/backupArchiveFs.ts does on export before building backup.json:
 * every photo is copied into the archive and its path rewritten to the
 * archive-relative `images/<file>` (the copy itself is native, not run here).
 * On restore the native side copies them back and makes the paths absolute
 * again; without it they stay relative, which is what the assertions expect.
 */
function asArchived(content: BackupContent): BackupContent {
  const rel = (p: string | null) => (p ? `images/${p.slice(p.lastIndexOf('/') + 1)}` : null);
  return {
    ...content,
    cookbooks: content.cookbooks.map((c) => ({ ...c, coverImagePath: rel(c.coverImagePath) })),
    recipes: content.recipes.map((r) => ({ ...r, imagePath: rel(r.imagePath) })),
  };
}

async function exportFrom(db: Db): Promise<string> {
  return buildBackupJson(asArchived(await db.backup.getFullBackupData()));
}

async function restoreIntoNewPhone(json: string) {
  const parsed = parseBackupJson(json);
  if (!parsed.ok) throw new Error(parsed.error);
  const database = await openTestDb();
  const db = loadDb();
  await db.backup.restoreFullBackup(parsed.content);
  return { database, db };
}

describe('full backup round-trip', () => {
  it('restores the library on an empty device exactly as it was exported', async () => {
    await openTestDb();
    const oldPhone = loadDb();
    await buildLibrary(oldPhone);
    const exported = asArchived(await oldPhone.backup.getFullBackupData());
    const json = buildBackupJson(exported);

    const { db: newPhone } = await restoreIntoNewPhone(json);
    const restored = await newPhone.backup.getFullBackupData();

    const before = normalize(exported);
    const after = normalize(restored);
    expect(after.cookbooks).toEqual(before.cookbooks);
    expect(after.recipes).toEqual(before.recipes);
    expect(after.shoppingLists).toEqual(before.shoppingLists);
    expect(after.shoppingItems).toEqual(before.shoppingItems);
    expect(after.recipes.find((r) => r.title === 'Tomato soup')?.imagePath).toBe('images/recipe-1.jpg');
    expect(after.cookbooks.find((c) => c.name === 'Soups')?.coverImagePath).toBe('images/cover-1.jpg');
  });

  it('preserves timestamps instead of stamping the restore time', async () => {
    await openTestDb();
    const oldPhone = loadDb();
    await buildLibrary(oldPhone);
    const json = await exportFrom(oldPhone);

    at('2026-11-18T12:00:00.000Z');
    const { database } = await restoreIntoNewPhone(json);

    expect(rows(database, 'SELECT title, created_at, updated_at FROM recipes ORDER BY title')).toEqual([
      { title: 'Loose idea', created_at: '2026-10-04T10:00:00.000Z', updated_at: '2026-10-04T10:00:00.000Z' },
      { title: 'Tomato soup', created_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-05T10:00:00.000Z' },
    ]);
    expect(rows(database, 'SELECT name, checked, checked_at FROM shopping_items ORDER BY name')).toEqual([
      { name: 'Bread', checked: 1, checked_at: '2026-10-06T11:00:00.000Z' },
      { name: 'Milk', checked: 0, checked_at: null },
    ]);
  });

  it('remaps ids so relations survive a restore next to existing data', async () => {
    await openTestDb();
    const oldPhone = loadDb();
    await buildLibrary(oldPhone);
    const json = await exportFrom(oldPhone);
    const parsed = parseBackupJson(json);
    if (!parsed.ok) throw new Error(parsed.error);

    // "Add" restore: the target already holds rows, so the archive's ids are
    // taken and every foreign key has to follow the remapping.
    const database = await openTestDb();
    const target = loadDb();
    await target.cookbooks.createCookbook({ name: 'Already here' });
    await target.cookbooks.createCookbook({ name: 'Also here' });
    await target.shopping.createShoppingList('Existing list');
    await target.backup.restoreFullBackup(parsed.content);

    expect(
      rows(database, `
        SELECT r.title, c.name AS cookbook FROM recipes r
        LEFT JOIN cookbooks c ON c.id = r.cookbook_id ORDER BY r.title`)
    ).toEqual([
      { title: 'Loose idea', cookbook: null },
      { title: 'Tomato soup', cookbook: 'Soups' },
    ]);
    expect(
      rows(database, `
        SELECT i.name, l.name AS list FROM shopping_items i
        JOIN shopping_lists l ON l.id = i.list_id ORDER BY i.name`)
    ).toEqual([
      { name: 'Bread', list: 'Weekend' },
      { name: 'Milk', list: 'Weekend' },
    ]);
  });

  it('keeps device-only settings on the old phone and stamps the seed flags', async () => {
    await openTestDb();
    const oldPhone = loadDb();
    await buildLibrary(oldPhone);
    const json = await exportFrom(oldPhone);

    // Running timers are never exported…
    expect(JSON.parse(json).settings.map((s: { key: string }) => s.key)).not.toContain('active_timers');

    const { database, db } = await restoreIntoNewPhone(json);

    // …and another phone's backup folder is never restored.
    expect(rows(database, 'SELECT key, value FROM app_settings ORDER BY key')).toEqual([
      { key: 'demo_seeded', value: '1' },
      { key: 'language', value: 'pl' },
      { key: 'theme', value: 'dark' },
      { key: 'user_edited', value: '1' },
    ]);
    expect(await db.backup.canSilentReplace()).toBe(false);
  });

  it('restores an archive from before to_try / checked_at with their defaults', async () => {
    await openTestDb();
    const oldPhone = loadDb();
    await buildLibrary(oldPhone);
    const archive = JSON.parse(await exportFrom(oldPhone));
    // schemaVersion 1 archives predate both columns.
    archive.schemaVersion = 1;
    for (const r of archive.recipes) delete r.toTry;
    for (const i of archive.shoppingItems) delete i.checkedAt;

    const { database } = await restoreIntoNewPhone(JSON.stringify(archive));

    expect(rows(database, 'SELECT title, to_try FROM recipes ORDER BY title')).toEqual([
      { title: 'Loose idea', to_try: 0 },
      { title: 'Tomato soup', to_try: 0 },
    ]);
    expect(rows(database, 'SELECT name, checked_at FROM shopping_items ORDER BY name')).toEqual([
      { name: 'Bread', checked_at: null },
      { name: 'Milk', checked_at: null },
    ]);
  });
});
