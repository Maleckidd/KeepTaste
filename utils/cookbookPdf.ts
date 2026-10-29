// Native wrapper for the cookbook PDF share: build localized HTML (pure),
// render to a PDF via expo-print, rename it to a readable
// `{cookbook name} {YYYY-MM-DD}.pdf` (SPEC.md §5.14) and share via
// expo-sharing. Pure pieces live in utils/cookbookPdfHtml.ts and
// utils/cookbookPdfFileName.ts.
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getRecipesByCookbook } from '../db/recipes';
import type { Cookbook } from '../db/schema';
import type { Translator } from './i18n';
import { buildCookbookHtml } from './cookbookPdfHtml';
import { cookbookPdfFileName } from './cookbookPdfFileName';

// `onReady` fires once the PDF is on disk, right before the share sheet opens —
// rendering can take seconds, so the caller shows progress until then. Throws
// when the device has no share target, so that never fails silently.
export async function shareCookbookPdf(
  cookbook: Cookbook,
  t: Translator,
  dialogTitle: string,
  onReady?: () => void
): Promise<void> {
  const recipes = await getRecipesByCookbook(cookbook.id);
  const html = buildCookbookHtml(cookbook, recipes, t);

  const { uri } = await Print.printToFileAsync({ html });

  // expo-print names the file with a random UUID; move it to a readable name
  // in the cache. If the rename fails, share the UUID file rather than nothing.
  let shareUri = uri;
  if (FileSystem.cacheDirectory) {
    const fileName = cookbookPdfFileName(cookbook.name, new Date(), t('stack.cookbook'));
    const target = FileSystem.cacheDirectory + encodeURIComponent(fileName);
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: target });
      shareUri = target;
    } catch {
      shareUri = uri;
    }
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  onReady?.();
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle,
  });
}
