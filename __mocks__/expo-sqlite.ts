export const openDatabaseSync = jest.fn(() => ({
  execSync: jest.fn(),
}));
