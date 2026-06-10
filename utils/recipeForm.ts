import type { Recipe } from '../db/schema';

export interface RecipeFormData {
  title: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  imagePath: string;
  ingredients: string;
  instructions: string;
  notes: string;
}

export function emptyRecipeFormData(): RecipeFormData {
  return {
    title: '',
    prepTime: '',
    cookTime: '',
    servings: '',
    imagePath: '',
    ingredients: '',
    instructions: '',
    notes: '',
  };
}

export function recipeToFormData(recipe: Recipe): RecipeFormData {
  return {
    title: recipe.title,
    prepTime: recipe.prepTime ? String(recipe.prepTime) : '',
    cookTime: recipe.cookTime ? String(recipe.cookTime) : '',
    servings: recipe.servings ? String(recipe.servings) : '',
    imagePath: recipe.imagePath ?? '',
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes ?? '',
  };
}

export function isRecipeFormDirty(
  initial: RecipeFormData,
  current: RecipeFormData
): boolean {
  return (
    initial.title !== current.title ||
    initial.prepTime !== current.prepTime ||
    initial.cookTime !== current.cookTime ||
    initial.servings !== current.servings ||
    initial.imagePath !== current.imagePath ||
    initial.ingredients !== current.ingredients ||
    initial.instructions !== current.instructions ||
    initial.notes !== current.notes
  );
}
