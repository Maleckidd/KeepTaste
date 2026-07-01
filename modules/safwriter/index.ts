import SafwriterModule from './src/SafwriterModule';

/**
 * Streams a local file (plain fs path or file:// URI) into a SAF content://
 * document URI via ContentResolver.openOutputStream on a bounded native buffer —
 * no base64, no whole-file heap allocation, so backup size is capped only by
 * disk. Android-only; the web build gets a throwing stub (never called there).
 */
export async function copyFileToSaf(
  srcPath: string,
  destUri: string
): Promise<void> {
  await SafwriterModule.copyFileToSaf(srcPath, destUri);
}
