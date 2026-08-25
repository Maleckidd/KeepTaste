// Regression (SPEC.md §4 / §5.20): the schema must be created when db/client is
// imported, not from a screen effect. React fires child effects before the
// parent's, so migrations started in the root layout landed after the home
// screen's first-launch seed had already queried app_settings — on a fresh
// install that query hit a missing table, the seed swallowed the error, and the
// sample content never appeared.
const mockExecSync = jest.fn();
const mockGetFirstSync = jest.fn(() => ({ user_version: 0 }));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: mockExecSync,
    getFirstSync: mockGetFirstSync,
  }),
}));
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));

describe('db/client migrations', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExecSync.mockClear();
  });

  it('creates the schema on import, before any query can run', () => {
    require('../db/client');

    expect(mockExecSync).toHaveBeenCalled();
    const ddl = mockExecSync.mock.calls[0][0] as string;
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS app_settings');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS recipes');
  });

  it('does not re-run the DDL when the root layout calls runMigrations again', () => {
    const { runMigrations } = require('../db/client');
    const callsAfterImport = mockExecSync.mock.calls.length;

    runMigrations();

    expect(mockExecSync.mock.calls.length).toBe(callsAfterImport);
  });
});
