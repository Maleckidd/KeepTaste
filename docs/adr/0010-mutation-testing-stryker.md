# 0010. Mutation testing with Stryker on the pure parsers, non-blocking

- **Status:** Accepted. Implemented on 2026-11-20
  ([`stryker.config.mjs`](../../stryker.config.mjs),
  [`mutation.yml`](../../.github/workflows/mutation.yml),
  [docs/mutation-testing.md](../mutation-testing.md)).
- **Date:** 2026-11-19

## Context

The parsers in `utils/` take the most hostile input the app sees: a web
page's JSON-LD and microdata, pasted text, OCR output from a photo, a
Markdown backup, a shared URL, durations inside instruction text. They
carry most of the unit tests ([0005](0005-no-component-tests.md)), and
coverage is enforced as a floor in CI. But coverage only proves a line ran, not that a test
would notice if it were wrong. How strong the parsers' assertions are has
not been measured ([docs/TESTING.md](../TESTING.md#known-gaps)).

## Decision

- **Tool:** [StrykerJS](https://stryker-mutator.io/) with its Jest runner.
  It changes the code in small ways (a flipped condition, a removed
  statement, a different regex) and reruns the tests. A change no test
  notices is a surviving mutant: a place where the tests would let a bug
  through.
- **Scope:** the pure parsers in `utils/`, for example
  [`recipeImport.ts`](../../utils/recipeImport.ts),
  [`importMarkdown.ts`](../../utils/importMarkdown.ts),
  [`ocrText.ts`](../../utils/ocrText.ts),
  [`durations.ts`](../../utils/durations.ts) and
  [`sharedUrl.ts`](../../utils/sharedUrl.ts). The exact list is set in the
  Stryker configuration. Native wrappers, screens and `db/` are out.
- **Tests:** the Jest `unit` project only
  ([`jest.config.js`](../../jest.config.js)). The parsers' tests live
  there; the `integration` project exercises `db/` on real SQLite and
  would only add run time per mutant.
- **When it runs:** a separate GitHub Actions workflow, started by hand
  and on a schedule. It is **not** a required check on pull requests.
- **Thresholds:** none at first. They are set only after the first
  baseline run shows the real score.

## Alternatives considered

- **A required check on every pull request.** Rejected for now. A
  mutation run reruns the tests once per mutant, so it is far slower than
  the unit suite, and a slow gate on every docs change teaches people to
  ignore it. It can become a gate later, once the baseline is known and
  the run time is.
- **Mutate the whole codebase.** Mutants in native wrappers and screens
  cannot be killed by unit tests by design (0005), so they would only add
  noise and run time.
- **Set a threshold up front.** A number picked before the first
  measurement is a guess. It either fails the first run for no reason or
  is set so low that it gates nothing.
- **Rely on coverage.** The floor in `jest.config.js` already exists, and
  it does not answer this question.

## Consequences

- Surviving mutants are triaged by a person: either a missing assertion
  (write the test) or an equivalent mutant that no test can kill (record
  it and move on). The score is a signal, not a target.
- A non-blocking workflow can go red without anyone noticing. Someone has
  to look at the scheduled runs.
- The thresholds, once set from the baseline, are added here as a dated
  note. Making mutation testing a required check would change the
  decision, so it needs a new ADR that supersedes this one.

## Notes

- **2026-11-20, baseline and thresholds.** The first full run scored
  62.74%. After the tests were strengthened (tests only, no parser code
  changed) it scored 68.66%. The thresholds were set from that
  measurement: `high: 80`, `low: 70`, `break: 65`, a few points under the
  current score. Per-file scores and the groups of survivors left alive
  on purpose are in [docs/mutation-testing.md](../mutation-testing.md).
- **2026-11-21, schedule removed.** The weekly cron is gone; the workflow
  runs only when started by hand (`workflow_dispatch`). The rest of the
  decision stands. The owner has no use for a recurring run, so a run
  happens when someone wants the report, and nothing is left to go red
  unnoticed.
