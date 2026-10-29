// Retry for a native call that sometimes never settles (pure, unit-tested).
// expo-print's first printToFileAsync after launch can hang on Android while a
// second call goes through at once (persona iteration 3, SPEC.md §5.14). A
// stalled attempt is not cancelled — it may still be the slow-but-honest one —
// so later attempts run alongside it and the first to resolve wins.

export type RaceRetriesOptions<T> = {
  /** Start another attempt when nothing has resolved this long after the last. */
  retryAfterMs: number;
  /** Most attempts ever started, counting the first. */
  maxAttempts: number;
  /** Reject when nothing has resolved this long after the start. */
  giveUpMs: number;
  /** Receives every result that arrives after the race is over (cleanup). */
  discard?: (value: T) => void;
};

export function raceRetries<T>(
  start: () => Promise<T>,
  { retryAfterMs, maxAttempts, giveUpMs, discard }: RaceRetriesOptions<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let started = 0;
    let pending = 0;
    let lastError: unknown = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      settled = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearTimeout(giveUpTimer);
    };

    const launch = () => {
      if (settled || started >= maxAttempts) return;
      started += 1;
      pending += 1;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = started < maxAttempts ? setTimeout(launch, retryAfterMs) : null;

      start().then(
        (value) => {
          pending -= 1;
          if (settled) {
            discard?.(value);
            return;
          }
          finish();
          resolve(value);
        },
        (error) => {
          pending -= 1;
          if (settled) return;
          lastError = error;
          if (started < maxAttempts) {
            launch();
          } else if (pending === 0) {
            finish();
            reject(error);
          }
        }
      );
    };

    const giveUpTimer = setTimeout(() => {
      if (settled) return;
      finish();
      reject(
        lastError ?? new Error(`Nothing resolved within ${giveUpMs} ms`)
      );
    }, giveUpMs);

    launch();
  });
}
