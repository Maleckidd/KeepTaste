// Debounced, change-driven automatic backup trigger (SPEC.md §5.17.3).
// A backup is scheduled whenever a recipe or cookbook changes; bursts collapse
// into a single async write. Pure scheduling/suppression logic — the actual
// native write (runAutoBackupNow) is the only import, so no expo-file-system is
// pulled in here and the module stays web-safe and unit-testable.
import { runAutoBackupNow } from '@/utils/backupArchiveFs';

/** Trailing-debounce window: bursts of changes collapse into one backup. */
export const AUTO_BACKUP_DEBOUNCE_MS = 2500;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
// Depth of nested withAutoBackupSuppressed() calls; while > 0 scheduling is
// deferred until the outermost block exits.
let suppressDepth = 0;
// Whether a backup was requested while suppressed (so we fire one at the end).
let suppressedRequest = false;

/**
 * Schedules an automatic backup, debounced (trailing). Each call clears any
 * pending timer and re-arms a single one; the burst collapses to one write.
 * While suppressed, arms no timer but records that a backup is due. Always
 * fire-and-forget — never throws, never returns a value.
 */
export function scheduleAutoBackup(): void {
  if (suppressDepth > 0) {
    suppressedRequest = true;
    return;
  }
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    // Swallow the promise — the write is best-effort and must never throw.
    void runAutoBackupNow();
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

/**
 * Runs `fn` with auto-backup scheduling suppressed, so a bulk op (import,
 * restore) that calls scheduleAutoBackup() many times fires exactly one backup
 * at the end instead of one per change. Nesting only fires once, at the
 * outermost exit. Always decrements the depth in finally, even on throw.
 */
export async function withAutoBackupSuppressed<T>(
  fn: () => Promise<T>
): Promise<T> {
  suppressDepth += 1;
  try {
    return await fn();
  } finally {
    suppressDepth -= 1;
    if (suppressDepth === 0 && suppressedRequest) {
      suppressedRequest = false;
      scheduleAutoBackup();
    }
  }
}

/** Test-only: clears any pending timer and resets suppression state. */
export function __resetAutoBackupTrigger(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  suppressDepth = 0;
  suppressedRequest = false;
}
