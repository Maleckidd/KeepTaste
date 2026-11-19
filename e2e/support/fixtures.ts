// Shared fixtures and steps for the e2e specs.
import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

// db/client.web.ts loads sql.js's WebAssembly from jsDelivr. Serve the copy
// from node_modules instead: the run stays hermetic and cannot fail on the
// network, and the version is the one package-lock.json pins.
// The browser build of sql.js asks for dist/sql-wasm-browser.wasm.
const SQL_WASM = readFileSync(require.resolve('sql.js/dist/sql-wasm-browser.wasm'));

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Offline by default: any request that leaves the local server is
    // blocked and recorded, so a flow that starts calling the network fails.
    const external: string[] = [];
    await page.route(
      (url) => url.hostname !== '127.0.0.1',
      (route) => {
        external.push(route.request().url());
        return route.abort('blockedbyclient');
      }
    );
    // Registered last, so it is matched first.
    await page.route('https://cdn.jsdelivr.net/npm/sql.js@*/dist/sql-wasm-browser.wasm', (route) =>
      route.fulfill({ body: SQL_WASM, contentType: 'application/wasm' })
    );
    await page.goto('/');
    // The cookbook home with the first-launch seed (db/seed.ts) means the
    // bundle loaded, the database migrated and the seed ran.
    await expect(page.getByRole('heading', { name: 'KeepTaste' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Breakfasts' })).toBeVisible();
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
    expect(external, 'requests to hosts other than the local server').toEqual([]);
  },
});

export { expect };

export type NewRecipe = {
  title: string;
  servings?: string;
  prep?: string;
  ingredients?: string;
};

/** Home → "Add recipe" → fill the form → Save → back on home. */
export async function createRecipe(page: Page, recipe: NewRecipe) {
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await page.getByTestId('recipe-title').fill(recipe.title);
  if (recipe.prep !== undefined) await page.getByTestId('recipe-prep').fill(recipe.prep);
  if (recipe.servings !== undefined) await page.getByTestId('recipe-servings').fill(recipe.servings);
  if (recipe.ingredients !== undefined) {
    await page.getByTestId('recipe-ingredients').fill(recipe.ingredients);
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Recipe saved')).toBeVisible();
}

/** Home → "All recipes". */
export async function openAllRecipes(page: Page) {
  await page.getByRole('button', { name: 'All recipes' }).click();
  await expect(page.getByRole('heading', { name: 'All recipes' })).toBeVisible();
}
