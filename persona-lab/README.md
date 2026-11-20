# persona-lab: KeepTaste's side

Usability testing with simulated users. Personas fitted to the app's public
description use the real app on an Android emulator the way a person with
their needs and temperament would. The output is their problems and wishes,
each backed by a screenshot, plus one synthesis that groups everything across
personas and runs and maps it onto the code.

The tool is a repository of its own,
[Maleckidd/persona-lab](https://github.com/Maleckidd/persona-lab) (MIT). How
it works, what it checks about itself and what it writes are in its
[docs/how-it-works.md](https://github.com/Maleckidd/persona-lab/blob/main/docs/how-it-works.md).
An English summary of what the studies found and changed in KeepTaste is in
[docs/case-studies/persona-lab.md](../docs/case-studies/persona-lab.md). This directory is
what belongs to the app: its configs, the history of its studies and the
output of its sessions.

```bash
bash persona-lab/run.sh persona-lab/config                       # full session
bash persona-lab/run.sh persona-lab/config --count 1 --runs 1    # smoke run
```

…or `/persona-test [options]` in Claude Code.

`run.sh` only finds the engine and hands over: `PERSONA_LAB_ENGINE` (the
`engine/` directory of a clone) or, when that is not set, a clone called
`persona-lab` next to this repository:

```bash
git clone https://github.com/Maleckidd/persona-lab ../persona-lab
``` The engine's version is not pinned
here. Each session writes the engine commit it ran on into its `summary.json`
and its history entry.

## Layout

| Path | What |
|---|---|
| `run.sh` | finds the engine and runs it |
| `config/` | this app's setup: `config.sh`, `brief*.md`, `personas.override.md`, `calibration/` |
| `config-import/`, `config-research/` | focused studies built on `config/` |
| `config-seeded/` | the calibration run: the app with planted defects, and their manifest |
| `history/` | one file per session, plus the findings ledger (`findings.json`, `findings.md`); tracked |
| `runs/` | session output, git-ignored |

An app detail goes in `config/config.sh` (or a hook there), never in the
engine. The engine's other entry points are called from that clone directly,
for example the isolation check with its positive control:

```bash
bash ../persona-lab/engine/verify-isolation.sh persona-lab/config --with-control
```

## The configs

- `config/brief.md` (PL) and `config/brief.en.md` are the **Play Store
  listing** text (short + full description, version B from
  `assets/store/play-store-listing.md`) — what a user reads before installing.
  Edit them freely; personas get the one in their language.
- Start states: `fresh` (`pm clear` + per-app locale) and `demo` (the curated
  demo library via `scripts/reset-demo-library.sh`, which needs
  `assets/store/keeptaste-demo*.zip` and the coordinates in `scripts/lib/screen.sh`).
- The app UI language follows the persona's language via
  `cmd locale set-app-locales`.
- `capture_state` in `config/config.sh` reads the end state through the UI,
  because the release build is not debuggable: a cold start into "all recipes"
  by deep link (`keeptaste://cookbook/all`), the full text of the three most
  recently changed recipes, the recipe titles, every cookbook on the home
  screen with the recipes in it, the shopping lists and the first list. It
  taps recipe cards, cookbook tiles, list rows and Back, nothing else. It finds
  cards and tiles by shape (the only tall tappable elements on the recipe
  list; tappable squares half the screen wide on the home screen), so a
  redesign of either screen needs a look at it. The "new cookbook" tile has
  the shape of a cookbook and is skipped by its label (`CAPTURE_SKIP_TILES`),
  which has to follow `home.newCookbook` in `i18n/dictionary.ts`.
  Lists are read as card titles only, the first `CAPTURE_TITLES` (12) of each,
  so that two reads of the same list come out the same. The search field of
  "all recipes" takes focus by itself and brings the keyboard up over the
  lower cards; the hook closes it (`keyboard_hide`) before every tap and
  scroll there. Before that a tap on the third card typed a letter into the
  search, and a scroll glide-typed a word.
- `config-import/personas.json` has `expect` patterns for every import path
  (the recipe is there, ingredients have their own section, the mother's
  private notes are gone, no hashtags), so that study's outcomes no longer
  depend on what the persona thinks it saved.
- `config-seeded/` is the calibration run. `seeded.patch` plants six defects
  (no confirmation after saving, a PDF share action called "Export", an error
  that only says "Error.", no add button inside a cookbook, an empty search
  that claims there are no recipes, an import button called "More");
  `seeded.json` lists them for the scorer. The patch is never left in the
  working tree:

  ```bash
  bash persona-lab/config-seeded/build.sh     # apply → gradlew assembleRelease → take it back out
  bash persona-lab/run.sh persona-lab/config-seeded \
    --seeded persona-lab/config-seeded/seeded.json
  ```

  The run installs the seeded APK over the app on the emulator; build and
  install a normal one afterwards. When the patch stops applying, the code has
  moved: plant the defects again and save them with `git diff`.
- `config/calibration/real-testers.md` — the 5 external testers' feedback goes
  here; the synthesis then adds a "Kalibracja" section (what the personas caught,
  missed, recall).
