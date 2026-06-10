import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getRecipesByCookbook } from '../db/recipes';
import type { Cookbook, Recipe } from '../db/schema';

function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

async function recipeToMarkdown(recipe: Recipe): Promise<string> {
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

export async function exportCookbookToMarkdown(cookbook: Cookbook): Promise<void> {
  const recipes = await getRecipesByCookbook(cookbook.id);

  const recipeSections = await Promise.all(recipes.map(recipeToMarkdown));

  const content = [
    `# ${cookbook.name}`,
    '',
    `*Exported: ${new Date().toLocaleDateString('en-GB')}*`,
    `*Recipes: ${recipes.length}*`,
    '',
    '---',
    '',
    ...recipeSections,
  ].join('\n');

  // Filesystem-safe file name
  const safeName = cookbook.name.replace(/[^a-z0-9ąćęłńóśźż\s]/gi, '').trim();
  const fileName = `${safeName}.md`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'text/markdown',
      dialogTitle: `Export: ${cookbook.name}`,
    });
  }
}
