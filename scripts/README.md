# scripts/

One-off build/maintenance scripts. Not part of the app bundle.

Most of them build the Play Store marketing assets. **The map for that whole
pipeline — what it produces, what to run in which order, and which file to edit
when something needs to change — is [docs/store-assets.md](../docs/store-assets.md).**
Start there; this page is the per-script index.

## lib/ — shared by the store scripts

Nothing in here runs on its own.

| File | Owns |
|---|---|
| `lib/config.ts` | project facts: languages, paths, raw-capture geometry, `capture(lang, screen)` |
| `lib/brand.ts` | the marketing look: palette, font, warm background, device frame |
| `lib/render.ts` | HTML → PNG/JPEG via the cached Chrome for Testing (the only browser call) |
| `lib/cli.ts` | argument parsing: bare selector words plus `--flag value` |
| `lib/adb.sh` | device plumbing: tap, drag, pixel-polling, app lifecycle, demo status bar |
| `lib/screen.sh` | every screen coordinate, for a 1080×2400 phone with gesture nav |

Two rules worth keeping when adding a script here:

- Address a capture by **screen id** (`capture('en', '03-recipe-list')`), never
  by a literal filename. Screens are numbered in listing order, so inserting one
  renumbers the rest.
- Colours and type come from `lib/brand.ts`, positions stay in the script. The
  look is shared; the geometry is per-canvas.

## build-demo-backup.ts

Builds a ready-to-import **demo backup archive** from the curated content in
`assets/store/`:

- `assets/store/demo-import.md` / `demo-import.pl.md` — the demo recipes
  (4 cookbooks, 14 recipes) in the §5.6 Markdown format, English and Polish
- `assets/store/crops/*.png` — cookbook covers (`italian`, `dessert`, `dinner`,
  `breakfast`) and recipe photos (`pancakes`, `oatmeal`, `fried-eggs`), cropped
  from the wide originals in `assets/store/` by `crop-demo-photos.sh`

It reuses the app's own pure modules (`parseBackupMarkdown`, `buildBackupJson`)
so the output is byte-for-byte the format the mobile import expects
(SPEC.md §5.17.1): a `.zip` containing `backup.json` + `recipes.md` + `images/`,
plus a sample shopping list.

Run from the repo root:

```bash
bash scripts/crop-demo-photos.sh              # photos first
npx --yes tsx scripts/build-demo-backup.ts    # or: ... build-demo-backup.ts pl
```

Output: **`assets/store/keeptaste-demo.zip`** (and `keeptaste-demo-pl.zip`) — a
complete library a user can restore via Settings → Restore backup (recipes,
photos, and a shopping list). The Polish archive carries translated cookbook
names, recipes and shopping list, for the Polish store listing.

## crop-demo-photos.sh

Crops the staged food photos in `assets/store/` down to the dish, into
`assets/store/crops/`. The originals are one breakfast table shot three times
with the dish swapped, so uncropped they make three recipe cards look identical
— and they carry Polish product packaging that has no business in an English
store screenshot. macOS only (`sips`).

## build-store-screenshots.ts

Renders the Play Store marketing frames from the raw captures in
`assets/app/` into `assets/store/play/<form>/<lang>/`, covering all three
listing slots — `phone` (1080×1920), `tablet7` (1200×1920) and `tablet10`
(1600×2560) — in English and Polish. Copy lives in
`assets/store/screenshot-captions.json`. Full pipeline, including how the raw
captures are shot: **[docs/store-screenshots.md](../docs/store-screenshots.md)**.

```bash
npx --yes tsx scripts/build-store-screenshots.ts               # all 36 frames
npx --yes tsx scripts/build-store-screenshots.ts pl tablet10   # one of each
```

## build-social-preview.ts

Renders the **GitHub social preview** (1280×640), the card shown when a link to
the repository is shared, in the same look as the feature graphic. It shows
the English home-screen capture. Output: **`assets/github/social-preview.png`**
(tracked). GitHub has no API for it: upload it by hand in Settings → General →
Social preview.

```bash
npx --yes tsx scripts/build-social-preview.ts
```

## build-feature-graphic.ts

Renders the 1024×500 feature graphic — the banner Play shows above the listing
when there is a promo video — in both languages, reusing the screenshot frames'
palette and type so the listing reads as one set.

```bash
npx --yes tsx scripts/build-feature-graphic.ts        # both languages
npx --yes tsx scripts/build-feature-graphic.ts pl     # one
```

## reset-demo-library.sh / record-promo-clips.sh / build-promo-video.ts

The Play Store **promo video** pipeline — a ~33 s landscape video built from
real screen recordings composited into the same brand frame as the still
screenshots. Full procedure, including the emulator flags it depends on:
**[docs/store-promo-video.md](../docs/store-promo-video.md)**.

```bash
bash scripts/reset-demo-library.sh en    # clear + restore the demo .zip, demo status bar
bash scripts/record-promo-clips.sh en    # four screen takes → assets/store/promo/raw/en/
npx --yes tsx scripts/build-promo-video.ts    # → assets/store/promo/keeptaste-promo-{en,pl}.mp4
```

`reset-demo-library.sh` is also the fastest way to put an emulator into the
curated demo state for **screenshots**, not just video. Both adb scripts take an
optional device serial as their second argument and refuse to run against one
that is not connected — with two emulators up, letting adb pick is how a take
gets recorded on the one that was never reset.

Storyboard and copy live in `assets/store/promo-script.json`. Music is not in
the repo — drop a track you have the rights to at `assets/store/promo/music.mp3`
and the build picks it up, trims it to length from the start of the song and
normalises the level.

### Generated / ignored artifacts

These are products of a build and are **git-ignored** (regenerate as needed):

| File | What it is | How to regenerate |
|---|---|---|
| `assets/store/keeptaste-demo.zip` | Demo backup for import/onboarding | `npx tsx scripts/build-demo-backup.ts` |
| `assets/store/keeptaste-demo-pl.zip` | Polish demo backup (store screenshots) | `npx tsx scripts/build-demo-backup.ts pl` |
| `assets/store/crops/` | Dish-cropped demo photos | `bash scripts/crop-demo-photos.sh` |
| `assets/store/play/` | Rendered Play Store frames and feature graphics | `npx tsx scripts/build-store-screenshots.ts`, `... build-feature-graphic.ts` |
| `assets/store/promo/raw/` | Raw promo screen takes | `bash scripts/record-promo-clips.sh en` (and `pl`) |
| `assets/store/promo/*.mp4` | Rendered promo video | `npx tsx scripts/build-promo-video.ts` |
| `keeptaste.apk` | Local Android build output | `eas build -p android --profile preview --local --output ./keeptaste.apk` (needs `ANDROID_HOME` set) |
| `eas-build.log` | Transient EAS build log | produced by the build above |
