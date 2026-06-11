// Native wrapper for the cookbook PDF share: build localized HTML (pure),
// render to a PDF via expo-print and share via expo-sharing. Pure HTML lives
// in utils/cookbookPdfHtml.ts.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getRecipesByCookbook } from '../db/recipes';
import type { Cookbook } from '../db/schema';
import type { Translator } from './i18n';
import { buildCookbookHtml } from './cookbookPdfHtml';

export async function shareCookbookPdf(
  cookbook: Cookbook,
  t: Translator,
  dialogTitle: string
): Promise<void> {
  const recipes = await getRecipesByCookbook(cookbook.id);
  const html = buildCookbookHtml(cookbook, recipes, t);

  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
    });
  }
}
