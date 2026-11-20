// Domain rules of the db/ layer that live in SQL, not in TypeScript: the
// foreign-key actions and the ORDER BY clauses. The unit tests mock db/client,
// so they can only check which Drizzle calls are made; here the queries run.
import { openTestDb, rows } from './support/testDb';

type Db = {
  recipes: typeof import('@/db/recipes');
  cookbooks: typeof import('@/db/cookbooks');
  shopping: typeof import('@/db/shoppingLists');
};

function loadDb(): Db {
  return {
    recipes: require('@/db/recipes'),
    cookbooks: require('@/db/cookbooks'),
    shopping: require('@/db/shoppingLists'),
  };
}

/** Moves the clock so each write gets a distinct, known timestamp. */
function at(iso: string) {
  jest.setSystemTime(new Date(iso));
}

beforeEach(() => {
  // Fake Date for deterministic updated_at; the auto-backup debounce timers
  // the mutations arm are fake too and never fire. Promise/microtask
  // scheduling stays real so the awaited queries resolve.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  at('2026-11-01T08:00:00.000Z');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('deleting a cookbook', () => {
  it('keeps its recipes and sets their cookbook_id to NULL', async () => {
    const database = await openTestDb();
    const { recipes, cookbooks } = loadDb();
    const soups = await cookbooks.createCookbook({ name: 'Soups' });
    const cakes = await cookbooks.createCookbook({ name: 'Cakes' });
    const tomato = await recipes.createRecipe({ title: 'Tomato soup', cookbookId: soups });
    const cheesecake = await recipes.createRecipe({ title: 'Cheesecake', cookbookId: cakes });

    await cookbooks.deleteCookbook(soups);

    expect(rows(database, 'SELECT id, cookbook_id FROM recipes ORDER BY id')).toEqual([
      { id: tomato, cookbook_id: null },
      { id: cheesecake, cookbook_id: cakes },
    ]);
    expect((await recipes.getUnassignedRecipes()).map((r) => r.title)).toEqual(['Tomato soup']);
    expect((await recipes.getAllRecipes()).map((r) => r.title).sort()).toEqual([
      'Cheesecake',
      'Tomato soup',
    ]);
    expect(await cookbooks.getCookbookById(soups)).toBeUndefined();
  });
});

describe('deleting a shopping list', () => {
  it('cascades to its items, and only its items', async () => {
    const database = await openTestDb();
    const { shopping } = loadDb();
    const weekend = await shopping.createShoppingList('Weekend');
    const party = await shopping.createShoppingList('Party');
    await shopping.createShoppingItems(weekend, ['Milk', 'Bread']);
    await shopping.createShoppingItem(party, 'Crisps', '2 packs');

    await shopping.deleteShoppingList(weekend);

    expect(rows(database, 'SELECT name, list_id FROM shopping_items')).toEqual([
      { name: 'Crisps', list_id: party },
    ]);
  });
});

describe('recipe ordering by updated_at, newest first', () => {
  it('lists the most recently saved recipe first, everywhere', async () => {
    await openTestDb();
    const { recipes, cookbooks } = loadDb();
    const book = await cookbooks.createCookbook({ name: 'Mains' });

    at('2026-11-01T09:00:00.000Z');
    const first = await recipes.createRecipe({ title: 'First', cookbookId: book });
    at('2026-11-02T09:00:00.000Z');
    await recipes.createRecipe({ title: 'Second', cookbookId: book });
    at('2026-11-03T09:00:00.000Z');
    await recipes.createRecipe({ title: 'Third', cookbookId: book });

    expect((await recipes.getAllRecipes()).map((r) => r.title)).toEqual(['Third', 'Second', 'First']);
    expect((await recipes.getRecipesByCookbook(book)).map((r) => r.title)).toEqual([
      'Third',
      'Second',
      'First',
    ]);

    // Editing the oldest recipe moves it to the top and stamps updated_at only.
    at('2026-11-04T09:00:00.000Z');
    await recipes.updateRecipe(first, { notes: 'less salt' });

    expect((await recipes.getAllRecipes()).map((r) => r.title)).toEqual(['First', 'Third', 'Second']);
    const edited = await recipes.getRecipeById(first);
    expect(edited).toMatchObject({
      createdAt: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-11-04T09:00:00.000Z',
    });
  });

  it('marking a to-try recipe as tried bumps it to the top (SPEC.md §5.19)', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const tried = await recipes.createRecipe({ title: 'New idea', toTry: 1 });
    at('2026-11-02T09:00:00.000Z');
    await recipes.createRecipe({ title: 'Regular' });

    at('2026-11-05T09:00:00.000Z');
    await recipes.markRecipeTried(tried);

    const all = await recipes.getAllRecipes();
    expect(all.map((r) => [r.title, r.toTry])).toEqual([
      ['New idea', 0],
      ['Regular', 0],
    ]);
  });

  it('reports the newest change across recipes and cookbooks', async () => {
    await openTestDb();
    const { recipes, cookbooks } = loadDb();
    expect(await recipes.getLatestDataChangeAt()).toBeNull();

    at('2026-11-01T09:00:00.000Z');
    await recipes.createRecipe({ title: 'Soup' });
    at('2026-11-06T09:00:00.000Z');
    await cookbooks.createCookbook({ name: 'Later cookbook', createdAt: new Date().toISOString() });

    expect(await recipes.getLatestDataChangeAt()).toBe('2026-11-06T09:00:00.000Z');
  });
});

