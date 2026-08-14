# Play Store screenshots

The Play listing has three separate screenshot slots — phone, 7-inch tablet,
10-inch tablet — and this pipeline fills all three, in English and Polish.

This is one stage of the store-asset pipeline; **[store-assets.md](store-assets.md)**
is the map of all of it, including how the scripts are structured and which file
to edit for a given change.

The listing's promo-video slot has its own pipeline, which reuses this demo
library and this look: **[store-promo-video.md](store-promo-video.md)**. Its
`scripts/reset-demo-library.sh` also automates the setup in §1–2 below.

| Where | What | Tracked? |
|---|---|---|
| `assets/app/{en,pl}/*.jpg` | raw 1080×2400 phone captures | yes — source, and the README uses `en/` |
| `assets/app/tablet/{en,pl}/*.jpg` | raw 1600×2560 tablet captures | yes — source |
| `assets/store/play/<form>/<lang>/*.jpg` | rendered marketing frames | no — git-ignored, rebuild from the raws |

Rendered forms:

| Form | Canvas | From | Play slot |
|---|---|---|---|
| `phone` | 1080×1920 | `assets/app/<lang>/` | Phone screenshots |
| `tablet7` | 1200×1920 | `assets/app/tablet/<lang>/` | 7-inch tablet screenshots |
| `tablet10` | 1600×2560 | `assets/app/tablet/<lang>/` | 10-inch tablet screenshots |

Both tablet slots are rendered from the same tablet captures: a 7" and a 10"
device run this app at the same 800dp width, so the difference between the
slots is canvas size, not app UI. **Do not fill a tablet slot by upscaling a
phone screenshot** — Play accepts it dimensionally, but a scaled-up phone
layout is precisely what those slots exist to show is *not* happening.

Nothing here uploads automatically. `eas submit` ships the AAB only; listing
images are replaced by hand in **Play Console → Grow → Store presence → Main
store listing**, per language, in each of the three screenshot sections. That
review is separate from the binary review and needs neither a new
`versionCode` nor a new build.

---

## 1. Demo library

Screenshots are shot against the curated demo library, not real data.

```bash
bash scripts/crop-demo-photos.sh                    # assets/store/crops/
npx --yes tsx scripts/build-demo-backup.ts          # keeptaste-demo.zip     (English)
npx --yes tsx scripts/build-demo-backup.ts pl       # keeptaste-demo-pl.zip  (Polish)
```

The Polish archive is a full translation of the same 14 recipes
(`assets/store/demo-import.pl.md`), so a Polish listing never shows English
recipe titles. Both zips and the crops are git-ignored build products.

The crops matter, for two separate reasons.

The three breakfast photos are one staged table shot three times with the dish
swapped, with Polish product packaging in the background. Cropping to the plate
makes the three recipe cards look like three different meals and keeps stray
Polish labels out of the English set. Crop tightly enough: `03-recipe` shows
this photo as a full-width hero, so a label that survives the crop is legible
at full size in the English screenshots — "JAJKA EKOLOGICZNE" on the egg carton
reached the store this way once.

The Italian Kitchen cover is staged with four real brands (Monini, Barilla,
De Cecco, Rummo), all with lettering the generator mangled. It is cropped to
the loose ingredients in the middle of the table, which is clear of all four.
**Check any replacement cover for legible brands and text before shipping it** —
a store listing carrying someone else's trademark is an IP complaint waiting to
happen, and garbled packaging text reads as a cheap fake either way.

A cover also has to match what is *inside* the cookbook. Weekday Dinners holds
tomato soup, baked salmon, chicken in mushroom sauce and red lentil dal; it
shipped for a while over a photo of a burger, fries and mac & cheese in an
American diner. No crop fixes that — the food itself is the mismatch.

## 2. Capture

The app must be a real build — the restore flow needs `react-native-zip-archive`,
which Expo Go does not have.

**Phone:** an emulator at 1080×2400, light theme.
**Tablet:** any emulator resized to a tablet, e.g. the Pixel Tablet AVD:

```bash
adb -s <tablet> shell wm size 1600x2560
adb -s <tablet> shell wm density 320      # 800dp wide
# afterwards: adb shell wm size reset && adb shell wm density reset
```

Common setup for either:

```bash
adb shell pm clear com.damianmalecki.keeptaste
adb push assets/store/keeptaste-demo.zip /sdcard/Download/
adb shell cmd uimode night no
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0930
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e mobile hide
```

