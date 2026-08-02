// One-shot "first screen is fully loaded" signal for the splash gate
// (app/_layout.tsx). The home screen calls markAppReady() once its initial
// data (seed attempt + cookbook load) has resolved; the native splash stays up
// until then so launch goes logo → complete home, with no blank/partial frames
// in between. Pure logic — unit-tested.

type Listener = () => void;

let ready = false;
const listeners = new Set<Listener>();

/** True once the first screen has finished its initial load. */
export function isAppReady(): boolean {
  return ready;
}

/**
 * Marks the app ready and wakes subscribers. Idempotent — only the first call
 * notifies; later calls are no-ops.
 */
export function markAppReady(): void {
  if (ready) return;
  ready = true;
  const toNotify = [...listeners];
  listeners.clear();
  for (const listener of toNotify) listener();
}

/**
 * Subscribes to the ready flip (useSyncExternalStore-compatible). If the app
 * is already ready there is nothing left to wait for — no-op unsubscribe.
 */
export function subscribeAppReady(listener: Listener): () => void {
  if (ready) return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: resets the module state between cases. */
export function resetAppReadyForTests(): void {
  ready = false;
  listeners.clear();
}
