# Root cause: freezing during auto-backup export

## Status: RESOLVED by the native ZIP migration

The two walls below — the **freeze** and the **packing-time OOM** — were intrinsic
to a pure-JS packer (`jszip`) on React Native's single thread and could not be cured
in the Expo Go runtime. They are now **solved by the build:** packing moved to
`react-native-zip-archive` (RNZA), which zips a staging directory **natively, off the
JS thread**, so image bytes never enter the JS heap (`utils/backupArchiveFs.ts`,
SPEC.md §5.17.1, plan in `docs/backup-native-zip-plan.md`). Cost: RNZA is a native
module, so backup development now requires a **custom dev client** (not Expo Go).

- **Freeze — gone on every path.** Packing runs on a native thread; the JS thread is
  never blocked. The old workarounds (`setTimeout(0)` per-photo yield, the
  `setTimeout(32)` banner delay, the `InteractionManager.runAfterInteractions` gate)
  are removed. The dirty-flag/flush-on-background trigger is **kept by choice** (one
  clean backup per session), not forced by a freeze.
- **OOM — gone on the `file://` paths** (manual export, safety snapshot, restore):
  no base64, photos `copyAsync`'d natively to/from disk.
- **OOM — now gone on the SAF auto-backup path too** (Level 1). expo-file-system SDK 52
  has no stream/append for `content://`, so we no longer read the finished cache `.zip`
  into one base64 string. Instead `writeBackupToFolder` (`utils/backupArchiveFs.ts`) hands
  the cache file to the local **`safwriter` Expo module** (`modules/safwriter/`), whose
  `copyFileToSaf` opens the SAF document URI via `ContentResolver.openOutputStream` and
  copies the file on a 1 MiB native buffer. No base64, no whole-file JS allocation — peak
  heap is constant regardless of archive size, so library size no longer caps a SAF
  backup. This is the "streamed `file://`→SAF native module" the earlier revision listed
  as an out-of-scope fallback; it is now implemented.

  **Why a custom module and not `react-native-blob-util`** (the first attempt): blob-util's
  `writeStream`/`cp` route through `normalizePath` → `PathResolver.getRealPathFromURI`,
  which for a **primary-storage** SAF document URI fabricates a bogus real path
  (`getExternalFilesDir()/…`) instead of returning `null`. A non-null path makes blob-util
  take its `FileOutputStream` branch and write to the wrong place, so the real SAF file
  stayed **0 bytes**. It only reaches the correct `openOutputStream` branch for non-primary
  volumes. The custom module calls `openOutputStream` directly and has no such ambiguity.
  Cost: a local native module (still dev-build-only; no new Android permissions — it writes
  to a SAF URI the user already granted).

The original analysis below is retained for history — it explains *why* the pure-JS
approach hit these walls and why hiding the freeze was the right interim strategy.

## Problem

The app froze for hundreds of milliseconds after saving a recipe or cookbook.
React Native has a single JS thread. All JS — logic, React re-renders, event
handling — queues on it sequentially. Anything blocking that thread for >16ms
drops a frame; >100ms is perceptible as a freeze.

`zip.generateAsync` is pure JS with no yield to the event loop. JSZip processes
data through an internal generator but does not release control between frames —
it runs to completion in one continuous tick. With a library containing several
large photos this means hundreds of milliseconds of uninterrupted blocking.

