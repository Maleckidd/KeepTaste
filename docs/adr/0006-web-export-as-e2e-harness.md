# 0006. The web build is a test harness only; Playwright on the static export is the CI E2E gate

- **Status:** Accepted
- **Date:** 2026-11-19 (Playwright as the CI gate, commit `1589737`, merged
  in [Maleckidd/KeepTaste#6](https://github.com/Maleckidd/KeepTaste/pull/6);
  the web build has been a test environment only since the first commit,
  2026-06-10; recorded retroactively on 2026-11-19)

## Context

The product is an Android app. Flows that cross layers (form → database →
list → search) need an end-to-end check, but an Android emulator and an APK
build are heavy for every pull request
([0011](0011-maestro-android-e2e.md)). React Native Web gives a browser
build of the same screens almost for free, as long as nobody mistakes it
for a product.

## Decision

- **Web is not a product platform**
  ([SPEC.md §2](../../SPEC.md#2-platform-and-stack)). It exists for E2E
  and agent smoke tests. It runs on an in-memory sql.js database
  ([`db/client.web.ts`](../../db/client.web.ts)) that resets on every
  reload. Web-only bugs outside the test flows are out of scope.
- **Playwright drives the static export** (`npm run e2e:build` →
  `dist/`, served by a dependency-free static server), on Chromium at a
  Pixel 7 viewport ([`playwright.config.ts`](../../playwright.config.ts),
  [`e2e/`](../../e2e/)). It is a CI job on every pull request
  ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).
- **The run is hermetic.** The test fixture serves sql.js's WebAssembly
  from `node_modules` and blocks and records every other request; a test
  fails if the page called out or threw
  ([docs/TESTING.md](../TESTING.md#e2e-the-flows-across-layers)).

## Alternatives considered

- **The pilot on another E2E runner** (commit `8a01f4a`, 2026-11-18). It
  had a web target on the Expo dev server and an Android target on an
  emulator. It was unfinished (its config pointed at a document and an
  npm script that did not exist) and was replaced the next day. Its flows
  were ported to Playwright unchanged.
- **The Expo dev server instead of the static export.** The export is the
  same bundle every run, with no Metro process to start or wait for.
- **An Android emulator in CI.** See [0011](0011-maestro-android-e2e.md):
  Android E2E runs locally for now.
- **Make web a real platform.** Rejected in SPEC.md §2. It would need
  persistent storage, a file system, photo picking and sharing, for users
  the app does not have.

## Consequences

- A fresh database per page load makes tests independent by construction.
- E2E cannot reach anything native: the file system, sharing, camera,
  notifications, the `.zip` backup. Those stay on the device
  ([docs/TESTING.md](../TESTING.md#known-gaps)).
- A green web build does not prove the native bundle builds. The SDK 57
  upgrade found a missing `punycode` that only the Android bundle needed;
  Metro shims Node built-ins on web, so the web export still built
  ([docs/upgrade-sdk-57.md](../upgrade-sdk-57.md)).
- `db/client.web.ts` must keep sharing the DDL in `db/ddl.ts` with the
  native client, or the harness tests a different schema
  ([0003](0003-hand-written-migrations.md)).
