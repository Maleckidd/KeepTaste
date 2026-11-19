# 0004. The `.zip` archive is the backup of record; Markdown is its readable layer

- **Status:** Accepted
- **Date:** 2026-06-26 (the `.zip` backup, commit `7110ee1`; native packing
  with `react-native-zip-archive` replaced `jszip` on 2026-07-01, commit
  `893620d`; recorded retroactively on 2026-11-19)

## Context

The first backup was a single Markdown file
([SPEC.md §5.6](../../SPEC.md#56-full-app-backup-to-markdown)). It keeps
the "never locked in" promise: any text editor can read it, and it
round-trips through import. But it is not a copy of the library. It has no
photos, no shopping lists, no timestamps and no settings, so a user who
did export still lost their photos and lists on a new phone.

## Decision

"Export all data" writes one archive
([SPEC.md §5.17.1](../../SPEC.md#5171-archive-format-the-foundation)):

- `backup.json`: full fidelity, with a `schemaVersion`
  ([0003](0003-hand-written-migrations.md)). Restore reads this.
- `recipes.md`: the §5.6 Markdown, byte for byte. This is the human-readable
  layer, kept English-only so it stays importable.
- `images/`: every referenced photo.

Restore prefers `backup.json`. A `.zip` without it, or a plain `.md`, falls
back to the Markdown import, and a `.md` import stays supported. The pure
build and parse steps are in
[`utils/backupArchive.ts`](../../utils/backupArchive.ts), the native I/O in
[`utils/backupArchiveFs.ts`](../../utils/backupArchiveFs.ts).

The archive is packed natively, off the JS thread, by
`react-native-zip-archive`. The streamed write into a user-picked folder
goes through the local `safwriter` module
([`modules/safwriter/`](../../modules/safwriter/)).

## Alternatives considered

- **Keep Markdown as the only backup.** Rejected: it cannot carry photos,
  lists or timestamps without turning a readable format into a dump.
- **`backup.json` alone.** It would restore everything, but nobody can
  read it without the app, which breaks the escape-hatch promise
  ([SPEC.md §1](../../SPEC.md#1-product-goal)).
- **`jszip` (pure JavaScript), the first implementation.** Chosen at first
  so that backup kept working in Expo Go. It froze the single JS thread
  for hundreds of milliseconds on a photo-rich library and could run out
  of memory above about 60 MB, and neither problem can be fixed in
  JavaScript ([docs/backup-freeze-rootcause.md](../backup-freeze-rootcause.md),
  [docs/backup-native-zip-plan.md](../backup-native-zip-plan.md)).
- **`react-native-blob-util` for the folder write.** Tried first. It
  resolves primary-storage SAF document URIs to a made-up file path, writes
  to the wrong place and leaves the real file empty (SPEC.md §5.17.1).

## Consequences

- **Backup work needs a custom dev client.** The zip module does not exist
  in Expo Go, so anything that touches export, restore or auto-backup runs
  on an EAS `development` build ([CLAUDE.md](../../CLAUDE.md)). Expo Go is
  still fine for everything else.
- A restore is the most dangerous input the app accepts. `backup.json` is
  validated before anything is wiped, image paths must be flat names under
  `images/`, and a Replace writes a safety backup first
  ([SECURITY.md](../../SECURITY.md#entry-points)).
- Two formats must stay in step. The Markdown round-trip tests
  (`roundtrip.test.ts`, `parseBackupMarkdown.test.ts`) and the archive tests
  (`backupArchive.test.ts`, the integration `backupRoundTrip.test.ts`) guard
  them ([docs/TESTING.md](../TESTING.md)).
- Library size no longer caps a backup written to a folder: the photo bytes
  never enter the JS heap (SPEC.md §5.17.1).
