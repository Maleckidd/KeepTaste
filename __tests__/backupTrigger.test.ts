// Change-driven automatic backup trigger (SPEC.md §5.17.3).
// Pure scheduling/suppression logic; the actual native write (runAutoBackupNow)
// is mocked so no expo-file-system is pulled in. The model is dirty-flag +
// explicit flushAutoBackup() (fired on app background) — there is no foreground
// timer, so scheduleAutoBackup() never runs the build on its own.
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
