/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Native Expo modules are imported at module load time but never exercised
    // in pure-logic tests; map them to lightweight manual mocks.
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.ts',
    '^expo-sharing$': '<rootDir>/__mocks__/expo-sharing.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // The app tsconfig is strict; tests don't need that to compile.
        diagnostics: false,
      },
    ],
  },
};
