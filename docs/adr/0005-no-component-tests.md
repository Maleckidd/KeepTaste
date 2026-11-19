# 0005. No component tests: unit tests cover pure logic, UI is verified by running it

- **Status:** Accepted
- **Date:** 2026-06-10 (in CLAUDE.md from the first commit, `874a292`;
  recorded retroactively on 2026-11-19)

## Context

Most of what can go wrong in this app is data transformation: parsing a
pasted recipe, a web page or an OCR'd photo, building and parsing both
backup formats, diacritic-folding search, timer planning, Polish plurals.
What is left in the screens is layout, gestures, animation and calls into
native modules: swipe rows, bottom sheets, the keyboard on edge-to-edge
Android, haptics, the share sheet.

## Decision

- Logic that can be pure is pulled out of components into `utils/`, `i18n/`
  and the pure parts of `db/`, and unit-tested in plain Node with native
  modules stubbed (`npm run test:unit`).
- There are no React Native Testing Library tests.
- UI is verified by running it: E2E in the browser
  ([0006](0006-web-export-as-e2e-harness.md)), persona studies on the
  emulator, and the manual plan on a phone.

The reasoning is in
[docs/TESTING.md](../TESTING.md#why-there-are-no-component-tests); the rule
is in [CLAUDE.md](../../CLAUDE.md).

## Alternatives considered

- **Component tests with React Native Testing Library.** Rejected. The
  layer they would cover does not survive a mock: gestures, sheets, the
  keyboard and native modules behave differently under a JS renderer with
  stubbed natives. A green test would say little about the real screen and
  would need updating with every UI change.
- **Logic left in components, tested through them.** Rejected because it
  makes the riskiest code the hardest to test. Pulling it out made it
  testable without a renderer.

## Consequences

- The unit suite is fast and exhaustive where the risk is. Coverage counts
  every file in `db/`, `utils/` and `i18n/`, so an untested module shows as
  0% instead of disappearing ([docs/TESTING.md](../TESTING.md#coverage)).
- Every new feature has to separate its logic from its screen, or the
  logic goes untested. The tester agent in the feature pipeline writes
  logic tests only (`.claude/agents/`).
- Bugs that live in wiring (a handler not connected, a wrong prop) are
  caught only by E2E, personas or a person. Native flows (`.zip` backup,
  OCR, background alarms, the share target) are not automated at all yet
  ([docs/TESTING.md](../TESTING.md#known-gaps)); Android E2E is
  [0011](0011-maestro-android-e2e.md).
- How strong the unit assertions are is measured separately, by mutation
  testing ([0010](0010-mutation-testing-stryker.md)).
