// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  // Generated or git-ignored output (see .gitignore); ESLint's flat config
  // does not read .gitignore itself.
  globalIgnores([
    'dist/*',
    'web-build/*',
    'coverage/*',
    '.expo/*',
    'playwright-report/*',
    'test-results/*',
    'android/*',
    'ios/*',
    'modules/*/android/build/*',
    'persona-lab/runs/*',
    'expo-env.d.ts',
  ]),
  expoConfig,
  {
    // React Compiler diagnostics. eslint-plugin-react-hooks v6 ships these in
    // its recommended set; they flag patterns that are unsafe *for the React
    // Compiler* — e.g. `useRef(new Animated.Value(0)).current`, the Animated
    // idiom from the React Native docs. This app does not opt into the
    // compiler (no `experiments.reactCompiler` in app.json), so they are off.
    // Turn them back on together with the compiler. The classic rules
    // (rules-of-hooks, exhaustive-deps) stay on.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    // Jest tests: `jest.mock()` calls sit above the imports they affect (Jest
    // hoists them anyway, so the order documents intent), and `require()` is
    // how a test re-imports a module after `jest.resetModules()`.
    files: ['__tests__/**', '__mocks__/**'],
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Playwright fixtures hand the value on through a callback named `use`,
    // which rules-of-hooks mistakes for React's use() hook.
    files: ['e2e/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Recipe Markdown goes through components/recipe/RecipeMarkdown.tsx, which
    // renders images as alt text instead of fetching them (SECURITY.md).
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-markdown-display',
              importNames: ['default', 'Markdown'],
              message:
                'Render Markdown with components/recipe/RecipeMarkdown: it never fetches remote images.',
            },
          ],
        },
      ],
    },
  },
]);
