// db/client runs its migrations when the module is imported, so the stub needs
// both of the calls that path makes, not just execSync.
export const openDatabaseSync = jest.fn(() => ({
  execSync: jest.fn(),
  getFirstSync: jest.fn(() => ({ user_version: 0 })),
}));
