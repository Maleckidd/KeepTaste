// Debounced, change-driven automatic backup trigger (SPEC.md §5.17.3).
// Pure scheduling/suppression logic; the actual native write (runAutoBackupNow)
// is mocked so no expo-file-system is pulled in.
jest.mock('../utils/backupArchiveFs');

import {
  AUTO_BACKUP_DEBOUNCE_MS,
  scheduleAutoBackup,
  withAutoBackupSuppressed,
  __resetAutoBackupTrigger,
} from '../utils/backupTrigger';
import { runAutoBackupNow } from '../utils/backupArchiveFs';

const mockRun = runAutoBackupNow as jest.MockedFunction<
  typeof runAutoBackupNow
>;

beforeEach(() => {
  jest.useFakeTimers();
  mockRun.mockReset();
  mockRun.mockResolvedValue(true);
});

afterEach(() => {
  __resetAutoBackupTrigger();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('AUTO_BACKUP_DEBOUNCE_MS', () => {
  it('is a positive number around 2.5s', () => {
    expect(typeof AUTO_BACKUP_DEBOUNCE_MS).toBe('number');
    expect(AUTO_BACKUP_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});

describe('scheduleAutoBackup', () => {
  it('fires runAutoBackupNow exactly once after the debounce', () => {
    scheduleAutoBackup();
    // Not yet — before the debounce elapses.
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS - 1);
    expect(mockRun).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('collapses several calls within the window into one backup', () => {
    scheduleAutoBackup();
    scheduleAutoBackup();
    scheduleAutoBackup();
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on each call (trailing debounce)', () => {
    const half = Math.floor(AUTO_BACKUP_DEBOUNCE_MS / 2);
    scheduleAutoBackup();
    jest.advanceTimersByTime(half);
    expect(mockRun).not.toHaveBeenCalled();

    // Re-arm before it fires; total elapsed now exceeds one debounce span
    // but is < a full debounce since this latest call.
    scheduleAutoBackup();
    jest.advanceTimersByTime(half);
    expect(mockRun).not.toHaveBeenCalled();

    // Let the remainder of the second window pass.
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS - half);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('is fire-and-forget (returns void, does not throw)', () => {
    expect(scheduleAutoBackup()).toBeUndefined();
  });
});

describe('withAutoBackupSuppressed', () => {
  it('makes scheduleAutoBackup a no-op while suppressed', async () => {
    let resolveInner: () => void;
    const gate = new Promise<void>((r) => {
      resolveInner = r;
    });

    const p = withAutoBackupSuppressed(async () => {
      scheduleAutoBackup();
      // While suppressed, no timer should be armed.
      jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS * 2);
      expect(mockRun).not.toHaveBeenCalled();
      await gate;
      return 'ok';
    });

    resolveInner!();
    await expect(p).resolves.toBe('ok');
  });

  it('schedules exactly one backup after a bulk op that scheduled N times', async () => {
    await withAutoBackupSuppressed(async () => {
      scheduleAutoBackup();
      scheduleAutoBackup();
      scheduleAutoBackup();
    });
    expect(mockRun).not.toHaveBeenCalled();

    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
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
      // Inner exit must NOT have armed a timer yet (still suppressed).
      jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
      expect(mockRun).not.toHaveBeenCalled();
      scheduleAutoBackup();
    });

    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('decrements depth and rethrows when fn throws', async () => {
    await expect(
      withAutoBackupSuppressed(async () => {
        scheduleAutoBackup();
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // Depth must be restored: scheduling now works normally again.
    scheduleAutoBackup();
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
