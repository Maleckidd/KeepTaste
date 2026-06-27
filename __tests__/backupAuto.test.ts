// Pure cadence decision for automatic backup (SPEC.md §5.17.3).
import {
  shouldAutoBackup,
  backupDisplayName,
  backupsToPrune,
  parseKeepCount,
} from '../utils/backupAuto';

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

describe('parseKeepCount', () => {
  it('returns the fallback for a missing value', () => {
    expect(parseKeepCount(null, 7)).toBe(7);
  });

  it('parses a stored positive integer', () => {
    expect(parseKeepCount('14', 7)).toBe(14);
  });

  it('falls back for non-numeric or non-positive values', () => {
    expect(parseKeepCount('garbage', 7)).toBe(7);
    expect(parseKeepCount('0', 7)).toBe(7);
    expect(parseKeepCount('-3', 7)).toBe(7);
  });
});

describe('backupDisplayName', () => {
  it('decodes the trailing filename of a SAF content URI', () => {
    const uri =
      'content://com.android.externalstorage.documents/tree/primary%3ABackups/' +
      'document/primary%3ABackups%2Fkeeptaste-backup-2026-06-27.zip';
    expect(backupDisplayName(uri)).toBe('keeptaste-backup-2026-06-27.zip');
  });

  it('handles a plain path', () => {
    expect(backupDisplayName('/tmp/dir/keeptaste-backup-2026-06-27.zip')).toBe(
      'keeptaste-backup-2026-06-27.zip'
    );
  });
});

describe('backupsToPrune', () => {
  const f = (date: string, suffix = '') =>
    `content://tree/document/primary%3ABackups%2Fkeeptaste-backup-${date}${suffix}.zip`;

  it('returns nothing when below the keep limit and no same-day file', () => {
    const uris = [f('2026-06-20'), f('2026-06-21')];
    expect(backupsToPrune(uris, '2026-06-27', 7)).toEqual([]);
  });

  it("deletes an existing same-day archive so the new write replaces it", () => {
    const uris = [f('2026-06-26'), f('2026-06-27')];
    expect(backupsToPrune(uris, '2026-06-27', 7)).toEqual([f('2026-06-27')]);
  });

  it("deletes SAF's deduped same-day variant too", () => {
    const uris = [f('2026-06-27'), f('2026-06-27', ' (1)')];
    expect(backupsToPrune(uris, '2026-06-27', 7).sort()).toEqual(
      [f('2026-06-27'), f('2026-06-27', ' (1)')].sort()
    );
  });

  it('keeps the newest (keep-1) others, counting today as one', () => {
    // keep=3 → after today is written, retain 2 others: the two newest.
    const uris = [
      f('2026-06-20'),
      f('2026-06-21'),
      f('2026-06-22'),
      f('2026-06-23'),
    ];
    expect(backupsToPrune(uris, '2026-06-27', 3)).toEqual([
      f('2026-06-20'),
      f('2026-06-21'),
    ]);
  });

  it('prunes others and replaces same-day together', () => {
    const uris = [f('2026-06-25'), f('2026-06-26'), f('2026-06-27')];
    // keep=2 → retain 1 other (newest = 26), delete 25 and the same-day 27.
    expect(backupsToPrune(uris, '2026-06-27', 2).sort()).toEqual(
      [f('2026-06-25'), f('2026-06-27')].sort()
    );
  });

  it('ignores files that are not our archives', () => {
    const uris = [f('2026-06-20'), f('notes.txt'), f('2026-06-21')];
    // f('notes.txt') → keeptaste-backup-notes.txt.zip, fails the date regex.
    expect(backupsToPrune(uris, '2026-06-27', 7)).toEqual([]);
  });
});
