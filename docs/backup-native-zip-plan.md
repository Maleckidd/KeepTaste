# Implementation plan: native ZIP on disk (`react-native-zip-archive`)

Status: **proposal / not started.** Supersedes the "needs a custom build" caveats in
`docs/backup-freeze-rootcause.md` and the deliberate-rejection note in SPEC.md §5.17.1.
Read those two first — this plan assumes their context.

## 1. Goal

Replace the pure-JS `jszip` pipeline (`utils/backupArchiveFs.ts`) with the native
`react-native-zip-archive` (RNZA), which packs a directory **natively, file by file,
off the JS thread** — so image bytes never enter the JS heap. This targets the two
intrinsic walls documented in `docs/backup-freeze-rootcause.md`:

- **Freeze** — `JSZip.generateAsync` is one uninterruptible block on the single JS
  thread; hundreds of ms on a photo-rich library.
- **OOM** — JSZip holds the whole archive plus its ~80 MB base64 string plus internal
  buffers on the JS heap at once; mid/low-RAM Android can OOM on 60 MB+ libraries.

## 2. The decision this plan rests on (read before anything else)

SPEC.md §5.17.1 **deliberately rejected** RNZA to keep the app runnable in Expo Go.
RNZA is a native module — **it does not exist in the Expo Go runtime.** Adopting it
means: `npx expo start` + Expo Go is no longer usable for any flow that touches
backup; development moves to a **custom dev client** (`expo-dev-client` + an EAS dev
build).

What softens the cost: native builds are **already part of the workflow.** `eas.json`
has a `development` profile (`developmentClient: true`) and a `production` profile
(app-bundle) that already ships to Play (`app.json` `versionCode: 6`). Expo Go is only
a development convenience here, not the distribution channel. So the real cost is
organizational (every dev needs the dev client installed once), not a change to what
ships.

**This is a product-direction decision and must be approved before implementation.**
It also requires reversing the explicit note in SPEC.md §5.17.1.

## 3. Key finding: native ZIP does NOT fix OOM for the SAF auto-backup (Level 1)

Verified statically against `node_modules/expo-file-system@18.0.12` (SDK 52). The
hoped-for pairing "RNZA packs natively + `expo-file-system/next` streams the result
into the SAF folder without base64" **does not work, because the SAF write cannot
avoid base64 in this version:**

1. **`expo-file-system/next` only understands `file:///`.** `File`/`Directory`
   constructors (`src/next/FileSystem.ts`) document `file:///` only and call
   `validatePath()`; the entire `next` module contains **zero** references to
   `content://`/SAF. Its streams (`writableStream()`) therefore cannot target a SAF
   tree URI.
2. **Classic `copyAsync`/`moveAsync` go the wrong way.** `RelocatingOptions`
   (`src/FileSystem.types.ts`): `from` may be a SAF URI, but `to` is typed strictly as
   a `file://` URI. The supported direction is **SAF → file://** (reading out of a
   folder), not **file:// → SAF** (writing into one).
3. **The only documented path of bytes into SAF is still base64** —
   `StorageAccessFramework.createFileAsync` + `writeAsStringAsync(base64)`. There is no
   append and no stream for `content://`.

RNZA itself also writes to filesystem paths, not `content://`, so it cannot hand the
archive straight to SAF either.

### What RNZA fixes, per backup path

| Path | Output target | Freeze fixed? | OOM fixed? |
|------|---------------|---------------|------------|
| Manual export (Level 0, share sheet) | `file://` (cache) | ✅ | ✅ fully — share a file path, no base64 |
| Safety snapshot before Replace | `file://` (cache) | ✅ | ✅ fully |
| Restore / unzip | `file://` | ✅ | ✅ fully — `unzip()` extracts to disk, no base64 |
| **Auto-backup to folder (Level 1, SAF)** | `content://` | ✅ | ⚠️ **partial** — see below |

**Level 1 nuance (still a net win, not a full cure):** RNZA still removes the *freeze*
(packing runs on a native thread) and the *packing-time* OOM (image bytes never touch
the JS heap). What remains is a single transient ~80 MB base64 string when the finished
cache file is read and `writeAsStringAsync`'d into SAF — versus today's simultaneous
"JSZip in-heap archive + base64 + buffers." Peak JS heap on this path drops roughly by
half, but the SAF base64 ceiling is not zeroed.

**Mitigating reality:** photos are already downscaled to 1280 px / JPEG 0.7 on pick
(`utils/imageDownscale.ts`, SPEC.md §5.16), so libraries rarely approach the OOM
threshold. RNZA alone is very likely sufficient for Level 1 in practice. True
zero-OOM streaming into SAF would need a native module with
`ContentResolver.openOutputStream` + chunked copy (`react-native-blob-util` or a small
custom Expo module) — kept as a **fallback if it ever bites**, not part of this plan's
core scope.

