// Pure builder for a recipe's shareable plain-text message (SPEC.md §5.13).
// Localized via the passed translator; omits missing fields (no "—"
// placeholders). A title-only recipe yields essentially just its title.
import type { Recipe } from '../db/schema';
import type { Translator } from './i18n';
import { formatTime } from './markdown';

export function buildRecipeShareText(recipe: Recipe, t: Translator): string {
  const parts: string[] = [recipe.title];

  const meta = [
    recipe.prepTime ? `${t('recipe.prep')}: ${formatTime(recipe.prepTime)}` : null,
    recipe.cookTime ? `${t('recipe.cook')}: ${formatTime(recipe.cookTime)}` : null,
    recipe.servings
      ? `${t('recipe.servingsLabel')}: ${recipe.servings}`
      : null,
  ].filter(Boolean);
  if (meta.length > 0) {
    parts.push(meta.join('  ·  '));
  }

  if (recipe.ingredients) {
    parts.push(`${t('recipe.ingredients')}\n${recipe.ingredients}`);
  }

  if (recipe.instructions) {
    parts.push(`${t('recipe.instructions')}\n${recipe.instructions}`);
  }

  if (recipe.notes) {
    parts.push(`${t('recipe.notes')}\n${recipe.notes}`);
  }

  return parts.join('\n\n');
}
