# 0007. The Android compile/target SDK is not pinned

- **Status:** Accepted
- **Date:** 2026-08-02 (the Expo SDK 57 upgrade, commit `bcf3bfd`; recorded
  retroactively on 2026-11-19)

## Context

On 2026-06-13 the app pinned `compileSdkVersion` / `targetSdkVersion` 35
through `expo-build-properties` in `app.json` (commit `bbf743a`). The pin
then stayed at 35 while the platform moved on. Google Play requires target
API 36, and an app still targeting 35 after 31 August 2026 can no longer
ship updates. Reaching 36 needed a whole Expo SDK upgrade (52 → 57), not a
number change: React Native 0.76 could not build against API 36, and API
36 forces edge-to-edge
([docs/upgrade-sdk-57.md](../upgrade-sdk-57.md)).

## Decision

No explicit SDK pin. `expo-build-properties` was removed entirely, plugin
entry and dependency, and `compileSdk` / `targetSdk` come from the Expo SDK
default (36 on SDK 57) through React Native's version catalog
([SPEC.md §2](../../SPEC.md#2-platform-and-stack),
[CLAUDE.md](../../CLAUDE.md)). An explicit pin is what let the target go
stale; following the SDK default is the behaviour wanted on the next
upgrade too (docs/upgrade-sdk-57.md §14, "Found during execution").

## Alternatives considered

- **Keep the pin and bump it to 36.** The upgrade plan rejected this
  ("removed, not bumped", docs/upgrade-sdk-57.md §1). It works until the
  next Play deadline and then fails the same way, because nothing reminds
  anyone to move a pin.

## Consequences

- The target API moves only with an Expo SDK upgrade, and that upgrade
  owns the Play requirement. Each SDK upgrade has to check the Play target
  deadline and the behaviour changes the new API forces (edge-to-edge did
  for 36).
- Re-adding a pin looks like harmless hardening. CLAUDE.md says not to,
  and this ADR records why.
- Every Play upload still bumps `android.versionCode` in `app.json`; that
  is unrelated to the SDK level and stays manual.
