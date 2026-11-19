/**
 * Two Jest projects:
 * - `unit` — pure logic in db/, utils/, i18n/; native modules (incl.
 *   expo-sqlite) are mapped to lightweight stubs in __mocks__/.
 * - `integration` — the db/ layer against real SQLite (sql.js), running the
 *   real db/client.ts migrations and drizzle's expo-sqlite driver; only the
 *   native binding is swapped (__tests__/integration/support/).
 *
 * `npm test` runs both; `npm run test:unit` / `npm run test:integration` one.
 */

// Shared by both projects. Local native module first, before the generic @/
// alias, so tests get the stub instead of requireNativeModule('Safwriter')
// (which throws under node).
const sharedModuleNameMapper = {
  '^@/modules/safwriter$': '<rootDir>/__mocks__/safwriter.ts',
  '^@/(.*)$': '<rootDir>/$1',
  // Native Expo modules are imported at module load time but never exercised
  // in pure-logic tests; map them to lightweight manual mocks.
  // Both specifiers map to the same stub: app code imports the /legacy
  // surface (see utils/imageStorage.ts), and dropping either entry sends the
  // backup tests into the real native module under node.
  '^expo-file-system(/legacy)?$': '<rootDir>/__mocks__/expo-file-system.ts',
  '^expo-image-manipulator$': '<rootDir>/__mocks__/expo-image-manipulator.ts',
  '^expo-sharing$': '<rootDir>/__mocks__/expo-sharing.ts',
  '^expo-localization$': '<rootDir>/__mocks__/expo-localization.ts',
  '^react-native-zip-archive$': '<rootDir>/__mocks__/react-native-zip-archive.ts',
  '^react-native$': '<rootDir>/__mocks__/react-native.ts',
};

const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
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

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/integration/'],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
      },
    },
    {
      ...shared,
      displayName: 'integration',
      // Root-level __mocks__/ would replace node modules by name (including
      // expo-sqlite, ahead of moduleNameMapper), so this project's roots
      // leave it out. Source files outside roots are still requireable.
      roots: ['<rootDir>/__tests__/integration'],
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        '^expo-sqlite$': '<rootDir>/__tests__/integration/support/expoSqliteOnSqlJs.ts',
      },
    },
  ],
  // Coverage is measured over every source file in the logic layers, not only
  // the files a test happens to import — an untested file counts as 0%.
  // Thin native wrappers (utils/timerAlarm.ts, utils/haptics.ts, …) are in
  // the denominator on purpose; they are verified on-device, see
  // docs/TESTING.md.
  collectCoverageFrom: [
    'db/**/*.{ts,tsx}',
    'utils/**/*.{ts,tsx}',
    'i18n/**/*.{ts,tsx}',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // A floor just under the measured level (2026-11-18): coverage may go up,
  // CI fails if it drops. Raise it as tests are added.
  coverageThreshold: {
    global: { statements: 79, branches: 85, functions: 75, lines: 79 },
  },
};
