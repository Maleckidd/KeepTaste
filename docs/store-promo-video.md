# Play Store promo video

A ~33 s landscape video for the promo-video slot on the Play listing, in
English and Polish. It is a hybrid: real screen recordings of the app driven by
`adb`, composited into the same brand frame as the still store screenshots.

This is one stage of the store-asset pipeline; **[store-assets.md](store-assets.md)**
is the map of all of it, including how the scripts are structured and which file
to edit for a given change.

| Where | What | Tracked? |
|---|---|---|
| `assets/store/promo-script.json` | storyboard: scene order, clip in/out points, copy | yes — source |
| `assets/store/promo/raw/{en,pl}/*.webm` | raw screen takes | no — re-shoot with the script |
| `assets/store/promo/keeptaste-promo-{en,pl}.mp4` | the finished video | no — rebuild |
| `assets/store/promo/music.mp3` | optional music bed, picked up automatically | no — see [Music](#4-music) |

Play links the promo video **from YouTube**, so nothing here uploads: the mp4
goes to YouTube (unlisted is fine), and the watch URL goes into Play Console →
Grow → Store presence → Main store listing → Video, per language. That review is
separate from the binary review and needs no new `versionCode`.

Output is 1920×1080 at 30 fps. Landscape on purpose — the slot sits above the
screenshots and a portrait video gets pillarboxed there.

---

## 0. Emulator

A real build on an emulator, not Expo Go — the demo library is restored from a
`.zip`, which needs `react-native-zip-archive`.

**Start the emulator with `-gpu host`.** This is the difference between a usable
video and a slideshow:

```bash
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone -gpu host -no-snapshot-load
```

The recording is only ever as smooth as the emulator renders. With the AVD
default (`hw.gpu.mode=auto`) this machine captured about 6 fps; with `-gpu host`
it holds around 20. The build script resamples to a constant 30 either way, so a
slow emulator does not fail — it just produces visibly stuttering scrolls.

Two things that do **not** work, so nobody rediscovers them:

- `adb shell screenrecord` captures a single frame here and writes an mp4 with
  no timing at all (`recorded 1 frames in 5 seconds`). The scripts use the
  emulator console recorder, `adb emu screenrecord`, which writes VP9 `.webm`
  straight to the host.
- The app is a release build, so it is not debuggable: no `run-as`, no `adb
  root`, no pushing a database in. The library has to be restored through the
  app's own UI, which is what `reset-demo-library.sh` automates.

## 1. Demo library

Build the archives first if they are not around
(`scripts/build-demo-backup.ts` — see [store-screenshots.md](store-screenshots.md)),
then:

```bash
bash scripts/reset-demo-library.sh en
bash scripts/reset-demo-library.sh pl
```

This clears app data, restores the demo `.zip` through Settings → Restore
backup, sets Polish where relevant, and puts the status bar in demo mode
(9:30, full battery). It drives the UI blind by coordinate, so it ends by
**verifying** that the cookbook grid is actually full and exits non-zero if not
— a failed restore otherwise leaves the first-launch seed content, which is one
cookbook called "Breakfasts" and looks close enough to the demo library to shoot
a whole video against by mistake.

The status bar keeps a VPN shield and a wifi warning that demo mode will not
hide. That does not matter: the renderer crops the status bar off, along with
the gesture bar at the bottom.

## 2. Takes

```bash
bash scripts/record-promo-clips.sh en
bash scripts/record-promo-clips.sh pl
```

Four takes per language, into `assets/store/promo/raw/<lang>/`:

| Take | What happens |
|---|---|
| `library` | home cookbook grid → into Breakfasts |
| `import` | the cookbook's "+" → new-recipe form → import sheet → mode switched to "Paste text" |
| `recipe` | the recipe, scrolled → add-to-list sheet → uncheck the two group headers → add → confirmation snackbar |
| `shopping` | the filled list, three items ticked into the cart |

The `import` take deliberately imports nothing. A link import fetches over the
network and a photo import opens the system picker, and neither belongs in a
take that has to come out the same way every time; switching the sheet's mode
names all four ways in and makes the sheet grow, which is enough motion for a
five-second scene.

The script cold-starts the app once, waits for the home screen by polling for
the "+" button's pixel, and then navigates between takes inside the running
app. Every fixed `sleep` that was supposed to cover a cold start turned into a
mis-timed take at some point — a cold start on a loaded host can take 20 s, and
taps sent into the launch splash land on whatever appears next.

It also opens a cookbook once before recording, to burn the one-time swipe hint
(`swipeHintSeen`, `app/cookbook/[id].tsx`). That hint peeks the red Delete/Edit
actions on the first recipe, and `pm clear` re-arms it every reset.

**Watch the takes before building.** The coordinates live in
`scripts/lib/screen.sh` — one file, shared with `reset-demo-library.sh`, and its
header explains how to re-measure one. They are layout positions, so they
survive the language switch, but any UI change moves them and a missed tap is
only visible in the recording. A quick contact sheet:

```bash
ffmpeg -i assets/store/promo/raw/en/recipe.webm -vf "fps=1,scale=130:-1,tile=18x1" -frames:v 1 /tmp/sheet.png
```

## 3. Build

```bash
npx --yes tsx scripts/build-promo-video.ts               # both languages
npx --yes tsx scripts/build-promo-video.ts pl            # one
npx --yes tsx scripts/build-promo-video.ts en --music path/to/track.mp3
npx --yes tsx scripts/build-promo-video.ts --music-start 42   # from later in the track
```

Scene order, in/out points and copy live in
`assets/store/promo-script.json`; edit it and re-run, no re-recording needed.
The copy deliberately tracks `assets/store/screenshot-captions.json` so the
video and the screenshots read as one listing.

Backgrounds and the title/end cards are rendered by the same headless Chrome
that `build-store-screenshots.ts` uses, so there is nothing extra to install.
ffmpeg masks each take into the rounded device frame, crossfades the scenes and
mixes the audio.

If a take comes out shorter than the storyboard asks for, the build fails with
the actual length rather than silently freezing on the last frame.

## 4. Music

Not included in the repo, and not downloaded by these scripts — the track has to
be one you have the right to use on a store listing and on YouTube. Drop it at
`assets/store/promo/music.mp3` and the build picks it up with no flag, or pass
`--music <file>`.

The build takes the excerpt it needs from the **start** of the track, skipping
whatever digital silence the encoder left at the head (this is measured, not
assumed — the current track has 0.56 s). To use a later section instead, say a
chorus rather than an intro:

```bash
npx --yes tsx scripts/build-promo-video.ts --music-start 42
```

The level is measured rather than fixed: the excerpt is normalised to −17 LUFS
integrated, with the gain pulled back if that would push true peak above
−1.5 dBFS, then faded up over 1.2 s and down over the last 2 s. A fixed
percentage would make the result depend on how hot the dropped-in track happened
to be mastered, and quiet is the failure mode nobody catches — YouTube turns
loud audio down but never turns quiet audio up. Gating means the finished file
measures a little above the target (currently −15.9 LUFS, peak −1.5 dBFS), which
sits right where YouTube's own normalisation wants it.

The build fails rather than producing a short audio track if the excerpt would
run past the end of the song.

Sources whose licences suit a store promo, in rough order of least hassle:

- **YouTube Audio Library** (studio.youtube.com → Audio library) — free, and
  already cleared for the YouTube upload that Play will link to. Prefer tracks
  marked as not requiring attribution.
- **Pixabay Music** — Content Licence, no attribution required.
- **Free Music Archive** / **ccMixter** — good material, but check each track:
  many are CC-BY (attribution required) or CC-NC, and a store listing is
  commercial use.

Keep it short and unobtrusive; there is no voiceover, and the video is 33 s.

## 5. Upload

1. Upload the mp4 to YouTube. Unlisted is fine — Play only needs the URL.
   No ads on the video, and no "watch more" end screens; Play rejects promo
   videos that behave like ads for something else.
2. Play Console → Grow → Store presence → Main store listing → **Video**, paste
   the watch URL. Do it per language: the English listing gets
   `keeptaste-promo-en`, the Polish one `keeptaste-promo-pl`.

## Known gaps

- The recordings run at whatever the emulator manages (~20 fps) and are
  resampled to 30 by repeating frames, so scrolls are slightly steppy. Motion
  interpolation was tried and looks worse — it warps small text mid-scroll. A
  faster host, or a physical device, is the real fix.
- There is no voiceover and no captions burned in. The headlines carry the
  message, which is why they are the same copy as the store screenshots.
- The video shows a phone. There is no tablet cut, for the same reason the
  tablet screenshots are thin: the app has no tablet-specific layout.