Then, in the app: Settings → Restore backup → Downloads → the demo `.zip`. On a
freshly cleared install the library is still a pristine seed, so the restore
runs without a confirmation dialog. For the Polish set, restore the `-pl`
archive and then set Settings → Language → Polski.

`scripts/reset-demo-library.sh` automates all of that, but its coordinates
(`scripts/lib/screen.sh`) are calibrated for a 1080x2400 phone with **gesture
navigation** and a file picker in **list** view. Two things break it on a fresh
emulator, and both fail quietly:

- *Three-button navigation* lifts the tab bar above the pixel the script polls
  to detect the home screen, so it gives up with "the app never reached the
  home screen". Fix: `adb shell cmd overlay enable
  com.android.internal.systemui.navbar.gestural`.
- *A picker in grid view* puts the archive somewhere other than the first row,
  so the blind tap selects nothing and the script stops at "restore did not
  take". Fix: open the picker by hand once and switch it to list view, or drive
  the restore manually.

For a tablet, run the restore at phone geometry (where these coordinates hold),
then switch to `wm size 1600x2560` / `wm density 320` before capturing — the
database survives the resize.

Capture each screen with `adb exec-out screencap -p > out.png` and convert:

```bash
sips -s format jpeg -s formatOptions 92 out.png --out assets/app/en/01-cookbooks.jpg
```

The six screens, in upload order:

| File | Screen |
|---|---|
| `01-cookbooks` | home — cookbook grid |
| `02-import` | new-recipe form → **Import**, sheet open on "From link" |
| `03-recipe-list` | Breakfasts cookbook (the three recipes that have photos) |
| `04-recipe` | Ricotta Pancakes, top of the recipe view |
| `05-add-to-list` | same recipe scrolled to "Add to shopping list" + instructions |
| `06-shopping` | the demo shopping list, with the "In cart" section visible |

`02-import` sits second on purpose: frame 1 promises "no account, no cloud",
which immediately raises "so how do my recipes get in?" — and Play's carousel
shows only the first two or three before the user has to scroll.

Its capture needs no demo library at all (the sheet covers the screen and the
form behind it is pure UI chrome), so switching **Settings → Language** is
enough to get the other language — no restore run. Reach it from inside a
cookbook: the home FAB creates a *cookbook*, only the FAB in a cookbook or in
"all recipes" creates a recipe. Dismiss the keyboard before capturing; tapping
a mode tile focuses its field and Gboard covers the bottom third.

The renderer crops the status bar off the top and (on tablet captures) the
launcher taskbar off the bottom, so leftover emulator icons in either do not
matter. What is *in* the app screen does.

## 3. Frames

```bash
npx --yes tsx scripts/build-store-screenshots.ts               # all forms, both languages
npx --yes tsx scripts/build-store-screenshots.ts pl            # one language
npx --yes tsx scripts/build-store-screenshots.ts pl tablet10   # one of each
```

Copy lives in `assets/store/screenshot-captions.json` — edit it and re-run; no
re-capture needed. Rendering is headless Chrome for Testing out of the
Playwright browser cache, so there is no image library to install; output is
JPEG via `sips` (macOS only).

The device frame stretches to the bottom of the canvas and clips the capture
there. That is deliberate: a cookbook with three recipes leaves half the phone
screen empty, and letting the frame bleed off the edge crops that blank area
instead of framing it.

That default clips the *bottom* of the screen, which is a problem for a bottom
sheet — no amount of scrolling moves one into the top of the shot. Setting
`"align": "bottom"` on a screen in `screenshot-captions.json` anchors the
capture's bottom edge to the frame's bottom edge instead, so the top is what
gets clipped. `02-import` uses it. As a side effect the status bar falls
outside the frame on its own, so demo mode does not matter for such a shot.

Play's constraints for every screenshot slot, all satisfied by this output:
2–8 images, JPEG or 24-bit PNG without alpha, shorter side ≥ 320 px, longer
side ≤ 3840 px, aspect between 16:9 and 9:16, ≤ 8 MB each (largest here is
about 0.8 MB).

## Known gap

The app has no tablet-specific layout — on a 800dp screen it is the phone
layout stretched: full-width recipe cards, and a fair amount of empty space
below short lists. The tablet screenshots show that honestly. If large-screen
users ever matter commercially, a two-column recipe list is the change that
would make these shots earn their slot.
