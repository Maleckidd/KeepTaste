// Pure serializer/validator for the full-app backup JSON (SPEC.md §5.17.1).
// This is the machine-format source of truth inside keeptaste-backup.zip; the
// readable layer is the §5.6 Markdown. No native imports — must run in plain
// ts-jest. Image fields here hold the archive-relative path (images/<file>);
// the native wrapper (utils/backupArchiveFs.ts) relativizes on export and
// restores absolute documentDirectory URIs on import.
import type {
  Cookbook,
  Recipe,
  ShoppingList,
  ShoppingItem,
} from '../db/schema';

/**
 * Backup format version stamped into backup.json. Bump when the JSON shape
 * changes incompatibly; a backup whose version is greater than this is from a
 * newer app and is rejected rather than mis-restored (§5.17.4).
 */
export const BACKUP_SCHEMA_VERSION = 1;

export type BackupContent = {
  cookbooks: Cookbook[];
  recipes: Recipe[];
  shoppingLists: ShoppingList[];
  shoppingItems: ShoppingItem[];
  settings: { key: string; value: string }[];
};

export type ParseBackupJsonResult =
  | { ok: true; schemaVersion: number; content: BackupContent }
  | { ok: false; error: string };

/** Serializes content to the backup.json string, stamping the schema version. */
export function buildBackupJson(content: BackupContent): string {
  return JSON.stringify(
    {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      cookbooks: content.cookbooks,
      recipes: content.recipes,
      shoppingLists: content.shoppingLists,
      shoppingItems: content.shoppingItems,
      settings: content.settings,
    },
    null,
    2
  );
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Validates the NOT-NULL-without-default columns the restore relies on (ids for
 * remapping, titles/names that have no SQL default). This runs before any
 * destructive Replace, so a corrupted archive is rejected instead of wiping the
 * library and then failing mid-insert. Columns with a safe SQL default
 * (ingredients/instructions/notes) are intentionally not checked.
 */
function isRestorable(c: BackupContent): boolean {
  return (
    c.cookbooks.every((cb) => isNum(cb?.id) && isStr(cb?.name)) &&
    c.recipes.every((r) => isNum(r?.id) && isStr(r?.title)) &&
    c.shoppingLists.every((l) => isNum(l?.id) && isStr(l?.name)) &&
    c.shoppingItems.every(
      (it) => isNum(it?.id) && isNum(it?.listId) && isStr(it?.name)
    ) &&
    c.settings.every((s) => isStr(s?.key) && isStr(s?.value))
  );
}

/**
 * Parses and validates a backup.json string. Returns a typed result; never
 * throws. Missing optional sections default to empty arrays so older/partial
 * backups still restore; a newer schema version is refused.
 */
export function parseBackupJson(text: string): ParseBackupJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid backup file (invalid JSON).' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Not a valid backup file.' };
  }

  const obj = raw as Record<string, unknown>;
  const version = obj.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, error: 'Not a valid backup file (missing version).' };
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of the app.',
    };
  }

  const content: BackupContent = {
    cookbooks: asArray<Cookbook>(obj.cookbooks),
    recipes: asArray<Recipe>(obj.recipes),
    shoppingLists: asArray<ShoppingList>(obj.shoppingLists),
    shoppingItems: asArray<ShoppingItem>(obj.shoppingItems),
    settings: asArray<{ key: string; value: string }>(obj.settings),
  };

  if (!isRestorable(content)) {
    return { ok: false, error: 'This backup file is incomplete or corrupted.' };
  }

  return { ok: true, schemaVersion: version, content };
}
