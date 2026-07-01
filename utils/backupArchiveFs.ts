// Native wrapper for the complete .zip backup (SPEC.md §5.17). Packs the
// full-fidelity backup.json, the readable recipes.md, and the referenced photos
// under images/ into keeptaste-backup.zip via react-native-zip-archive (RNZA) —
// a native module that zips a *staging directory* off the JS thread, so photo
// bytes never enter the JS heap (resolves the freeze/OOM walls documented in
// docs/backup-freeze-rootcause.md). Requires a dev build, not Expo Go
// (SPEC.md §5.17.1). Pure serialization lives in utils/backupArchive.ts; the DB
// layer in db/backup.ts.
import { zip, unzip, NO_COMPRESSION } from 'react-native-zip-archive';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { copyFileToSaf } from '@/modules/safwriter';
import {
  getFullBackupData,
  restoreFullBackup,
} from '../db/backup';
import {
  getBackupSections,
  deleteAllData,
  getLatestDataChangeAt,
} from '../db/recipes';
import { getSetting, setSetting } from '../db/settings';
import { buildBackupJson, parseBackupJson, type BackupContent } from './backupArchive';
import { buildBackupMarkdown } from './backupMarkdown';
import {
  backupsToPrune,
  parseKeepCount,
  isMirrorStale,
  AUTO_BACKUP_KEEP_DEFAULT,
} from './backupAuto';
import { withAutoBackupSuppressed, scheduleAutoBackup } from './backupTrigger';
import { setBackupRunning } from './backupStatus';
import { parseBackupMarkdown } from './importMarkdown';
import type { BackupSection } from './importMarkdown';
import {
  generateImageFilename,
  extractExtension,
  targetUri,
  deleteStoredImage,
} from './imageStorage';

const IMAGES_DIR = 'images/';

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

// RNZA works on absolute filesystem paths; expo-file-system hands out file://
// URIs. Strip the scheme for RNZA and keep it for the expo APIs.
function toFsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.replace(/^file:\/\//, '') : uri;
}

async function removeDir(dir: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {
    // cleanup is best-effort; a leftover staging dir in cache is harmless
  }
}

/**
 * Materializes the archive contents (backup.json + recipes.md + images/) into a
 * staging directory. Relativizes every existing image into images/<name>
 * (dropping references whose file is gone) and copies it natively — no base64,
 * the photo bytes never touch the JS heap.
 */
async function stageArchive(stagingDir: string): Promise<void> {
  const data = await getFullBackupData();
  const sections = await getBackupSections();
  await FileSystem.makeDirectoryAsync(`${stagingDir}${IMAGES_DIR}`, {
    intermediates: true,
  });

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
    // Native copy off the JS heap — replaces the old read-as-base64 + zip.file.
    await FileSystem.copyAsync({ from: absPath, to: `${stagingDir}${rel}` });
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
  await FileSystem.writeAsStringAsync(
    `${stagingDir}backup.json`,
    buildBackupJson(relContent)
  );
  await FileSystem.writeAsStringAsync(
    `${stagingDir}recipes.md`,
    buildBackupMarkdown(sections)
  );
}

/**
 * Builds the .zip at zipUri by staging the contents on disk and packing the
 * staging directory natively (off-thread). The staging dir is unique per run and
 * always cleaned up, even on failure.
 */
async function buildArchiveTo(zipUri: string): Promise<void> {
  const stagingDir = `${FileSystem.cacheDirectory}backup-staging-${Date.now()}/`;
  try {
    await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });
    await stageArchive(stagingDir);
    // RNZA won't overwrite cleanly on every platform — clear any stale target.
    await FileSystem.deleteAsync(zipUri, { idempotent: true });
    // NO_COMPRESSION: JPEG/PNG are already compressed, so DEFLATE wastes native
    // CPU for ~0% gain; backup.json/recipes.md are small relative to the photos.
    await zip(toFsPath(stagingDir), toFsPath(zipUri), NO_COMPRESSION);
  } finally {
    await removeDir(stagingDir);
  }
}

