import { createRecipe, expect, openAllRecipes, test } from './support/fixtures';

// These rely on the web build's fresh in-memory database per page load.

test('a saved recipe shows up with its metadata', async ({ app }) => {
  await createRecipe(app, {
    title: 'Żurek',
    prep: '20',
    servings: '4',
    ingredients: '500 ml zakwasu\n2 jajka',
  });
  await openAllRecipes(app);
  const tile = app.getByRole('button', { name: /^Żurek/ });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('4 servings');

  await tile.click();
  await expect(app.getByRole('heading', { name: 'Żurek' })).toBeVisible();
  await expect(app.getByText('500 ml zakwasu')).toBeVisible();
});

// SPEC.md §5.5 "Save confirmation" (F-010): saving opens the new recipe.
test('saving a new recipe opens its view with a plain snackbar', async ({ app }) => {
  await app.getByRole('button', { name: 'Add recipe' }).click();
  await app.getByTestId('recipe-title').fill('Żurek');
  await app.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('heading', { name: 'Żurek' })).toBeVisible();
  await expect(app.getByText('Recipe saved')).toBeVisible();
  await expect(app.getByRole('button', { name: 'Show' })).toBeHidden();

  await app.getByRole('button', { name: 'Go back' }).click();
  await expect(app.getByRole('heading', { name: 'KeepTaste' })).toBeVisible();
  await openAllRecipes(app);
  await expect(app.getByRole('button', { name: /^Żurek/ })).toBeVisible();
});

test('saving from a cookbook opens the recipe and Back returns to the cookbook', async ({ app }) => {
  await app.getByRole('button', { name: 'Breakfasts' }).click();
  await expect(app.getByRole('heading', { name: 'Breakfasts' })).toBeVisible();
  await app.getByRole('button', { name: 'Add recipe' }).click();
  await app.getByTestId('recipe-title').fill('Owsianka');
  await app.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('heading', { name: 'Owsianka' })).toBeVisible();
  await expect(app.getByText('Saved in "Breakfasts"')).toBeVisible();
  await expect(app.getByRole('button', { name: 'Show' })).toBeHidden();

  await app.getByRole('button', { name: 'Go back' }).click();
  await expect(app.getByRole('heading', { name: 'Breakfasts' })).toBeVisible();
  await expect(app.getByRole('button', { name: /^Owsianka/ })).toBeVisible();
});

test('closing the new-recipe form returns home without a snackbar', async ({ app }) => {
  await app.getByRole('button', { name: 'Add recipe' }).click();
  await expect(app.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await app.getByRole('button', { name: 'Close' }).click();
  await expect(app.getByRole('heading', { name: 'KeepTaste' })).toBeVisible();
  await expect(app.getByText('Recipe saved')).toBeHidden();
});

test('the title is the only required field', async ({ app }) => {
  await app.getByRole('button', { name: 'Add recipe' }).click();
  await app.getByRole('button', { name: 'Save' }).click();
  // Still on the form, nothing saved.
  await expect(app.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await expect(app.getByText('Recipe saved')).toBeHidden();
});

// SPEC.md §5.5: numeric fields save an integer >= 1 or null, never NaN — and
// missing metadata is hidden, with no "—" placeholder.
for (const servings of ['0', 'abc', '-3']) {
  test(`servings "${servings}" is saved as no servings`, async ({ app }) => {
    await createRecipe(app, { title: 'Bigos', servings });
    await openAllRecipes(app);
    const tile = app.getByRole('button', { name: /^Bigos/ });
    await expect(tile).toBeVisible();
    await expect(tile).not.toContainText('serving');
    await expect(tile).not.toContainText('NaN');
    await expect(tile).not.toContainText('—');
  });
}

// SPEC.md §5.3: search folds diacritics and matches ingredients, in JS.
test('search ignores Polish diacritics and matches ingredients', async ({ app }) => {
  await createRecipe(app, { title: 'Żurek', ingredients: 'kiełbasa\nzakwas' });
  await openAllRecipes(app);
  const search = app.getByRole('textbox', { name: 'Search by name or ingredient' });

  await search.fill('zurek');
  await expect(app.getByRole('button', { name: /^Żurek/ })).toBeVisible();
  await expect(app.getByRole('button', { name: /^Pancakes/ })).toBeHidden();

  await search.fill('kielbasa');
  await expect(app.getByRole('button', { name: /^Żurek/ })).toBeVisible();

  await search.fill('xyz-nothing');
  await expect(app.getByRole('button', { name: /^Żurek/ })).toBeHidden();
});
