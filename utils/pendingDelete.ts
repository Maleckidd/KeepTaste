// Deferred-delete registry powering the "Deleted — Undo" snackbar.
//
// Deleting an object no longer asks "are you sure?" — the actual DB mutation
// (and image cleanup) is captured as a commit closure and held here while the
// snackbar counts down. Undo simply drops the closure; timeout (or a new
// delete of the same key) commits it. Screens hide pending objects via
// filterPendingDeletes() and re-render on registry changes through
// subscribePendingDeletes(), so a half-deleted cookbook never flashes back
// when navigating. Failure mode is deliberately safe: if the app dies before
// commit, nothing was deleted.

type CommitFn = () => void | Promise<void>;

const pending = new Map<string, CommitFn>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function pendingDeleteKey(kind: string, id: number): string {
  return `${kind}:${id}`;
}

/**
 * Register a delete. If the same key is already pending (deleted again before
 * the previous snackbar expired), the previous delete is committed first so
 * it is never silently lost.
 */
export function schedulePendingDelete(key: string, commit: CommitFn): void {
  const previous = pending.get(key);
  if (previous) {
    pending.delete(key);
    runCommit(previous);
  }
  pending.set(key, commit);
  notify();
}

export function isPendingDelete(key: string): boolean {
  return pending.has(key);
}

/** Undo: drop the scheduled delete. Returns false when nothing was pending. */
export function cancelPendingDelete(key: string): boolean {
  const existed = pending.delete(key);
  if (existed) notify();
  return existed;
}

/** Execute the delete for real. No-op when the key is not pending. */
export async function commitPendingDelete(key: string): Promise<void> {
  const commit = pending.get(key);
  if (!commit) return;
  pending.delete(key);
  await runCommit(commit);
  notify();
}

async function runCommit(commit: CommitFn): Promise<void> {
  try {
    await commit();
  } catch {
    // A failed commit must not break the registry or the UI; the object
    // simply survives (safe direction for a local-only app).
  }
}

/** Hide items whose delete is pending from a freshly loaded list. */
export function filterPendingDeletes<T>(
  items: T[],
  kind: string,
  getId: (item: T) => number
): T[] {
  if (pending.size === 0) return items;
  return items.filter((item) => !pending.has(pendingDeleteKey(kind, getId(item))));
}

/** Subscribe to registry changes (schedule/cancel/commit). Returns unsubscribe. */
export function subscribePendingDeletes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetPendingDeletesForTests(): void {
  pending.clear();
  listeners.clear();
}
