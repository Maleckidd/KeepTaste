// Change-driven automatic backup trigger (SPEC.md §5.17.3).
//
//   change → mark the mirror dirty (no work)
//   exit   → flushAutoBackup() on AppState 'background' (off-screen)
//
// WHY flush on background rather than on every change — this is NOT (any longer)
// a freeze workaround. Packing used to run in JS (base64 + zip on the JS heap)
// and froze the UI, so the build HAD to be pushed off the foreground. That is
// gone: RNZA now zips a staging dir natively, off-thread, with photo bytes never
// touching the heap (docs/backup-freeze-rootcause.md), so the build could run in
// the foreground without hanging the UI.
//
// The dirty-flag/flush-on-background model is kept for a different reason: COST.
// Auto-backup has no incrementality — it re-packs the WHOLE library plus every
// photo, and the SAF write still base64-reads the finished zip once
// (backupArchiveFs.ts). Doing that per keystroke-save would churn disk, I/O and
// battery for no benefit. Coalescing to one repack when the user leaves gives a
// single clean end-of-session snapshot instead.
//
// There is deliberately NO foreground timer: the only thing that runs the build
// is leaving the app (or a launch-time crash-recovery re-arm, which itself just
// marks dirty and flushes on the next background). A long foreground session
// mirrors its changes when the user next backgrounds the app, and a crash
// mid-session is healed on the next launch by maybeBackupOnLaunch
// (utils/backupArchiveFs.ts). The user's data is never at risk regardless —
// every edit is already committed to SQLite synchronously; this only mirrors it
// to the SAF/cloud folder.
//
// Pure scheduling/suppression logic — the actual native write (runAutoBackupNow)
// is the only import, so no expo-file-system is pulled in here and the module
// stays web-safe and unit-testable.
import { runAutoBackupNow } from '@/utils/backupArchiveFs';

// There are changes that haven't been mirrored to the backup folder yet.
let dirty = false;
// A flush currently in flight; dedupes concurrent triggers (e.g. two AppState
// 'background' emissions, or a background flush racing a launch re-arm).
let inFlight: Promise<void> | null = null;
// Depth of nested withAutoBackupSuppressed() calls; while > 0 scheduling and
// flushing are deferred until the outermost block exits.
let suppressDepth = 0;
// Whether a backup was requested while suppressed (so we fire one at the end).
let suppressedRequest = false;

/**
 * Records that data changed and a mirror refresh is due. Does NOT run the heavy
 * build — it only marks the state dirty; the real write happens on the next
 * flushAutoBackup() (app background, or a launch-time crash-recovery re-arm).
 * While suppressed, records that a backup is due without marking dirty yet, so
 * the outermost exit fires exactly one. Always fire-and-forget — never throws,
 * never returns a value.
 */
export function scheduleAutoBackup(): void {
  if (suppressDepth > 0) {
    suppressedRequest = true;
    return;
  }
  dirty = true;
}

/**
 * Runs the pending backup now if one is due. Called from the AppState
 * 'background' handler (app/_layout.tsx). No-ops when nothing changed since the
 * last flush, when suppressed (a bulk op is mid-flight — defer to its outermost
 * exit), or when a flush is already running (returns the in-flight promise so
 * concurrent triggers dedupe). Clears the dirty flag up front so a change
 * landing mid-write re-arms a fresh flush rather than being swallowed. Always
 * resolves; never throws.
 */
export function flushAutoBackup(): Promise<void> {
  if (suppressDepth > 0) {
    // A bulk op owns the data right now; let its outermost exit fire one backup.
    suppressedRequest = true;
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  if (!dirty) return Promise.resolve();

  dirty = false;
  inFlight = runAutoBackupNow()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
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

/** Test-only: resets all trigger state. */
export function __resetAutoBackupTrigger(): void {
  dirty = false;
  inFlight = null;
  suppressDepth = 0;
  suppressedRequest = false;
}
