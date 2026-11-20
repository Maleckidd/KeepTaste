# 0001. Local-only and offline: no backend, no accounts, no sync

- **Status:** Accepted
- **Date:** 2026-06-10 (the first commit, `874a292`; recorded retroactively
  on 2026-11-19)

## Context

KeepTaste is a personal recipe manager. The data is small, private, and
used in places with poor reception: a kitchen, a shop basement. A backend
would bring accounts, hosting costs, an availability promise, and a store
of other people's data to protect, for an app that one person builds and
that has no revenue.

## Decision

All data lives on the device, in SQLite (`expo-sqlite`) and the app's
documents directory. There is no KeepTaste server, no account, no
analytics and no sync ([SPEC.md §1](../../SPEC.md#1-product-goal),
[§7](../../SPEC.md#7-out-of-scope-deliberate-decisions)).

The user is never locked in: the library exports to Markdown that any text
editor can read, and the `.zip` backup restores it 1:1 on another phone
([0004](0004-zip-backup-of-record.md)). "Online backup" means writing a
file to a place the user picked (the share sheet, or a cloud-synced
folder); the app never talks to a cloud provider
([SPEC.md §5.17](../../SPEC.md#517-complete-backup-archive-zip-and-online-backup)).

The only intentional network request is the one the user asks for: link
import fetches that page straight from the recipe site
([`utils/recipeImportFetch.ts`](../../utils/recipeImportFetch.ts)). AI
transcription is a hand-off to the user's own AI app; KeepTaste makes no
AI call ([`utils/aiTranscribe.ts`](../../utils/aiTranscribe.ts)). Timer
alarms are local scheduled notifications with no push token (SPEC.md
§5.21).

## Alternatives considered

- **A backend with accounts and two-way sync.** Rejected for complexity,
  running cost and privacy (SPEC.md §7). It would also make conflict
  resolution and account recovery part of the product.
- **Direct Google Drive / Dropbox API integration.** Rejected: OAuth app
  verification with each provider, sign-in inside the app (which breaks
  "no accounts"), and little gain over the system share sheet (SPEC.md §7,
  §5.17.3).
- **In-app AI or server-side parsing for recipe import.** Rejected: it
  needs a network call per import and a paid API, and it breaks the
  local-first promise. Import stays deterministic and on-device (SPEC.md
  §5.15, §7).

## Consequences

- The attack surface is content, not a server: pages the user imports,
  shared text, backup files and links. That is the whole threat model in
  [SECURITY.md](../../SECURITY.md#threat-model).
- **Backup is the user's job.** A user who never exports and never turns on
  auto-backup loses everything with the phone
  ([SPEC.md §9](../../SPEC.md#9-known-limitations-and-risks)).
- Features that need a shared server are out: sharing recipes between
  users, push notifications, multi-device sync (SPEC.md §7). Shares go out
  as text or PDF through the system share sheet instead.
- Automatic backup cannot write to Google Drive, because the Storage Access
  Framework refuses app writes into Drive folders. Drive is reachable only
  through the share sheet (SPEC.md §5.17.3, §9).
