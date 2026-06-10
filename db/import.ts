import { createCookbook } from './cookbooks';
import { createRecipe } from './recipes';
import type { ImportedRecipe } from '../utils/importMarkdown';

/**
 * Persists a parsed cookbook: creates the cookbook, then each recipe in order.
 * No transaction (consistent with the rest of db/) — on failure the cookbook
 * and any recipes created so far remain, so the import may be partial.
 */
export async function importCookbook(data: {
  cookbookName: string;
  recipes: ImportedRecipe[];
}): Promise<{ cookbookId: number; recipeCount: number }> {
  const cookbookId = await createCookbook({ name: data.cookbookName });

  for (const recipe of data.recipes) {
    await createRecipe({
      cookbookId,
      title: recipe.title,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      notes: recipe.notes,
    });
  }

  return { cookbookId, recipeCount: data.recipes.length };
}
