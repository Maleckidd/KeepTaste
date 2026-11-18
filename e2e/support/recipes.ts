// Shared steps for the recipe tests. Not a test file (no .e2e.ts suffix).
import { expect, type Screen } from 'e2e';

export type NewRecipe = {
  title: string;
  servings?: string;
  prep?: string;
  ingredients?: string;
};

/** Home → "Add recipe" → fill the form → Save → back on home. */
export async function createRecipe(screen: Screen, recipe: NewRecipe) {
  await screen.getByRole('button', 'Add recipe').tap();
  await expect(screen.getByRole('heading', 'New recipe')).toBeVisible();
  await screen.getByTestId('recipe-title').fill(recipe.title);
  if (recipe.prep !== undefined) await screen.getByTestId('recipe-prep').fill(recipe.prep);
  if (recipe.servings !== undefined) await screen.getByTestId('recipe-servings').fill(recipe.servings);
  if (recipe.ingredients !== undefined) {
    await screen.getByTestId('recipe-ingredients').fill(recipe.ingredients);
  }
  await screen.getByRole('button', 'Save').tap();
  await expect(screen.getByText('Recipe saved')).toBeVisible();
}

/** Home → "All recipes". */
export async function openAllRecipes(screen: Screen) {
  await screen.getByRole('button', 'All recipes').tap();
  await expect(screen.getByRole('heading', 'All recipes')).toBeVisible();
}
