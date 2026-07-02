// Change-driven automatic backup trigger (SPEC.md §5.17.3).
//
//   change → mark dirty + (re)arm a 5s debounce
//   debounce elapses → flush, but no more often than once per 30s (min-interval)
//   exit  → flushAutoBackup() on AppState 'background' forces a flush now
//
// WHY a foreground debounce is safe now (it was not always). Packing used to run
// in JS (base64 + zip on the JS heap) and froze the UI, so the build HAD to be
// pushed off the foreground and hidden behind the app-background event. That is
// gone: RNZA zips a staging dir natively and the SAF write streams through a
// native module (docs/backup-freeze-rootcause.md) — the build no longer touches
// the JS thread, so the app stays responsive while it runs and we can mirror
// eagerly instead of only on exit.
//
// The two knobs keep the eager model from thrashing a large library:
//   • DEBOUNCE (5s)  — a burst of edits collapses into one write, fired 5s after
//     the last change rather than one write per keystroke-save.
//   • MIN_INTERVAL (30s) — the whole archive is re-packed every write (no
//     incrementality), so we never do it more than once per 30s no matter how
//     fast changes land; extra changes just re-arm and coalesce.
//
// flushAutoBackup() is the forced path (app background): it bypasses both timers
// and writes now, because the user is leaving and we want the latest state
// mirrored. Concurrency is safe on every path: inFlight makes at most one write
// run at a time (a second trigger dedupes onto it), dirty is cleared when a write
// starts so a change landing mid-write re-arms a trailing flush, and
// write-then-prune (backupArchiveFs.ts) keeps the previous archive intact if a
// write is interrupted. Data itself is never at risk — every edit is already
// committed to SQLite synchronously; this only mirrors it to the SAF folder, and
// a hard-kill mid-write is healed on the next launch by maybeBackupOnLaunch.
//
// Pure scheduling/suppression logic — the actual native write (runAutoBackupNow)
// is the only import, so no expo-file-system is pulled in here and the module
// stays web-safe and unit-testable.
import { runAutoBackupNow } from '@/utils/backupArchiveFs';

/** Wait this long after the last change before writing, coalescing a burst. */
const DEBOUNCE_MS = 5_000;
/** Never re-pack the whole library more often than this. */
const MIN_INTERVAL_MS = 30_000;

// There are changes that haven't been mirrored to the backup folder yet.
let dirty = false;
// A flush currently in flight; dedupes concurrent triggers (e.g. a debounce
// firing while an AppState 'background' flush is already running).
let inFlight: Promise<void> | null = null;
// Pending debounce (post-change) and min-interval (rate-limit) timers.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let minIntervalTimer: ReturnType<typeof setTimeout> | null = null;
// When the last write started. -Infinity so the very first write is never
// rate-limited (elapsed is effectively infinite before any write has run).
let lastRunAt = Number.NEGATIVE_INFINITY;
// Depth of nested withAutoBackupSuppressed() calls; while > 0 scheduling and
// flushing are deferred until the outermost block exits.
let suppressDepth = 0;
// Whether a backup was requested while suppressed (so we fire one at the end).
let suppressedRequest = false;

function clearTimers(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (minIntervalTimer != null) {
    clearTimeout(minIntervalTimer);
    minIntervalTimer = null;
  }
}

/**
 * Starts the write now, unconditionally. Clears the change-driven timers (a
 * running write satisfies them), stamps lastRunAt, and on completion re-arms a
 * rate-limited trailing flush if changes landed mid-write. Deduped by inFlight.
 */
function runNow(): Promise<void> {
  if (inFlight) return inFlight;
  clearTimers();
  dirty = false;
  lastRunAt = Date.now();
  inFlight = runAutoBackupNow()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
      // A change that landed while this write ran re-arms a trailing flush,
      // still paced by the min-interval.
      if (suppressDepth === 0 && dirty) maybeRun();
    });
  return inFlight;
}

/**
 * Runs the pending write if the min-interval has elapsed since the last one;
 * otherwise arms a timer for the remainder and returns. No-op when clean,
 * already writing, or suppressed. This is the change-driven (rate-limited) path;
 * flushAutoBackup is the forced one.
 */
function maybeRun(): void {
  if (suppressDepth > 0) {
    suppressedRequest = true;
    return;
  }
  if (!dirty || inFlight) return;
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRunAt);
  if (wait <= 0) {
    void runNow();
  } else if (minIntervalTimer == null) {
    minIntervalTimer = setTimeout(() => {
      minIntervalTimer = null;
      maybeRun();
    }, wait);
  }
}

/**
 * Records that data changed and a mirror refresh is due. Marks dirty and (re)arms
 * the debounce so a burst of edits collapses into one write ~5s after the last
 * one; the write itself is still capped at once per 30s (min-interval). While
 * suppressed, only records that a backup is due, so the outermost exit fires one.
 * Always fire-and-forget — never throws, never returns a value.
 */
export function scheduleAutoBackup(): void {
  if (suppressDepth > 0) {
    suppressedRequest = true;
    return;
  }
  dirty = true;
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    maybeRun();
  }, DEBOUNCE_MS);
}

/**
 * Forces the pending backup now, bypassing the debounce and min-interval. Called
 * from the AppState 'background' handler (app/_layout.tsx): the user is leaving,
 * so we write the latest state immediately rather than waiting out a timer.
 * No-ops when nothing changed, when suppressed (a bulk op defers to its outermost
 * exit), or when a flush is already running (returns the in-flight promise so
 * concurrent triggers dedupe). Always resolves; never throws.
 */
export function flushAutoBackup(): Promise<void> {
  if (suppressDepth > 0) {
    // A bulk op owns the data right now; let its outermost exit fire one backup.
    suppressedRequest = true;
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  if (!dirty) {
    clearTimers();
    return Promise.resolve();
  }
  return runNow();
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

/** Test-only: resets all trigger state and cancels pending timers. */
export function __resetAutoBackupTrigger(): void {
  clearTimers();
  dirty = false;
  inFlight = null;
  lastRunAt = Number.NEGATIVE_INFINITY;
  suppressDepth = 0;
  suppressedRequest = false;
}
