# Architecture Decision Records

An ADR records one decision that shaped the code: the problem at the time,
what was chosen, what was rejected, and what the choice costs. The point is
the *why*. The *what* lives in [SPEC.md](../../SPEC.md),
[CLAUDE.md](../../CLAUDE.md) and the code, and each ADR links there instead
of repeating it.

## Format

A lightweight [MADR](https://adr.github.io/madr/) style. Each file is
`NNNN-short-title.md` and has these sections:

- **Status**: `Proposed`, `Accepted`, `Superseded by NNNN` or `Deprecated`.
- **Date**: when the decision was made. Most of these ADRs were written on
  2026-11-19, after the fact. For those, the date is the commit that put the
  decision into the code, and the ADR says it was recorded retroactively.
- **Context**: the forces at the time.
- **Decision**: what was chosen.
- **Alternatives considered**: what was rejected, and why.
- **Consequences**: what the choice costs, and what it obliges future
  changes to do.

An accepted ADR is not edited to change its decision. A new ADR supersedes
it, and the old one's status points to the new one.

## Index

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-local-only-offline.md) | Local-only and offline: no backend, no accounts, no sync | Accepted | 2026-06-10 |
| [0002](0002-no-global-state-management.md) | No global state manager: screens load on focus and reload after a mutation | Accepted | 2026-06-10 |
| [0003](0003-hand-written-migrations.md) | Hand-written migrations with a `PRAGMA user_version` ladder, not Drizzle Kit | Accepted | 2026-06-26 |
| [0004](0004-zip-backup-of-record.md) | The `.zip` archive is the backup of record; Markdown is its readable layer | Accepted | 2026-06-26 |
| [0005](0005-no-component-tests.md) | No component tests: unit tests cover pure logic, UI is verified by running it | Accepted | 2026-06-10 |
| [0006](0006-web-export-as-e2e-harness.md) | The web build is a test harness only; Playwright on the static export is the CI E2E gate | Accepted | 2026-11-19 |
| [0007](0007-android-sdk-not-pinned.md) | The Android compile/target SDK is not pinned | Accepted | 2026-08-02 |
| [0008](0008-expo-file-system-legacy.md) | Stay on `expo-file-system/legacy` for now | Accepted | 2026-08-02 |
| [0009](0009-actions-pinned-to-sha.md) | GitHub Actions pinned to full commit SHAs | Accepted | 2026-11-19 |
| [0010](0010-mutation-testing-stryker.md) | Mutation testing with Stryker on the pure parsers, non-blocking | Accepted, implementation in progress | 2026-11-19 |
| [0011](0011-maestro-android-e2e.md) | Maestro for Android E2E, run locally, no CI for now | Accepted, implementation in progress | 2026-11-19 |

## Adding one

Copy the structure of an existing ADR, take the next number, and add a row
above. Write an ADR when a choice is hard to reverse, when a reasonable
person would have chosen differently, or when the code alone would make a
future change look like a harmless cleanup (re-adding an SDK pin, say, or a
state library).