## 4. Permissions & Play Store impact: none

- **Android permissions — unchanged.** RNZA operates on app-scoped paths
  (`cacheDirectory`, `documentDirectory`); it declares no manifest permissions and does
  not touch shared/media storage. No `READ/WRITE_EXTERNAL_STORAGE`, no `READ_MEDIA_*`.
  SAF needs no storage permission by design. The `blockedPermissions` list in
  `app.json` would strip any stray injected storage permission anyway. Final permission
  set stays: `CAMERA` (+ whatever `expo-image-picker` contributes).
- **Play Console — unchanged.** The store artifact is already a native EAS app-bundle;
  switching local dev off Expo Go does not change it. No new permissions → no new Play
  declarations. No network code added → Data Safety form unchanged. `targetSdkVersion`
  stays 35.
- **Practical deltas only:** AAB grows by a small native lib (tens–hundreds of KB per
  ABI); dev workflow loses Expo Go; remember to bump `versionCode` on upload as usual.

**Definitive check (post-build):** confirm the merged `AndroidManifest.xml` after
prebuild (or `aapt dump permissions` on the AAB) shows no new permissions. Expected:
none.

## 5. Architecture changes

The pure layers are untouched — `utils/backupArchive.ts` (`buildBackupJson` /
`parseBackupJson`), `utils/backupMarkdown.ts`, `utils/backupAuto.ts`
(`parseKeepCount` / `backupsToPrune` / `isMirrorStale` / naming), `db/backup.ts`, and
the trigger state machine in `utils/backupTrigger.ts` all stay as-is. All change is in
the native wrapper `utils/backupArchiveFs.ts`.

### 5.1 Packing: staging directory instead of in-memory base64

Today `buildArchiveBase64()` reads each photo → base64 → `zip.file(b64)` →
`generateAsync('base64')`. Replace with: materialize the archive contents on disk, then
pack the directory natively.

```
<cache>/backup-staging/
  backup.json        ← writeAsStringAsync (text; no image bytes — paths are relative)
  recipes.md         ← writeAsStringAsync (text)
  images/<name>      ← FileSystem.copyAsync from documentDirectory (native copy, no JS heap)
→ zip(stagingDir, <cache>/keeptaste-backup.zip)   // RNZA, native, off-thread
→ delete stagingDir
```

- Preserve the existing logic from `buildArchiveBase64`: name dedupe (`used`,
  `relForPath`, `dup-N-<name>`), dropping references whose file is gone, and filtering
  out `backup_*` settings. It moves from "encode into the zip" to "copy into
  `staging/images/`".
- New cost: image set is briefly duplicated on disk (staging copy). Acceptable — it
  never touches the JS heap, which is the whole point.
- `backup.json` can be large (text), but it carries **relative** image paths, not
  bytes, so it stays small relative to the photos. `writeAsStringAsync` is fine.

### 5.2 Output paths

| Function | New behavior |
|----------|--------------|
| `exportBackupZip` | RNZA `zip(staging, cacheFile)` → `Sharing.shareAsync(cacheFile)`. base64 gone. |
| `writeSafetyBackup` | Same, to `keeptaste-backup-before-restore.zip` in cache. |
| `writeBackupToFolder` (SAF) | RNZA `zip(staging, cacheFile)`, then `readAsStringAsync(cacheFile, base64)` + `createFileAsync` + `writeAsStringAsync` into SAF. **Write-then-prune ordering and `backupsToPrune`/`localStamp`/`datedBackupName` are unchanged** — they are pure naming/retention logic. The base64 transient remains here (see §3); peak heap is still roughly halved vs today. |

### 5.3 Restore: native unzip

`loadBackupZip` / `commitBackupRestore`:

- The picked archive is a `content://` URI. Copy it into cache first (DocumentPicker
  with `copyToCacheDirectory`, or `FileSystem.copyAsync` SAF→file per §3 point 2 — this
  direction *is* supported), then `unzip(cacheZip, destDir)` natively. Image files land
  on disk in `destDir/images/` with no base64.
- Read `backup.json` / `recipes.md` as text from `destDir`.
- Move `images/*` into `documentDirectory` via native `copyAsync` (replaces the current
  `restoreImage` that writes each image from a base64 `zip.file(...).async('base64')`).
- This removes the current restore-side base64 too — a free win.

### 5.4 Remove the freeze workarounds

With packing off the JS thread, delete the scaffolding that only existed to hide the
freeze:

- The `setTimeout(0)` yield between photos in the packing loop.
- The `setTimeout(32)` "let the banner render" delay and the
  `InteractionManager.runAfterInteractions` gate in `runAutoBackupNow`.
