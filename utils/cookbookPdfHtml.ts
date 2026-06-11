// Pure HTML builder for the cookbook-to-PDF export (SPEC.md §5.14). Localized
// via the passed translator; user content is HTML-escaped; missing metadata is
// omitted (no "—" placeholders). Styling values mirror constants/theme.ts.
import type { Cookbook, Recipe } from '../db/schema';
import type { Translator } from './i18n';
import { formatTime } from './markdown';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapes then turns newlines into <br> for inline multi-line content. */
function multiline(input: string): string {
  return escapeHtml(input).replace(/\n/g, '<br>');
}

function recipeSection(recipe: Recipe, t: Translator): string {
  const meta = [
    recipe.prepTime
      ? `<span><strong>${escapeHtml(t('recipe.prep'))}:</strong> ${escapeHtml(
          formatTime(recipe.prepTime)
        )}</span>`
      : '',
    recipe.cookTime
      ? `<span><strong>${escapeHtml(t('recipe.cook'))}:</strong> ${escapeHtml(
          formatTime(recipe.cookTime)
        )}</span>`
      : '',
    recipe.servings
      ? `<span><strong>${escapeHtml(t('recipe.servingsLabel'))}:</strong> ${
          recipe.servings
        }</span>`
      : '',
  ]
    .filter(Boolean)
    .join('');
  const metaHtml = meta ? `<p class="meta">${meta}</p>` : '';

  const ingredients = recipe.ingredients
    ? `<h3>${escapeHtml(t('recipe.ingredients'))}</h3><p>${multiline(
        recipe.ingredients
      )}</p>`
    : '';

  const instructions = recipe.instructions
    ? `<h3>${escapeHtml(t('recipe.instructions'))}</h3><p>${multiline(
        recipe.instructions
      )}</p>`
    : '';

  const notes = recipe.notes
    ? `<h3>${escapeHtml(t('recipe.notes'))}</h3><p>${multiline(
        recipe.notes
      )}</p>`
    : '';

  return `<section class="recipe">
    <h2>${escapeHtml(recipe.title)}</h2>
    ${metaHtml}
    ${ingredients}
    ${instructions}
    ${notes}
  </section>`;
}

export function buildCookbookHtml(
  cookbook: Cookbook,
  recipes: Recipe[],
  t: Translator
): string {
  const sections = recipes.map((r) => recipeSection(r, t)).join('\n');

  // Colors/spacing mirror constants/theme.ts (light palette) for print.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: -apple-system, system-ui, sans-serif;
    color: #1A1714;
    background: #FFFFFF;
    margin: 24px;
    line-height: 1.5;
  }
  h1 {
    font-size: 30px;
    color: #C84B31;
    margin-bottom: 24px;
  }
  .recipe {
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid #E8E4DE;
  }
  h2 {
    font-size: 20px;
    color: #1A1714;
    margin-bottom: 4px;
  }
  h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6B6560;
    margin-bottom: 4px;
    margin-top: 16px;
  }
  .meta {
    color: #6B6560;
    font-size: 13px;
  }
  .meta span {
    margin-right: 16px;
  }
  p {
    white-space: normal;
  }
</style>
</head>
<body>
  <h1>${escapeHtml(cookbook.name)}</h1>
  ${sections}
</body>
</html>`;
}
