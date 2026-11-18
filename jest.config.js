/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
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
  moduleNameMapper: {
    // Local native module — mapped before the generic @/ alias so tests get the
    // stub instead of requireNativeModule('Safwriter') (which throws under node).
    '^@/modules/safwriter$': '<rootDir>/__mocks__/safwriter.ts',
    '^@/(.*)$': '<rootDir>/$1',
    // Native Expo modules are imported at module load time but never exercised
    // in pure-logic tests; map them to lightweight manual mocks.
    // Both specifiers map to the same stub: app code imports the /legacy
    // surface (see utils/imageStorage.ts), and dropping either entry sends the
    // backup tests into the real native module under node.
    '^expo-file-system(/legacy)?$': '<rootDir>/__mocks__/expo-file-system.ts',
    '^expo-image-manipulator$':
      '<rootDir>/__mocks__/expo-image-manipulator.ts',
    '^expo-sharing$': '<rootDir>/__mocks__/expo-sharing.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-localization$': '<rootDir>/__mocks__/expo-localization.ts',
    '^react-native-zip-archive$':
      '<rootDir>/__mocks__/react-native-zip-archive.ts',
    '^react-native$': '<rootDir>/__mocks__/react-native.ts',
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
