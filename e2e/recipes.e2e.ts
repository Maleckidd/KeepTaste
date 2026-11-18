import { expect, test, describe } from 'e2e';
import { createRecipe, openAllRecipes } from './support/recipes';

// Web only: these tests rely on the web build's fresh in-memory database per
// page load. On a device the data persists between tests.
describe('recipes', { platforms: ['web'] }, () => {
  test('a saved recipe shows up with its metadata', async ({ app, screen }) => {
    await app.open();
    await createRecipe(screen, {
      title: 'Żurek',
      prep: '20',
      servings: '4',
      ingredients: '500 ml zakwasu\n2 jajka',
    });
    await openAllRecipes(screen);
    const tile = screen.getByRole('button', /^Żurek/);
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('4 servings');

    await tile.tap();
    await expect(screen.getByRole('heading', 'Żurek')).toBeVisible();
    await expect(screen.getByText('500 ml zakwasu')).toBeVisible();
  });

  test('the title is the only required field', async ({ app, screen }) => {
    await app.open();
    await screen.getByRole('button', 'Add recipe').tap();
    await screen.getByRole('button', 'Save').tap();
    // Still on the form, nothing saved.
    await expect(screen.getByRole('heading', 'New recipe')).toBeVisible();
    await expect(screen.getByText('Recipe saved')).toBeHidden();
  });

  // SPEC §5.5: numeric fields save an integer >= 1 or null, never NaN — and
  // missing metadata is hidden, with no "—" placeholder.
  for (const servings of ['0', 'abc', '-3']) {
    test(`servings "${servings}" is saved as no servings`, async ({ app, screen }) => {
      await app.open();
      await createRecipe(screen, { title: 'Bigos', servings });
      await openAllRecipes(screen);
      const tile = screen.getByRole('button', /^Bigos/);
      await expect(tile).toBeVisible();
      await expect(tile).not.toContainText('serving');
      await expect(tile).not.toContainText('NaN');
      await expect(tile).not.toContainText('—');
    });
  }

  // SPEC §5.3: search folds diacritics and matches ingredients, in JS.
  test('search ignores Polish diacritics and matches ingredients', async ({ app, screen }) => {
    await app.open();
    await createRecipe(screen, { title: 'Żurek', ingredients: 'kiełbasa\nzakwas' });
    await openAllRecipes(screen);
    const search = screen.getByRole('textbox', 'Search by name or ingredient');

    await search.fill('zurek');
    await expect(screen.getByRole('button', /^Żurek/)).toBeVisible();
    await expect(screen.getByRole('button', /^Pancakes/)).toBeHidden();

    await search.fill('kielbasa');
    await expect(screen.getByRole('button', /^Żurek/)).toBeVisible();

    await search.fill('xyz-nothing');
    await expect(screen.getByRole('button', /^Żurek/)).toBeHidden();
  });
});
