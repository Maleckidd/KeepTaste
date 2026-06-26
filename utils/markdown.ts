// Pure Markdown body builders (SPEC.md §5.6). No native imports — these stay
// testable in ts-jest. The native full-app backup write+share lives in
// utils/backupArchiveFs.ts; the multi-cookbook layout in utils/backupMarkdown.ts.
import type { Recipe } from '../db/schema';

export function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

/** Renders a single recipe as the §5.6 "## Title" block, ending with "---". */
export function recipeToMarkdown(recipe: Recipe): string {
  const timeLines = [
    recipe.prepTime ? `**Prep:** ${formatTime(recipe.prepTime)}` : null,
    recipe.cookTime ? `**Cook:** ${formatTime(recipe.cookTime)}` : null,
    recipe.servings ? `**Servings:** ${recipe.servings}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const metaLine = timeLines ? `${timeLines}\n\n` : '';

  const ingredientsSection = recipe.ingredients
    ? `### Ingredients\n\n${recipe.ingredients}\n\n`
    : '';

  const instructionsSection = recipe.instructions
    ? `### Instructions\n\n${recipe.instructions}\n\n`
    : '';

  const notesSection = recipe.notes
    ? `### Notes\n\n${recipe.notes}\n\n`
    : '';

  return [
    `## ${recipe.title}`,
    '',
    metaLine,
    ingredientsSection,
    instructionsSection,
    notesSection,
    '---',
    '',
  ].join('\n');
}

/**
 * Renders the body of one cookbook section: the "*Exported:* / *Recipes:*"
 * preamble followed by each recipe block. The "# Name" heading itself is added
 * by the caller (so the same body works for named and uncategorized sections).
 */
export function cookbookBodyToMarkdown(recipes: Recipe[]): string {
  return [
    `*Exported: ${new Date().toLocaleDateString('en-GB')}*`,
    `*Recipes: ${recipes.length}*`,
    '',
    '---',
    '',
    ...recipes.map(recipeToMarkdown),
  ].join('\n');
}
