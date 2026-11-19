import { expect, test } from './support/fixtures';

// The first thing a broken build gets wrong: the app must start and render
// the cookbook home with the first-launch seed (the `app` fixture waits for
// it and fails on any uncaught page error).
test('opens on the cookbook home with the sample content', { tag: '@smoke' }, async ({ app }) => {
  await expect(app.getByRole('button', { name: 'All recipes' })).toBeVisible();
  await expect(app.getByRole('button', { name: 'Add recipe' })).toBeVisible();
});

test('the sample recipe opens with its ingredients and steps', { tag: '@smoke' }, async ({ app }) => {
  await app.getByRole('button', { name: 'All recipes' }).click();
  await app.getByRole('button', { name: /^Pancakes/ }).click();
  await expect(app.getByRole('heading', { name: 'Pancakes' })).toBeVisible();
  // Rendered from markdown: an ingredient line and a numbered step.
  await expect(app.getByText('Ingredients', { exact: false }).first()).toBeVisible();
  await expect(app.getByText('1.', { exact: true }).first()).toBeVisible();
});
