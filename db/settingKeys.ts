// Setting-key rules shared by db/settings.ts and db/backup.ts. Dependency-free
// on purpose: tests mock db/settings with a hand-written module, so constants
// living there would be undefined under that mock.

/** Running cooking timers (SPEC.md §5.21) — device state, not library data. */
export const ACTIVE_TIMERS_KEY = 'active_timers';

/** Keys left out of a backup export. backup_* keys are still exported. */
export function isExcludedFromBackup(key: string): boolean {
  return key === ACTIVE_TIMERS_KEY;
}

/**
 * Keys never written back by a restore: device-specific backup_* settings
 * (e.g. a SAF folder URI from another device) and running timers (older
 * archives may carry them; recipe ids are reassigned on restore anyway).
 */
export function isSkippedOnRestore(key: string): boolean {
  return key.startsWith('backup_') || key === ACTIVE_TIMERS_KEY;
}
