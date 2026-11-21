// Tests for shouldSilentReplace (seed sample content on first launch).
// Pure truth-table decision for whether a restore may skip the Replace/Add
// prompt (§5.17.1). It lives in db/backup.ts, which imports db/client; that
// native connection is mocked (the established pattern, see
// restoreFullBackup.test.ts / deleteAllData.test.ts) so the import resolves
// under node without pulling in expo-sqlite.
//
// Rule: a restore is silent when the current library is either genuinely empty,
// OR is nothing but the untouched demo seed (demoSeeded && !userEdited). Once
// the user has edited the seeded content, their changes must not be silently
// clobbered.
jest.mock('../db/client', () => ({ db: {}, runMigrations: jest.fn() }));
jest.mock('../db/settings', () => ({ setSetting: jest.fn(), getSetting: jest.fn() }));

import { shouldSilentReplace } from '../db/backup';

describe('shouldSilentReplace', () => {
  it('is silent whenever the library is empty, regardless of other flags', () => {
    expect(
      shouldSilentReplace({ empty: true, demoSeeded: false, userEdited: false })
    ).toBe(true);
    expect(
      shouldSilentReplace({ empty: true, demoSeeded: true, userEdited: false })
    ).toBe(true);
    expect(
      shouldSilentReplace({ empty: true, demoSeeded: true, userEdited: true })
    ).toBe(true);
    expect(
      shouldSilentReplace({ empty: true, demoSeeded: false, userEdited: true })
    ).toBe(true);
  });

  it('is silent when only the untouched demo seed is present', () => {
    expect(
      shouldSilentReplace({ empty: false, demoSeeded: true, userEdited: false })
    ).toBe(true);
  });

  it('is NOT silent once the demo seed has been edited by the user', () => {
    expect(
      shouldSilentReplace({ empty: false, demoSeeded: true, userEdited: true })
    ).toBe(false);
  });

  it('is NOT silent when non-empty and not demo-seeded, regardless of userEdited', () => {
    expect(
      shouldSilentReplace({ empty: false, demoSeeded: false, userEdited: false })
    ).toBe(false);
    expect(
      shouldSilentReplace({ empty: false, demoSeeded: false, userEdited: true })
    ).toBe(false);
  });
});
