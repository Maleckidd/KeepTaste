// Pure cadence decision for automatic backup (SPEC.md §5.17.3).
import { shouldAutoBackup } from '../utils/backupAuto';

const DAY = 86_400_000;
const now = '2026-06-26T12:00:00.000Z';

describe('shouldAutoBackup', () => {
  it('backs up when there is no previous backup', () => {
    expect(shouldAutoBackup(null, now, 1)).toBe(true);
  });

  it('does not back up before the interval elapses', () => {
    const last = new Date(Date.parse(now) - 0.5 * DAY).toISOString();
    expect(shouldAutoBackup(last, now, 1)).toBe(false);
  });

  it('backs up once the interval has elapsed', () => {
    const last = new Date(Date.parse(now) - 1 * DAY).toISOString();
    expect(shouldAutoBackup(last, now, 1)).toBe(true);
  });

  it('backs up well past the interval', () => {
    const last = new Date(Date.parse(now) - 30 * DAY).toISOString();
    expect(shouldAutoBackup(last, now, 7)).toBe(true);
  });

  it('treats an unparseable last-backup timestamp as due', () => {
    expect(shouldAutoBackup('garbage', now, 1)).toBe(true);
  });
});
