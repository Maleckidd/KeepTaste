// Native wrapper for the complete .zip backup (SPEC.md §5.17). Packs the
// full-fidelity backup.json, the readable recipes.md, and the referenced
// photos under images/ into keeptaste-backup.zip via jszip (pure JS — works in
// Expo Go, no custom build). Pure serialization lives in utils/backupArchive.ts;
// the DB layer in db/backup.ts.
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  getFullBackupData,
  restoreFullBackup,
} from '../db/backup';
import { getBackupSections, deleteAllData } from '../db/recipes';
import { getSetting, setSetting } from '../db/settings';
import { buildBackupJson, parseBackupJson, type BackupContent } from './backupArchive';
import { buildBackupMarkdown } from './backupMarkdown';
import {
  backupsToPrune,
  parseKeepCount,
  AUTO_BACKUP_KEEP_DEFAULT,
} from './backupAuto';
import { withAutoBackupSuppressed } from './backupTrigger';
import { parseBackupMarkdown } from './importMarkdown';
import type { BackupSection } from './importMarkdown';
import {
  generateImageFilename,
  extractExtension,
  targetUri,
  deleteStoredImage,
} from './imageStorage';

const IMAGES_DIR = 'images/';
const B64 = { encoding: FileSystem.EncodingType.Base64 } as const;

function basename(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const i = clean.lastIndexOf('/');
  return i >= 0 ? clean.slice(i + 1) : clean;
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Builds the archive base64. Relativizes every existing image into images/<name>
 * (dropping references whose file is gone) and embeds backup.json + recipes.md.
 */
async function buildArchiveBase64(): Promise<string> {
  const data = await getFullBackupData();
  const sections = await getBackupSections();
  const zip = new JSZip();

  const used = new Set<string>();
  const relForPath = new Map<string, string>();
  async function addImage(absPath: string | null): Promise<string | null> {
    if (!absPath) return null;
    const cached = relForPath.get(absPath);
    if (cached) return cached;
    if (!(await fileExists(absPath))) return null;
    let name = basename(absPath);
    while (used.has(name)) name = `dup-${used.size}-${name}`;
    used.add(name);
    const rel = `${IMAGES_DIR}${name}`;
    const b64 = await FileSystem.readAsStringAsync(absPath, B64);
    zip.file(rel, b64, { base64: true });
    relForPath.set(absPath, rel);
    return rel;
  }

  const relCookbooks = [];
  for (const cb of data.cookbooks) {
    relCookbooks.push({ ...cb, coverImagePath: await addImage(cb.coverImagePath) });
  }
  const relRecipes = [];
  for (const r of data.recipes) {
    relRecipes.push({ ...r, imagePath: await addImage(r.imagePath) });
  }

  const relContent: BackupContent = {
    ...data,
    cookbooks: relCookbooks,
    recipes: relRecipes,
    // backup_* keys are device-local (e.g. the SAF folder URI) — never export
    // them; restore skips them too (db/backup.ts).
    settings: data.settings.filter((s) => !s.key.startsWith('backup_')),
  };
  zip.file('backup.json', buildBackupJson(relContent));
  zip.file('recipes.md', buildBackupMarkdown(sections));

  return zip.generateAsync({ type: 'base64' });
}

/** Exports the whole library as keeptaste-backup.zip and opens the share sheet. */
export async function exportBackupZip(dialogTitle: string): Promise<void> {
  const b64 = await buildArchiveBase64();
  const filePath = `${FileSystem.cacheDirectory}keeptaste-backup.zip`;
  await FileSystem.writeAsStringAsync(filePath, b64, B64);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/zip',
      dialogTitle,
    });
  }
}

/** Writes a silent safety snapshot to cache before a destructive Replace. */
async function writeSafetyBackup(): Promise<void> {
  const b64 = await buildArchiveBase64();
  const filePath = `${FileSystem.cacheDirectory}keeptaste-backup-before-restore.zip`;
  await FileSystem.writeAsStringAsync(filePath, b64, B64);
}

export type LoadedBackup = {
  /** Parsed content; image fields still hold archive-relative paths. */
  content: BackupContent;
  zip: JSZip;
  /** True when there was no backup.json and we fell back to recipes.md. */
  fromMarkdown: boolean;
};

export type LoadBackupResult =
  | { ok: true; loaded: LoadedBackup }
  | { ok: false; error: string };

