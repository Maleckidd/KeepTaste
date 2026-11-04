import type { Cookbook, Recipe } from '../db/schema';
import { parsePositiveInt } from './numeric';

export interface RecipeFormData {
  title: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  imagePath: string;
  ingredients: string;
  instructions: string;
  notes: string;
  toTry: boolean;
  /** Target cookbook; `null` = "No cookbook" (SPEC.md §5.5). */
  cookbookId: number | null;
}

export function emptyRecipeFormData(
  cookbookId: number | null = null
): RecipeFormData {
  return {
    title: '',
    prepTime: '',
    cookTime: '',
    servings: '',
    imagePath: '',
    ingredients: '',
    instructions: '',
    notes: '',
    toTry: false,
    cookbookId,
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
    toTry: !!recipe.toTry,
    cookbookId: recipe.cookbookId ?? null,
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
    initial.notes !== current.notes ||
    initial.toTry !== current.toTry ||
    initial.cookbookId !== current.cookbookId
  );
}

/**
 * Cookbook pre-selected in the new-recipe form (SPEC.md §5.5): the `cookbookId`
 * route param, but only when it names an existing cookbook. "all", junk or a
 * deleted id fall back to "No cookbook".
 */
export function initialCookbookId(
  param: string | undefined,
  cookbooks: Pick<Cookbook, 'id'>[]
): number | null {
  if (!param) return null;
  const id = parsePositiveInt(param);
  if (id === null) return null;
  return cookbooks.some((cb) => cb.id === id) ? id : null;
}

export type RecipeSaveNotice =
  | { kind: 'savedIn'; cookbookName: string }
  | { kind: 'saved' }
  | { kind: 'moved'; cookbookName: string | null };

/**
 * What the post-save snackbar says (SPEC.md §5.5 "Save confirmation"). Create
 * always confirms; edit only when the cookbook changed (`null` = no snackbar).
 * An unknown target id is treated like "No cookbook".
 */
export function recipeSaveNotice(
  mode: 'create' | 'edit',
  fromCookbookId: number | null,
  toCookbookId: number | null,
  cookbooks: Pick<Cookbook, 'id' | 'name'>[]
): RecipeSaveNotice | null {
  const name =
    toCookbookId === null
      ? null
      : cookbooks.find((cb) => cb.id === toCookbookId)?.name ?? null;
  if (mode === 'create') {
    return name === null ? { kind: 'saved' } : { kind: 'savedIn', cookbookName: name };
  }
  if (fromCookbookId === toCookbookId) return null;
  return { kind: 'moved', cookbookName: name };
}
