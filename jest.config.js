/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Local native module — mapped before the generic @/ alias so tests get the
    // stub instead of requireNativeModule('Safwriter') (which throws under node).
    '^@/modules/safwriter$': '<rootDir>/__mocks__/safwriter.ts',
    '^@/(.*)$': '<rootDir>/$1',
    // Native Expo modules are imported at module load time but never exercised
    // in pure-logic tests; map them to lightweight manual mocks.
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.ts',
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
