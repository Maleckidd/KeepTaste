import { createRecipe, expect, openAllRecipes, test } from './support/fixtures';

// SECURITY.md, threat model: recipe text comes from pastes, imported web
// pages and other people's backups. A Markdown image in it must not make the
// app fetch anything when the recipe is shown, or it works as a tracking
// pixel. The image renders as its alt text instead.
//
// The `app` fixture already fails a test on any non-local request; this test
// also names the host it expects to stay silent.
const TRACKER = 'tracker.example';

test('a Markdown image in a recipe is never fetched', async ({ app }) => {
  const contacted: string[] = [];
  app.on('request', (req) => {
    if (new URL(req.url()).hostname === TRACKER) contacted.push(req.url());
  });

  await createRecipe(app, {
    title: 'Pixel soup',
    // A single ingredient line takes the checklist path, the instructions the
    // plain <Markdown> with timer chips; both must be covered.
    ingredients: `![Ingredient photo](https://${TRACKER}/i.png)`,
    instructions: `1. Stir. ![Step photo](https://${TRACKER}/s.png)`,
  });
  await openAllRecipes(app);
  await app.getByRole('button', { name: /^Pixel soup/ }).click();
  await expect(app.getByRole('heading', { name: 'Pixel soup' })).toBeVisible();

  await expect(app.getByText('Ingredient photo')).toBeVisible();
  await expect(app.getByText('Step photo', { exact: false })).toBeVisible();
  expect(contacted, `requests to ${TRACKER}`).toEqual([]);
});