Before the fix there was an additional problem: **DEFLATE on already-compressed
files**. JPEG and PNG are compressed by nature; running DEFLATE over them again
achieves ~0% size reduction while paying maximum CPU cost (the algorithm scans
every byte looking for patterns that aren't there).

## Call stack

```
scheduleAutoBackup()
  └─ setTimeout 2.5s (debounce)
       └─ runAutoBackupNow()
            └─ InteractionManager.runAfterInteractions()   wait for idle UI
                 └─ buildArchiveBase64()
                      ├─ readAsStringAsync() × N           async native, fine
                      ├─ zip.file(img, b64, DEFLATE)       CPU: b64→binary decode
                      └─ zip.generateAsync()               CPU: DEFLATE + binary→b64
                           ↑
                           blocks the JS thread for the entire duration
```

## Fixes applied

| Change | Effect |
|--------|--------|
| `compression: 'STORE'` for images | Skips DEFLATE; JSZip just copies bytes. Largest single speedup. Text files (`backup.json`, `recipes.md`) still use DEFLATE where it actually compresses. |
| `InteractionManager.runAfterInteractions` | Backup doesn't start mid-navigation or mid-animation. |
| `setTimeout(32)` before heavy work | Gives the UI two frames to render the banner before the thread is occupied. |
| Backup banner (`ActivityIndicator`) | User sees feedback instead of an unresponsive app. Banner animation runs on the native thread and survives JS freeze. |

## What remains unfixable without a custom build

Moving `zip.generateAsync` off the JS thread (web worker, native thread) is not
possible in Expo Go. The fixes above reduce the freeze duration significantly but
cannot eliminate it entirely for large libraries.

## Resolution: hide the freeze instead of fighting it

Since the freeze is intrinsic, the strategy changed from "make the build fast" to
"run the build when the user isn't looking." The trigger model (`utils/backupTrigger.ts`)
is now dirty-flag + flush rather than an immediate debounced write:

| Change | Effect |
|--------|--------|
| **Mark dirty, don't build** — a recipe/cookbook change only sets a dirty flag. | No heavy work runs *while the user edits*. Editing stays smooth. |
| **Flush on `AppState` background only** (`app/_layout.tsx`) — the single trigger. | The freeze happens after the user has left the app, so it's invisible. The OS background grace window covers the write. iOS transient `inactive` is ignored so a notification-shade pull doesn't freeze a visible app. |
| **No foreground timer.** | The only thing that runs the build is leaving the app, so there is *never* an on-screen freeze — not even during a long batch-entry session. A session that never backgrounds just mirrors on its next exit. |
| **`setTimeout(0)` yield between photos** in `buildArchiveBase64`. | Cheap; keeps the leave animation smoother during the background build. The final `generateAsync` is still one block. |

**Why a long foreground session is still safe:** every edit is already committed to
SQLite synchronously, so nothing is lost — the *external* mirror just lags until the
next time the app backgrounds. A crash mid-session (which skips backgrounding) is
healed on the next launch by `maybeBackupOnLaunch`, which re-arms a backup when the
newest data change is newer than the last export (`isMirrorStale`).

**Why a truncated write is safe:** `writeBackupToFolder` writes the new dated archive
*before* pruning old ones (write-then-prune), so a flush killed mid-write leaves the
previous good archive untouched; the next successful flush replaces the partial file.

## Related wall: out-of-memory on large libraries (60MB+)

The same single-thread, no-streaming constraint produces a second failure mode for
big libraries. `buildArchiveBase64` builds the *entire* zip in memory and returns it
as one base64 string (`zip.generateAsync({ type: 'base64' })`); `writeAsStringAsync`
is then the only way to persist it (the classic `expo-file-system` API has no append
or stream write for SAF/cache files). base64 inflates bytes by ~33%, so a 60MB backup
means an ~80MB JS string plus JSZip's internal buffers live on the heap at once. On
mid/low-RAM Android (Hermes) that can OOM, and the write throws.

**Why we can't stream it away in Expo Go.** The streaming API that would fix this —
`expo-file-system/next` `File`/writable streams — is *stubbed out* in Expo Go
(`expo-file-system/build/next/ExpoGoFileSystemNextStub`: the classes are empty). A real
streamed/chunked write requires a custom dev build. KeepTaste deliberately targets Expo
Go (CLAUDE.md), so the OOM ceiling stands until that constraint changes.

**What we did instead (mitigations, not a cure):**

| Change | Effect |
|--------|--------|
| Detect Google Drive folder URIs up front (`isGoogleDriveFolderUri`) | Drive grants the SAF picker but rejects writes; we now reject it *before* building the archive, so a 60MB build isn't wasted on a guaranteed failure. |
| Honest, size-aware failure messages | The auto-backup folder picker no longer blames Google Drive for *every* write failure. An on-device folder that fails shows `settings.backupWriteFailedMessage` (folder read-only / library too large); only a real Drive URI shows the Drive message. Manual "Export all data" failure now hints at library size too. |

**Proper fix (needs a dev build):** move off `JSZip.generateAsync('base64')` to a
streamed write — JSZip's `generateInternalStream()` emits `uint8array` chunks; pipe
them into an `expo-file-system/next` writable stream so the full archive is never
resident in the JS heap. Out of scope while we ship on Expo Go.
