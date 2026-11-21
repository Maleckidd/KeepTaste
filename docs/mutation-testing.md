# Mutation testing

Line and branch coverage say which code the unit tests *run*. Mutation testing
says which behaviour they *check*: [StrykerJS](https://stryker-mutator.io/)
makes small changes to the source (a `<` becomes `<=`, a regex loses its `^`,
a string becomes `""`), runs the tests against each changed copy (a *mutant*),
and counts how many mutants the tests notice (*killed*) and how many pass
unnoticed (*survived*). A survivor is a change in behaviour no assertion
catches.

## Scope

Only the pure text parsers and builders in `utils/` are mutated. They have no
native modules or I/O, so a survivor means a gap in the assertions, not in the
test setup:

| File | What it does |
|---|---|
| `recipeImport.ts` | JSON-LD, microdata and pasted-text recipe import |
| `ocrText.ts` | OCR block assembly and cleanup |
| `importMarkdown.ts` | `.md` backup / cookbook import |
| `durations.ts` | cooking-timer durations in instructions |
| `aiTranscribe.ts` | AI prompt and response cleanup |
| `sharedUrl.ts` | Android share-target URL extraction |
| `markdown.ts`, `backupMarkdown.ts` | `.md` export builders |
| `search.ts` | title and ingredient search |

The list lives in `mutate` in [`stryker.config.mjs`](../stryker.config.mjs).

## Running it

```bash
npm run test:mutation
```

A full run takes about 25–40 minutes on a laptop. Most of that time goes to
*static* mutants (module-level regexes and tables, 73% of all mutants), which
are not tied to one test and so have to run every related test. The report is
written to `reports/mutation/mutation.html` (git-ignored).

While working on one area, narrow the run to a file or a line range:

```bash
npx stryker run --mutate "utils/durations.ts"
```

```bash
npx stryker run --mutate "utils/ocrText.ts:466-514"
```

## Configuration notes

- **Runs the Jest `unit` project only.** The jest-runner drives Jest through
  `runCLI`, which cannot take a multi-project config (Stryker docs,
  troubleshooting). `stryker.config.mjs` reads `jest.config.js` and hands
  Stryker the `unit` project alone as a flat config, so the two can't drift
  apart. The `integration` project never imports these files.
- **TypeScript checker.** Mutants that don't type-check are marked
  `CompileError` and left out of the score: they could never ship. They are
  the `# errors` column in the report (966 of 5539).
- **`coverageAnalysis: "perTest"`** with `enableFindRelatedTests`: each mutant
  runs only the tests that cover it.
- **Pinned versions.** `@stryker-mutator/core`, `jest-runner` and
  `typescript-checker` are pinned to one exact version, since the plugins
  require that exact version of core.
- **`qs` override.** Stryker's core depends on `typed-rest-client`, which pins
  `qs@6.15.1` (four advisories). The client is only used by the Stryker
  Dashboard reporter, which this project doesn't use. `overrides` in
  `package.json` lifts it to a fixed `qs` so the audit gate stays green.
- **Sandbox.** Stryker copies the project to `.stryker-tmp/` and deletes it
  after a clean run. If a run is killed, delete `.stryker-tmp/` before running
  `tsc` or ESLint: both would otherwise check the copy as well.

## Scores

Mutation score = (killed + timeout) / (killed + timeout + survived + no
coverage). Measured 2026-11-20, Node 26, Stryker 10.1.1.

| File | Baseline | After | Survived (after) |
|---|---|---|---|
| **All files** | **62.74%** | **68.66%** | 1424 |
| `backupMarkdown.ts` | 87.50% | 100.00% | 0 |
| `markdown.ts` | 58.70% | 100.00% | 0 |
| `durations.ts` | 84.86% | 96.76% | 6 |
| `search.ts` | 90.00% | 92.00% | 4 |
| `importMarkdown.ts` | 71.65% | 88.98% | 26 |
| `aiTranscribe.ts` | 55.28% | 80.75% | 31 |
| `sharedUrl.ts` | 71.43% | 76.19% | 5 |
| `ocrText.ts` | 69.33% | 72.33% | 430 |
| `recipeImport.ts` | 55.16% | 59.30% | 922 |

The baseline is the score with the tests as they were before mutation testing
was set up. The new tests are in the files they belong to, each block marked
`Gaps found by mutation testing`.

## What was left alive, and why

Not every survivor is worth a test. The remaining ones fall into these groups.

**Equivalent mutants.** These change the code but not what it does, so no test
can kill them. For example:

- an early return that only short-cuts a path that already ends in the same
  result: the blank-input checks in `sharedUrl.ts`, `aiTranscribe.ts`,
  `importMarkdown.ts`, and the empty-query branch of `matchRecipes`;
- `split(/\s+/)` → `split(/\s/)` when the empty pieces are filtered out
  afterwards;
- `cleanAiResponse` runs its passes to a fixed point and trims after each one,
  so mutants that only matter on the first pass (whitespace-only lines around
  a fence, the leading-blank-line index) are undone by the next pass;
- tie-breakers like `a.index - b.index` → `a.index + b.index` in an
  already-stable sort;
- loop bounds that read one past the end of a string (`text[length]` is
  `undefined` and matches nothing).

**Heuristic tuning constants.** The paste and OCR parsers are tuned on real
samples. Their thresholds (a list line is at most 60 characters, a sentence
ends with `.` and has five words, a status bar sits within 1.6 line heights of
the top) are judgement calls, not a contract. Tests pinning each boundary to
the exact value would lock the tuning in place, so off-by-one mutants on these
constants are left alone. Boundaries the code documents as rules (the 24 h
timer limit, the 70% / half-line clipped-edge rule in `dropClippedEdgeLines`)
are tested.

**Word lists.** Most survivors in `recipeImport.ts` and `ocrText.ts` (about
two thirds) are `Regex` and `StringLiteral` mutants inside long alternations
and sets: the noise and chrome phrase lists (`APP_CHROME`, `NOISE_EXACT`,
`TITLE_CHROME`, `POST_META`, …), header vocabularies and the Polish OCR
misread table. Removing one phrase from a list of fifty is a mutant; killing
each would mean one test per phrase. These lists grow from real samples
(fixtures in `__tests__/fixtures/`), and that is where they are checked.

**Unrealistic input.** For example, a mutant that only shows on a `# Heading`
line placed between a recipe title and its first `###` section, which the
exporter never writes.

## CI

[`.github/workflows/mutation.yml`](../.github/workflows/mutation.yml) runs the
full suite on demand only (`workflow_dispatch`, Actions → Mutation testing →
Run workflow), and uploads the HTML report as the `mutation-report` artifact. It is **not** a
required check: a run takes too long for every PR, and it doesn't run on PRs at
all.

`thresholds.break` is 65, a few points under the measured score. The run fails
only if the score drops below that, which means assertions were lost, not just
noise.
