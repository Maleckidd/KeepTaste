// Setting-key rules shared by db/settings.ts and db/backup.ts. Dependency-free
// on purpose: tests mock db/settings with a hand-written module, so constants
// living there would be undefined under that mock.

/** Running cooking timers (SPEC.md §5.21) — device state, not library data. */
export const ACTIVE_TIMERS_KEY = 'active_timers';

/**
 * Set ('1') once the one-time "notifications are off" snackbar for timer
 * alarms has been shown (SPEC.md §5.21, stage 2) — about this device's
 * notification permission, so it never travels with a backup.
 */
export const TIMER_ALARM_NOTICE_KEY = 'timer_alarm_notice';

/**
 * How many sessions the "allow alarms" (exact-alarm access) snackbar has been
 * shown — a count, capped by EXACT_ALARM_NOTICE_MAX. About this device's
 * system setting, so device-only like the alarm notice.
 */
export const TIMER_EXACT_NOTICE_KEY = 'timer_exact_notice';

/** Device-specific keys: never exported, never restored (exact match). */
const DEVICE_ONLY_KEYS: ReadonlySet<string> = new Set([
  ACTIVE_TIMERS_KEY,
  TIMER_ALARM_NOTICE_KEY,
  TIMER_EXACT_NOTICE_KEY,
]);

/** Keys left out of a backup export. backup_* keys are still exported. */
export function isExcludedFromBackup(key: string): boolean {
  return DEVICE_ONLY_KEYS.has(key);
}

/**
 * Keys never written back by a restore: device-specific backup_* settings
 * (e.g. a SAF folder URI from another device) and the device-only keys
 * (running timers — older archives may carry them; recipe ids are reassigned
 * on restore anyway — and the timer-alarm / exact-alarm notice records).
 */
export function isSkippedOnRestore(key: string): boolean {
  return key.startsWith('backup_') || DEVICE_ONLY_KEYS.has(key);
}