- The backup banner can stay, but as a genuine progress indicator (RNZA exposes
  `subscribe()` with a progress fraction) rather than a freeze-curtain.
- Update `docs/backup-freeze-rootcause.md`: freeze and packing-OOM are solved by the
  build, not by workarounds; record that the SAF base64 ceiling is the one residual.

The dirty-flag → flush-on-background trigger model (`utils/backupTrigger.ts`) **may
stay** — it is sensible regardless — but it is no longer *forced* by an intrinsic
freeze. Note this in the spec so a future reader knows it is now a choice, not a
necessity.

## 6. Phased build order

| Phase | Work | Verifiable by |
|-------|------|---------------|
| **0. Infra** | `npx expo install expo-dev-client react-native-zip-archive`; `eas build --profile development`; update README/CLAUDE.md (dev client replaces Expo Go for backup work); reverse SPEC.md §5.17.1. | App launches in dev client. Merged manifest shows no new permissions (§4). |
| **1. Packing** | Staging-dir builder; RNZA `zip`. Keep dedupe/filter logic. | Device: export a photo-rich library; archive opens, round-trips through restore. |
| **2. Output paths** | Rewire `exportBackupZip`, `writeSafetyBackup`, `writeBackupToFolder`. | Level 0 share works; Level 1 writes a valid dated archive to the SAF folder; retention/pruning still correct. |
| **3. Restore** | Native `unzip`; move images natively. | Replace + Add restores on device, photos intact. |
| **4. Cleanup** | Remove freeze workarounds; progress via `subscribe()`; update `docs/backup-freeze-rootcause.md` + SPEC. | No on-screen stutter during a foreground export; banner shows real progress. |

## 7. Testing impact

- **Unit tests unaffected.** `__tests__/` covers pure logic only (`backupAuto`,
  `backupTrigger`, `backupArchive`, `restoreFullBackup`). RNZA, SAF, and file copies are
  native I/O inside `backupArchiveFs.ts`, which is already not unit-tested (per
  CLAUDE.md). `parseKeepCount`, `backupsToPrune`, `isMirrorStale`,
  `buildBackupJson`/`parseBackupJson`, and the trigger state machine stay green.
- **Add a Jest mock** for `react-native-zip-archive` under `__mocks__/` (mirroring
  `__mocks__/expo-image-manipulator.ts`) if any imported chain pulls it in, so
  `npm test` and `npx tsc --noEmit` stay clean.
- **Native verification is device-only** (dev build): packing, unzip, SAF write, and
  real peak-RAM on a large library cannot be exercised by Jest or the web build.

## 8. Risks & open questions

- **Expo Go loss** — the headline cost (§2). Needs sign-off.
- **RNZA compression granularity** — RNZA applies one compression mode to the whole
  archive; the current per-file `compression: 'STORE'` for JPEGs (skip pointless
  DEFLATE) is lost. Off-thread, so it no longer causes a freeze, but it wastes some
  native CPU re-DEFLATEing already-compressed JPEGs. Confirm acceptable; check whether
  the RNZA version exposes a STORE/no-compression option.
- **SAF base64 residual** (§3) — likely fine given image downscaling, but quantify peak
  RAM on a worst-case library before declaring OOM solved. Fallback path
  (`react-native-blob-util`/custom Expo module for streamed `file://`→SAF) is
  out-of-core-scope.
- **Staging disk usage** — transient duplication of the photo set during packing;
  ensure cleanup runs even on failure (try/finally).
- **Dev-build maintenance** — config-plugin/native-dependency upgrades now matter; EAS
  build minutes and onboarding friction for new contributors.

## 9. Recommendation

Proceed **only** if the Expo-Go-loss tradeoff (§2) is accepted. If so:

1. Adopt RNZA + the staging-dir packer for **all** paths — it fully fixes freeze
   everywhere and fully fixes OOM for the `file://` paths (Level 0, safety snapshot,
   restore).
2. Accept the **partial** Level-1/SAF improvement (freeze + packing-OOM gone, ~half
   peak heap, base64 handoff remains). Given downscaled photos this is very likely
   enough.
3. Keep streamed `file://`→SAF (non-expo native module) as a documented fallback, not
   initial scope.

If the Expo Go workflow is *not* something to give up, the smaller-blast-radius
alternative — already proposed in `docs/backup-freeze-rootcause.md` — is JSZip's
`generateInternalStream()` piped to an `expo-file-system/next` writable stream. But note
that also requires a dev build (the `next` API is stubbed in Expo Go), and per §3 it
*still* cannot stream into SAF — so it only helps the `file://` paths and does **not**
remove the freeze (DEFLATE still runs on the JS thread). RNZA strictly dominates it for
the freeze problem; the only reason to prefer it would be avoiding a new native
dependency, which is moot once a dev build is required either way.
