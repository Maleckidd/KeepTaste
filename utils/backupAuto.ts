// Pure retention/naming helpers for the optional automatic backup
// (SPEC.md §5.17.3). No native imports — testable in plain ts-jest.

/** How many dated archives to retain by default; older ones are pruned. */
export const AUTO_BACKUP_KEEP_DEFAULT = 2;

/** Selectable retention counts offered in Settings. */
export const AUTO_BACKUP_KEEP_OPTIONS = [1, 2, 3, 7, 14, 30] as const;

/**
 * Parses the stored retention count, falling back to `fallback` for missing or
 * invalid values. A positive integer is required (at least one backup is kept).
 */
export function parseKeepCount(
  raw: string | null,
  fallback = AUTO_BACKUP_KEEP_DEFAULT
): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** Matches the dated archives this app writes, incl. SAF's " (1)" dedupe suffix. */
const BACKUP_FILE_RE = /^keeptaste-backup-\d{4}-\d{2}-\d{2}.*\.zip$/i;

/** Trailing filename of a SAF content URI (or plain path), URI-decoded. */
export function backupDisplayName(uri: string): string {
  let s = uri;
  try {
    s = decodeURIComponent(uri);
  } catch {
    // keep the raw string if it isn't valid percent-encoding
  }
  const slash = s.lastIndexOf('/');
  return slash >= 0 ? s.slice(slash + 1) : s;
}

/**
 * Given the archive file URIs already in the backup folder, returns the ones to
 * delete *before* writing today's archive, so that (a) any existing same-day file
 * is replaced rather than duplicated as "... (1).zip", and (b) at most `keep`
 * dated archives remain afterwards (the newest by name, which sorts
 * chronologically). Non-backup files are left untouched. `todayDate` is "YYYY-MM-DD".
 */
export function backupsToPrune(
  uris: string[],
  todayDate: string,
  keep: number
): string[] {
  const backups = uris
    .map((uri) => ({ uri, name: backupDisplayName(uri) }))
    .filter((f) => BACKUP_FILE_RE.test(f.name));

  const sameDayPrefix = `keeptaste-backup-${todayDate}`;
  const sameDay = backups.filter((f) => f.name.startsWith(sameDayPrefix));
  const others = backups
    .filter((f) => !f.name.startsWith(sameDayPrefix))
    .sort((a, b) => a.name.localeCompare(b.name)); // oldest first

  // Today's write counts as one, so retain only the newest (keep - 1) others.
  const retainOthers = Math.max(0, keep - 1);
  const surplus = Math.max(0, others.length - retainOthers);

  return [...sameDay, ...others.slice(0, surplus)].map((f) => f.uri);
}
