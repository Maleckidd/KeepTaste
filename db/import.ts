import { createCookbook } from './cookbooks';
import { createRecipe } from './recipes';
import type { ImportedRecipe, BackupSection } from '../utils/importMarkdown';

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

/**
 * Persists a parsed full-app backup: for each named section creates a cookbook
 * and its recipes; the null-name (uncategorized) section creates recipes with
 * cookbookId null. No transaction (consistent with the rest of db/) — on
 * failure whatever was created so far remains. Returns created counts.
 */
export async function importBackup(
  sections: BackupSection[]
): Promise<{ cookbooks: number; recipes: number }> {
  let cookbookCount = 0;
  let recipeCount = 0;

  for (const section of sections) {
    let cookbookId: number | null = null;
    if (section.cookbookName !== null) {
      cookbookId = await createCookbook({ name: section.cookbookName });
      cookbookCount += 1;
    }

    for (const recipe of section.recipes) {
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
      recipeCount += 1;
    }
  }

  return { cookbooks: cookbookCount, recipes: recipeCount };
}