/** Exports the whole library as keeptaste-backup.zip and opens the share sheet. */
export async function exportBackupZip(dialogTitle: string): Promise<void> {
  const zipUri = `${FileSystem.cacheDirectory}keeptaste-backup.zip`;
  await buildArchiveTo(zipUri);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(zipUri, {
      mimeType: 'application/zip',
      dialogTitle,
    });
  }
}

/** Writes a silent safety snapshot to cache before a destructive Replace. */
async function writeSafetyBackup(): Promise<void> {
  await buildArchiveTo(`${FileSystem.cacheDirectory}keeptaste-backup-before-restore.zip`);
}

export type LoadedBackup = {
  /** Parsed content; image fields still hold archive-relative paths. */
  content: BackupContent;
  /** Cache directory the archive was extracted into; photos live under images/. */
  extractedDir: string;
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

/**
 * Reads and parses a .zip backup, preferring backup.json over recipes.md. The
 * archive is unzipped natively into a unique cache directory (no base64); the
 * caller (commitBackupRestore) is responsible for cleaning it up.
 */
export async function loadBackupZip(uri: string): Promise<LoadBackupResult> {
  const extractedDir = `${FileSystem.cacheDirectory}backup-restore-${Date.now()}/`;
  try {
    await unzip(toFsPath(uri), toFsPath(extractedDir));
  } catch {
    await removeDir(extractedDir);
    return { ok: false, error: 'notzip' };
  }

  const jsonUri = `${extractedDir}backup.json`;
  if (await fileExists(jsonUri)) {
    const parsed = parseBackupJson(await FileSystem.readAsStringAsync(jsonUri));
    if (!parsed.ok) {
      await removeDir(extractedDir);
      return { ok: false, error: parsed.error };
    }
    return {
      ok: true,
      loaded: { content: parsed.content, extractedDir, fromMarkdown: false },
    };
  }

  const mdUri = `${extractedDir}recipes.md`;
  if (await fileExists(mdUri)) {
    const res = parseBackupMarkdown(await FileSystem.readAsStringAsync(mdUri));
    if (!res.ok) {
      await removeDir(extractedDir);
      return { ok: false, error: res.error };
    }
    return {
      ok: true,
      loaded: {
        content: sectionsToContent(res.sections),
        extractedDir,
        fromMarkdown: true,
      },
    };
  }

  await removeDir(extractedDir);
  return { ok: false, error: 'unrecognized' };
}

async function restoreImage(
  rel: string | null,
  extractedDir: string,
  docDir: string,
  cache: Map<string, string>
): Promise<string | null> {
  if (!rel) return null;
  const cached = cache.get(rel);
  if (cached) return cached;
  const src = `${extractedDir}${rel}`;
  if (!(await fileExists(src))) return null; // referenced but absent in the archive
  const dest = targetUri(docDir, generateImageFilename(extractExtension(rel)));
  // Native move from the extracted dir into documentDirectory — no base64.
  await FileSystem.copyAsync({ from: src, to: dest });
  cache.set(rel, dest);
  return dest;
}

/**
 * Commits a loaded backup. 'replace' writes a silent safety snapshot, wipes the
 * library (and its image files), then restores; 'add' appends. Photos are copied
 * from the extracted archive into documentDirectory and the relative paths are
 * rewritten to absolute device URIs before the DB rows are inserted. The
 * extracted cache directory is always cleaned up.
 */
export async function commitBackupRestore(
  loaded: LoadedBackup,
  mode: 'replace' | 'add'
): Promise<void> {
  // Suppress per-change scheduling so the whole restore fires exactly one
  // backup at the end, reflecting the restored data (SPEC.md §5.17.3).
  try {
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
          ? await restoreImage(cb.coverImagePath, loaded.extractedDir, docDir, cache)
          : null;
      }
      for (const r of loaded.content.recipes) {
        r.imagePath = docDir
          ? await restoreImage(r.imagePath, loaded.extractedDir, docDir, cache)
          : null;
      }

      await restoreFullBackup(loaded.content);
    });
  } finally {
    await removeDir(loaded.extractedDir);
  }
}