/** Synthesizes ids/timestamps for the recipes.md fallback (append-only). */
function sectionsToContent(sections: BackupSection[]): BackupContent {
  const now = new Date().toISOString();
  const cookbooks: BackupContent['cookbooks'] = [];
  const recipes: BackupContent['recipes'] = [];
  let cookbookId = 1;
  let recipeId = 1;
  for (const s of sections) {
    let cbId: number | null = null;
    if (s.cookbookName !== null) {
      cbId = cookbookId++;
      cookbooks.push({
        id: cbId,
        name: s.cookbookName,
        coverImagePath: null,
        createdAt: now,
      });
    }
    for (const r of s.recipes) {
      recipes.push({
        id: recipeId++,
        cookbookId: cbId,
        title: r.title,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        servings: r.servings,
        imagePath: null,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { cookbooks, recipes, shoppingLists: [], shoppingItems: [], settings: [] };
}

/** Reads and parses a .zip backup, preferring backup.json over recipes.md. */
export async function loadBackupZip(uri: string): Promise<LoadBackupResult> {
  let archiveB64: string;
  try {
    archiveB64 = await FileSystem.readAsStringAsync(uri, B64);
  } catch {
    return { ok: false, error: 'read' };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archiveB64, { base64: true });
  } catch {
    return { ok: false, error: 'notzip' };
  }

  const jsonFile = zip.file('backup.json');
  if (jsonFile) {
    const parsed = parseBackupJson(await jsonFile.async('string'));
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, loaded: { content: parsed.content, zip, fromMarkdown: false } };
  }

  const mdFile = zip.file('recipes.md');
  if (mdFile) {
    const res = parseBackupMarkdown(await mdFile.async('string'));
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      loaded: { content: sectionsToContent(res.sections), zip, fromMarkdown: true },
    };
  }

  return { ok: false, error: 'unrecognized' };
}

async function restoreImage(
  rel: string | null,
  zip: JSZip,
  docDir: string,
  cache: Map<string, string>
): Promise<string | null> {
  if (!rel) return null;
  const cached = cache.get(rel);
  if (cached) return cached;
  const entry = zip.file(rel);
  if (!entry) return null; // referenced but absent in the archive
  const dest = targetUri(docDir, generateImageFilename(extractExtension(rel)));
  await FileSystem.writeAsStringAsync(dest, await entry.async('base64'), B64);
  cache.set(rel, dest);
  return dest;
}

/**
 * Commits a loaded backup. 'replace' writes a silent safety snapshot, wipes the
 * library (and its image files), then restores; 'add' appends. Photos are
 * extracted from the archive into documentDirectory and the relative paths are
 * rewritten to absolute device URIs before the DB rows are inserted.
 */
export async function commitBackupRestore(
  loaded: LoadedBackup,
  mode: 'replace' | 'add'
): Promise<void> {
  // Suppress per-change scheduling so the whole restore fires exactly one
  // backup at the end, reflecting the restored data (SPEC.md §5.17.3).
  await withAutoBackupSuppressed(async () => {
    if (mode === 'replace') {
      try {
        await writeSafetyBackup();
      } catch {
        // best-effort; a failed safety snapshot must not block the restore
      }
      const paths = await deleteAllData();
      await Promise.all(paths.map(deleteStoredImage));
    }

    const docDir = FileSystem.documentDirectory;
    const cache = new Map<string, string>();
    for (const cb of loaded.content.cookbooks) {
      cb.coverImagePath = docDir
        ? await restoreImage(cb.coverImagePath, loaded.zip, docDir, cache)
        : null;
    }
    for (const r of loaded.content.recipes) {
      r.imagePath = docDir
        ? await restoreImage(r.imagePath, loaded.zip, docDir, cache)
        : null;
    }

    await restoreFullBackup(loaded.content);
  });
}

// --- Level 1: automatic export to a user-chosen folder (SPEC.md §5.17.3) ---

/** app_settings keys for the optional automatic backup. */
export const BACKUP_KEYS = {
  folderUri: 'backup_folder_uri',
  lastExportAt: 'backup_last_export_at',
  autoEnabled: 'backup_auto_enabled',
  keep: 'backup_keep',
} as const;

function datedBackupName(nowIso: string): string {
  return `keeptaste-backup-${nowIso.slice(0, 10)}`;
}

/**
 * Writes the archive into a SAF directory the user granted. The folder is
 * persisted across launches; if a sync app (Dropbox/Nextcloud/Drive-desktop)
 * watches it, the backup reaches the cloud with no network code here.
 *
 * Before writing, it prunes the folder (SPEC.md §5.17.3 "keep the N most recent,
 * rotate older"): any existing same-day archive is removed so the new write
 * replaces it instead of becoming "... (1).zip", and archives beyond the
 * user-chosen retention count (backup_keep) are deleted so backups don't fill
 * the disk indefinitely.
 */
export async function writeBackupToFolder(folderUri: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const keep = parseKeepCount(
    await getSetting(BACKUP_KEYS.keep),
    AUTO_BACKUP_KEEP_DEFAULT
  );

  // Identify which old archives to prune, but don't delete yet — we want
  // the old backup to survive if the new write fails (write-then-prune).
  let toPrune: string[] = [];
  try {
    const existing =
      await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
    toPrune = backupsToPrune(existing, nowIso.slice(0, 10), keep);
  } catch {
    // some providers don't support listing; skip pruning, never block the write
  }

  // Write the new archive first. If this throws, toPrune is never touched.
  const b64 = await buildArchiveBase64();
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    folderUri,
    datedBackupName(nowIso),
    'application/zip'
  );
  await FileSystem.writeAsStringAsync(fileUri, b64, B64);

  // New file is safely on disk — now prune the surplus old archives.
  for (const uri of toPrune) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // a single stubborn file must not undo an otherwise successful backup
    }
  }
}

/**
 * Runs an automatic backup if enabled and a folder is set. Best-effort and
 * silent — invoked (debounced) by backupTrigger whenever data changes, so it
 * never blocks a db call. Returns true when a backup was actually written.
 */
export async function runAutoBackupNow(): Promise<boolean> {
  try {
    if ((await getSetting(BACKUP_KEYS.autoEnabled)) !== '1') return false;
    const folder = await getSetting(BACKUP_KEYS.folderUri);
    if (!folder) return false;
    const nowIso = new Date().toISOString();
    await writeBackupToFolder(folder);
    await setSetting(BACKUP_KEYS.lastExportAt, nowIso);
    return true;
  } catch {
    return false;
  }
}