describe('to-try marking (SPEC.md §5.19)', () => {
  it('marks a normal recipe without touching updated_at or created_at', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const id = await recipes.createRecipe({ title: 'Soup' });

    at('2026-11-02T09:00:00.000Z');
    await recipes.markRecipeToTry(id);

    expect(await recipes.getRecipeById(id)).toMatchObject({
      toTry: 1,
      createdAt: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
  });

  it('does not reorder the list', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const a = await recipes.createRecipe({ title: 'A' });
    at('2026-11-02T09:00:00.000Z');
    await recipes.createRecipe({ title: 'B' });

    at('2026-11-03T09:00:00.000Z');
    await recipes.markRecipeToTry(a);

    const all = await recipes.getAllRecipes();
    expect(all.map((r) => [r.title, r.toTry])).toEqual([
      ['B', 0],
      ['A', 1],
    ]);
  });

  it('is idempotent on an already to-try recipe', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const id = await recipes.createRecipe({ title: 'Idea', toTry: 1 });

    at('2026-11-02T09:00:00.000Z');
    await expect(recipes.markRecipeToTry(id)).resolves.toBeUndefined();

    expect(await recipes.getRecipeById(id)).toMatchObject({
      toTry: 1,
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
  });

  it('changes only the target row', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const a = await recipes.createRecipe({ title: 'A' });
    const b = await recipes.createRecipe({ title: 'B' });

    at('2026-11-02T09:00:00.000Z');
    await recipes.markRecipeToTry(a);

    expect(await recipes.getRecipeById(a)).toMatchObject({ toTry: 1 });
    expect(await recipes.getRecipeById(b)).toMatchObject({
      toTry: 0,
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
  });

  it('resolves for an unknown id and changes no rows', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const id = await recipes.createRecipe({ title: 'Soup' });

    await expect(recipes.markRecipeToTry(id + 999)).resolves.toBeUndefined();

    expect(await recipes.getAllRecipes()).toHaveLength(1);
    expect(await recipes.getRecipeById(id)).toMatchObject({ toTry: 0 });
  });

  it('round trip: mark keeps the order, then Tried it bumps to the top', async () => {
    await openTestDb();
    const { recipes } = loadDb();
    at('2026-11-01T09:00:00.000Z');
    const a = await recipes.createRecipe({ title: 'A' });
    at('2026-11-02T09:00:00.000Z');
    await recipes.createRecipe({ title: 'B' });

    at('2026-11-03T09:00:00.000Z');
    await recipes.markRecipeToTry(a);
    at('2026-11-04T09:00:00.000Z');
    await recipes.markRecipeTried(a);

    expect(await recipes.getRecipeById(a)).toMatchObject({
      toTry: 0,
      updatedAt: '2026-11-04T09:00:00.000Z',
    });
    const all = await recipes.getAllRecipes();
    expect(all.map((r) => r.title)).toEqual(['A', 'B']);
  });
});

describe('deleting all data', () => {
  it('empties every user table and returns the image paths to clean up', async () => {
    const database = await openTestDb();
    const { recipes, cookbooks, shopping } = loadDb();
    const book = await cookbooks.createCookbook({ name: 'Soups', coverImagePath: 'file:///cover.jpg' });
    await recipes.createRecipe({ title: 'Soup', cookbookId: book, imagePath: 'file:///soup.jpg' });
    await recipes.createRecipe({ title: 'No photo' });
    const list = await shopping.createShoppingList('Weekend');
    await shopping.createShoppingItems(list, ['Milk']);

    const paths = await recipes.deleteAllData();

    expect(paths.sort()).toEqual(['file:///cover.jpg', 'file:///soup.jpg']);
    for (const table of ['recipes', 'cookbooks', 'shopping_lists', 'shopping_items']) {
      expect(rows(database, `SELECT count(*) AS n FROM ${table}`)).toEqual([{ n: 0 }]);
    }
  });
});