// --- Level 1: automatic export to a user-chosen folder (SPEC.md §5.17.3) ---

/** app_settings keys for the optional automatic backup. */
export const BACKUP_KEYS = {
  folderUri: 'backup_folder_uri',
  lastExportAt: 'backup_last_export_at',
  autoEnabled: 'backup_auto_enabled',
  keep: 'backup_keep',
} as const;

/**
 * Local-time stamp for the archive name: { date: "YYYY-MM-DD", time: "HH-MM" }.
 * Local (not UTC) so the time in the filename matches the "Last backup" line in
 * Settings. The date half is also the prune key, so writeBackupToFolder passes
 * it to backupsToPrune to keep same-day matching correct.
 */
function localStamp(d: Date): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}-${p(d.getMinutes())}`,
  };
}

// Colons are illegal in many filesystems, so HH-MM uses a dash separator.
function datedBackupName(date: string, time: string): string {
  return `keeptaste-backup-${date}-${time}`;
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
 *
 * The archive is packed natively to a cache file first (off-thread, no JS-heap
 * image bytes), then streamed into SAF by the local `safwriter` native module
 * (ContentResolver.openOutputStream + a bounded native buffer). No base64 and no
 * whole-file allocation on the heap, so library size no longer caps the backup
 * (docs/backup-freeze-rootcause.md).
 */
export async function writeBackupToFolder(folderUri: string): Promise<void> {
  const { date, time } = localStamp(new Date());
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
    toPrune = backupsToPrune(existing, date, keep);
  } catch {
    // some providers don't support listing; skip pruning, never block the write
  }

  // Pack natively to a cache file, then stream its bytes into SAF. If either step
  // throws, toPrune is never touched.
  const cacheZip = `${FileSystem.cacheDirectory}keeptaste-backup-auto.zip`;
  await buildArchiveTo(cacheZip);
  try {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      folderUri,
      datedBackupName(date, time),
      'application/zip'
    );
    await copyFileToSaf(toFsPath(cacheZip), fileUri);
  } finally {
    await FileSystem.deleteAsync(cacheZip, { idempotent: true }).catch(() => {});
  }

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
 * silent — invoked by flushAutoBackup when the app backgrounds. Packing now runs
 * on a native thread (RNZA), so it no longer freezes the JS thread; the banner is
 * a genuine progress indicator rather than a freeze curtain. Returns true when a
 * backup was written.
 */
export async function runAutoBackupNow(): Promise<boolean> {
  try {
    if ((await getSetting(BACKUP_KEYS.autoEnabled)) !== '1') return false;
    const folder = await getSetting(BACKUP_KEYS.folderUri);
    if (!folder) return false;
    setBackupRunning(true);
    const nowIso = new Date().toISOString();
    try {
      await writeBackupToFolder(folder);
      await setSetting(BACKUP_KEYS.lastExportAt, nowIso);
    } finally {
      setBackupRunning(false);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Crash-recovery for the auto-backup mirror (SPEC.md §5.17.3). The dirty flag in
 * backupTrigger is in-memory, so a kill before a flush completes (typically a
 * crash — a normal leave backgrounds first and flushes) loses it. Called once at
 * startup: if auto-backup is on and the newest data change is newer than the
 * last successful export, it re-arms a backup (which then flushes on the safety
 * timer or the next time the app backgrounds). Best-effort and silent.
 */
export async function maybeBackupOnLaunch(): Promise<void> {
  try {
    if ((await getSetting(BACKUP_KEYS.autoEnabled)) !== '1') return;
    if (!(await getSetting(BACKUP_KEYS.folderUri))) return;
    const latestChange = await getLatestDataChangeAt();
    const lastExport = await getSetting(BACKUP_KEYS.lastExportAt);
    if (isMirrorStale(latestChange, lastExport)) {
      scheduleAutoBackup();
    }
  } catch {
    // best-effort; never block startup
  }
}
