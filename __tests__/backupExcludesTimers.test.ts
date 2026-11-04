// TDD red phase for cooking timers, stage 1 (SPEC.md §5.21) — running timers
// are device state, persisted in app_settings.active_timers, and must stay out
// of backups: excluded from export, skipped on restore. backup_* keys keep
// today's behaviour (exported, skipped on restore).
//
// Target module (does NOT exist yet): db/settingKeys.ts — dependency-free:
//   ACTIVE_TIMERS_KEY, isExcludedFromBackup(key), isSkippedOnRestore(key)
// and db/backup.ts getFullBackupData filtering with isExcludedFromBackup.
//
// db/client is mocked (pattern from restoreFullBackup.test.ts): select().from()
// resolves rows by table identity against the real schema objects.
import {
  cookbooks,
  recipes,
  shoppingLists,
  shoppingItems,
  appSettings,
} from '../db/schema';

const rowsByTable = new Map<unknown, unknown[]>();

const db = {
  select: () => ({
    from: (table: unknown) => Promise.resolve(rowsByTable.get(table) ?? []),
  }),
};

jest.mock('../db/client', () => ({ db, runMigrations: jest.fn() }));
jest.mock('../db/settings', () => ({
  setSetting: jest.fn(),
  getSetting: jest.fn(),
  markDemoSeeded: jest.fn(),
  markUserEdited: jest.fn(),
  isDemoSeeded: jest.fn(),
  isUserEdited: jest.fn(),
}));

import { getFullBackupData } from '../db/backup';
import {
  ACTIVE_TIMERS_KEY,
  isExcludedFromBackup,
  isSkippedOnRestore,
} from '../db/settingKeys';

beforeEach(() => {
  rowsByTable.clear();
  rowsByTable.set(cookbooks, [
    { id: 1, name: 'A', coverImagePath: null, createdAt: '2026-01-01T00:00:00.000Z' },
  ]);
  rowsByTable.set(recipes, []);
  rowsByTable.set(shoppingLists, []);
  rowsByTable.set(shoppingItems, []);
  rowsByTable.set(appSettings, [
    { key: 'language', value: 'pl' },
    { key: 'backup_folder_uri', value: 'content://somewhere' },
    {
      key: 'active_timers',
      value: '[{"id":"a","recipeId":1,"sourceKey":"k","title":"T","step":null,"durationSec":60,"state":"paused","remainingSec":30}]',
    },
  ]);
});

describe('settingKeys', () => {
  it('names the timers key active_timers', () => {
    expect(ACTIVE_TIMERS_KEY).toBe('active_timers');
  });

  it('isExcludedFromBackup is true for active_timers only', () => {
    expect(isExcludedFromBackup('active_timers')).toBe(true);
    expect(isExcludedFromBackup('backup_folder_uri')).toBe(false);
    expect(isExcludedFromBackup('backup_last_at')).toBe(false);
    expect(isExcludedFromBackup('language')).toBe(false);
    expect(isExcludedFromBackup('theme')).toBe(false);
    expect(isExcludedFromBackup('demo_seeded')).toBe(false);
  });

  it('isSkippedOnRestore is true for backup_* and active_timers', () => {
    expect(isSkippedOnRestore('active_timers')).toBe(true);
    expect(isSkippedOnRestore('backup_folder_uri')).toBe(true);
    expect(isSkippedOnRestore('backup_last_at')).toBe(true);
    expect(isSkippedOnRestore('language')).toBe(false);
    expect(isSkippedOnRestore('theme')).toBe(false);
    expect(isSkippedOnRestore('user_edited')).toBe(false);
  });
});

describe('getFullBackupData', () => {
  it('omits active_timers from exported settings', async () => {
    const data = await getFullBackupData();
    const keys = data.settings.map((s) => s.key);
    expect(keys).not.toContain('active_timers');
  });

  it('still exports language and backup_* settings', async () => {
    const data = await getFullBackupData();
    expect(data.settings).toEqual([
      { key: 'language', value: 'pl' },
      { key: 'backup_folder_uri', value: 'content://somewhere' },
    ]);
  });

  it('exports the other tables unchanged', async () => {
    const data = await getFullBackupData();
    expect(data.cookbooks).toHaveLength(1);
    expect(data.recipes).toEqual([]);
  });
});
