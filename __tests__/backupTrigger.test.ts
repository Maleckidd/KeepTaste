// Change-driven automatic backup trigger (SPEC.md §5.17.3).
// Pure scheduling/suppression logic; the actual native write (runAutoBackupNow)
// is mocked so no expo-file-system is pulled in. The model is: a change arms a 5s
// debounce, the write is rate-limited to once per 30s (min-interval), and
// flushAutoBackup() (app background) forces a write immediately, bypassing both
// timers. These first suites use real timers and drive writes only through the
// forced flushAutoBackup(); the debounce/min-interval suite below uses fake timers.
jest.mock('../utils/backupArchiveFs');

import {
  scheduleAutoBackup,
  flushAutoBackup,
  withAutoBackupSuppressed,
  __resetAutoBackupTrigger,
} from '../utils/backupTrigger';
import { runAutoBackupNow } from '../utils/backupArchiveFs';

const mockRun = runAutoBackupNow as jest.MockedFunction<
  typeof runAutoBackupNow
>;

beforeEach(() => {
  mockRun.mockReset();
  mockRun.mockResolvedValue(true);
});

afterEach(() => {
  __resetAutoBackupTrigger();
});

describe('scheduleAutoBackup', () => {
  it('does not run the heavy build on its own — only marks dirty', async () => {
    scheduleAutoBackup();
    // No timer: nothing fires until an explicit flush (app background).
    expect(mockRun).not.toHaveBeenCalled();

    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('collapses several changes into one flush', async () => {
    scheduleAutoBackup();
    scheduleAutoBackup();
    scheduleAutoBackup();
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('is fire-and-forget (returns void, does not throw)', () => {
    expect(scheduleAutoBackup()).toBeUndefined();
  });
});

describe('flushAutoBackup', () => {
  it('runs the pending backup when something changed', async () => {
    scheduleAutoBackup();
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('no-ops when nothing changed since the last flush', async () => {
    // Background with no edits → nothing to do.
    await flushAutoBackup();
    expect(mockRun).not.toHaveBeenCalled();

    scheduleAutoBackup();
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);

    // Backgrounding again without new edits does nothing.
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent flushes into a single in-flight run', async () => {
    let resolveRun: (v: boolean) => void;
    mockRun.mockReturnValue(
      new Promise<boolean>((r) => {
        resolveRun = r;
      })
    );

    scheduleAutoBackup();
    const a = flushAutoBackup();
    const b = flushAutoBackup(); // e.g. two AppState 'background' emissions
    expect(mockRun).toHaveBeenCalledTimes(1);

    resolveRun!(true);
    await Promise.all([a, b]);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('a change during a flush is mirrored by the next flush', async () => {
    let resolveRun: (v: boolean) => void;
    mockRun.mockReturnValueOnce(
      new Promise<boolean>((r) => {
        resolveRun = r;
      })
    );

    scheduleAutoBackup();
    const first = flushAutoBackup();
    // Edit lands while the build is in flight → dirty again.
    scheduleAutoBackup();
    resolveRun!(true);
    await first;
    expect(mockRun).toHaveBeenCalledTimes(1);

    // Next background flush picks up the mid-flight change.
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('never throws even if the underlying write rejects', async () => {
    mockRun.mockRejectedValue(new Error('disk full'));
    scheduleAutoBackup();
    await expect(flushAutoBackup()).resolves.toBeUndefined();
  });
});

describe('withAutoBackupSuppressed', () => {
  it('makes scheduleAutoBackup + flush a no-op while suppressed', async () => {
    await withAutoBackupSuppressed(async () => {
      scheduleAutoBackup();
      // e.g. the app backgrounds mid-restore — must not run now.
      await flushAutoBackup();
      expect(mockRun).not.toHaveBeenCalled();
    });

    // Outermost exit re-arms; the next background flush fires the single backup.
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('schedules exactly one backup after a bulk op that scheduled N times', async () => {
    await withAutoBackupSuppressed(async () => {
      scheduleAutoBackup();
      scheduleAutoBackup();
      scheduleAutoBackup();
    });
    expect(mockRun).not.toHaveBeenCalled();

    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('returns the wrapped function result', async () => {
    await expect(
      withAutoBackupSuppressed(async () => 42)
    ).resolves.toBe(42);
  });

  it('fires only once at the outermost exit when nested', async () => {
    await withAutoBackupSuppressed(async () => {
      scheduleAutoBackup();
      await withAutoBackupSuppressed(async () => {
        scheduleAutoBackup();
        scheduleAutoBackup();
      });
      // Inner exit must NOT have armed anything yet (still suppressed).
      await flushAutoBackup();
      expect(mockRun).not.toHaveBeenCalled();
      scheduleAutoBackup();
    });

    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('decrements depth and rethrows when fn throws', async () => {
    await expect(
      withAutoBackupSuppressed(async () => {
        scheduleAutoBackup();
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // Depth restored and the suppressed request re-armed: a flush now works.
    await flushAutoBackup();
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});

describe('debounce + min-interval (change-driven, fake timers)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    __resetAutoBackupTrigger();
    jest.useRealTimers();
  });

  it('waits out the 5s debounce before the first write', async () => {
    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(4999);
    expect(mockRun).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1); // 5000ms total
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of changes into one debounced write', async () => {
    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(2000);
    scheduleAutoBackup(); // resets the debounce
    await jest.advanceTimersByTimeAsync(2000);
    scheduleAutoBackup(); // resets again
    expect(mockRun).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5000);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('holds a second write until 30s after the first (min-interval)', async () => {
    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(5000); // write #1
    expect(mockRun).toHaveBeenCalledTimes(1);

    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(5000); // debounce elapses, ~10s in
    expect(mockRun).toHaveBeenCalledTimes(1); // min-interval not reached yet

    await jest.advanceTimersByTimeAsync(25000); // 30s+ since write #1
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('auto-mirrors a change made during a write, after the min-interval', async () => {
    let resolveFirst!: (v: boolean) => void;
    mockRun.mockReturnValueOnce(
      new Promise<boolean>((r) => {
        resolveFirst = r;
      })
    );

    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(5000); // write #1 starts (pending)
    expect(mockRun).toHaveBeenCalledTimes(1);

    scheduleAutoBackup(); // change lands mid-write → dirty again
    resolveFirst(true);
    await jest.advanceTimersByTimeAsync(0); // let write #1 finalize + trailing arm
    expect(mockRun).toHaveBeenCalledTimes(1); // trailing waits out min-interval

    await jest.advanceTimersByTimeAsync(30000);
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('background flush forces a write, bypassing debounce and min-interval', async () => {
    scheduleAutoBackup();
    await jest.advanceTimersByTimeAsync(5000); // write #1
    expect(mockRun).toHaveBeenCalledTimes(1);

    scheduleAutoBackup(); // well within the 30s window
    await flushAutoBackup(); // app backgrounds → forced now
    expect(mockRun).toHaveBeenCalledTimes(2);
  });
});
