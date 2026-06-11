// Native wrapper for the full-app backup: gather sections, build the
// English-only Markdown (pure), write to the cache directory and share via
// expo-sharing. Pure logic lives in utils/backupMarkdown.ts.
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getBackupSections } from '../db/recipes';
import { buildBackupMarkdown } from './backupMarkdown';

export async function exportAllData(dialogTitle: string): Promise<void> {
  const sections = await getBackupSections();
  const content = buildBackupMarkdown(sections);

  const fileName = 'keeptaste-backup.md';
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'text/markdown',
      dialogTitle,
    });
  }
}
