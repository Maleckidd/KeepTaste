# 0008. Stay on `expo-file-system/legacy` for now

- **Status:** Accepted
- **Date:** 2026-08-02 (the Expo SDK 57 upgrade, commit `bcf3bfd`; recorded
  retroactively on 2026-11-19)

## Context

Expo SDK 54 put a new `File` / `Directory` API at the bare
`expo-file-system` specifier and moved the old function API
(`documentDirectory`, `copyAsync`, `readAsStringAsync`,
`StorageAccessFramework`, …) behind `expo-file-system/legacy`. The app
jumped from SDK 52 straight to 57, so its file-system imports would have
silently pointed at a different API. SDK 57 still exports the legacy
surface, `StorageAccessFramework` included
([docs/upgrade-sdk-57.md §3.2](../upgrade-sdk-57.md)).

## Decision

Keep the legacy API and change only the import path. Every source file
that touches `expo-file-system` imports `expo-file-system/legacy`:
[`app/settings.tsx`](../../app/settings.tsx),
[`utils/imageStorage.ts`](../../utils/imageStorage.ts),
[`utils/backupArchiveFs.ts`](../../utils/backupArchiveFs.ts) and
[`utils/cookbookPdf.ts`](../../utils/cookbookPdf.ts). The Jest mapper maps
both specifiers to the same stub
([`jest.config.js`](../../jest.config.js)). Porting to the new API is a
separate piece of work ([CLAUDE.md](../../CLAUDE.md)).

## Alternatives considered

- **Port to `File` / `Directory` as part of the SDK upgrade.** Rejected:
  mixing an API migration into an SDK jump makes a failure impossible to
  bisect (docs/upgrade-sdk-57.md §3.2). The upgrade already carried the
  New Architecture, React 19 and edge-to-edge.
- **Mix the two APIs, new code on the new one.** Rejected: two file-system
  APIs side by side, with different URI handling, in the code that writes
  backups is a likely source of bugs. CLAUDE.md says not to mix them.

## Consequences

- The legacy API cannot stream or append to a `content://` URI. Writing a
  large backup into a Storage Access Framework folder therefore goes
  through the local `safwriter` native module instead
  ([SPEC.md §5.17.1](../../SPEC.md#5171-archive-format-the-foundation),
  [0004](0004-zip-backup-of-record.md)).
- Importing from the bare `expo-file-system` gets the other API; a new
  file must use `/legacy`. If it adds a new specifier, `jest.config.js`
  must still map it, or the tests load the real native module under Node.
- Each SDK upgrade has to check that `/legacy` is still exported. When the
  port happens, it should be its own change, verified on a device, with
  the backup flows first.
