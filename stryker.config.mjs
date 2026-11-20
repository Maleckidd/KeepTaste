// Mutation testing (StrykerJS) for the pure parsers and builders in utils/.
// See docs/mutation-testing.md for what is mutated, why, and how to read the
// report. Run with `npm run test:mutation`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestConfig = require('./jest.config.js');

// The jest-runner drives Jest through runCLI, which cannot take a
// multi-project config (Stryker docs: troubleshooting, "Jest crashes with a
// multi project configuration"). So hand it the `unit` project alone, as a
// flat config. The integration project (sql.js) never imports these files and
// would only slow every mutant down.
const unitProject = jestConfig.projects.find((p) => p.displayName === 'unit');
if (!unitProject) {
  throw new Error('jest.config.js has no project with displayName "unit"');
}
const { displayName: _displayName, ...unitConfig } = unitProject;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    // package.json has no "jest" key, so the file-based config is empty and
    // `config` below is the whole Jest config (Stryker shallow-merges the
    // two; pointing at jest.config.js would bring its `projects` back).
    configFile: 'package.json',
    config: unitConfig,
    enableFindRelatedTests: true,
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  coverageAnalysis: 'perTest',
  // Only the pure text parsers and builders: no native modules, no I/O, so
  // a surviving mutant means a gap in the assertions, not in the test setup.
  mutate: [
    'utils/recipeImport.ts',
    'utils/importMarkdown.ts',
    'utils/ocrText.ts',
    'utils/durations.ts',
    'utils/sharedUrl.ts',
    'utils/aiTranscribe.ts',
    'utils/markdown.ts',
    'utils/backupMarkdown.ts',
    'utils/search.ts',
  ],
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  // Measured 2026-11-20: 62.7% before the mutation-driven tests, 68.66% after.
  // `break` sits a few points under that so timing noise (mutants flipping
  // between Timeout and Survived on a slower runner) does not fail the run,
  // while a real loss of assertions does. Raise it as the score goes up.
  thresholds: { high: 80, low: 70, break: 65 },
};
