# Case study: usability testing with simulated users (persona-lab)

KeepTaste was tested by simulated users: language-model personas that see
only the phone screen and act on a real Android emulator. The engine is open
source as [Maleckidd/persona-lab](https://github.com/Maleckidd/persona-lab)
(MIT). This repository holds the app's side: the configs, the study history
and the findings ledger in [`persona-lab/`](../../persona-lab/).

The study history and ledger are written in Polish, the language the studies
ran in. This page summarises them in English.

## Why

The usual checks (unit tests, type checks, end-to-end flows) answer "does the
code do what we specified?". They cannot answer "does someone who has never
seen the app find the feature, and do they *believe* their work is saved?".
Personas are a cheap, repeatable first filter for those questions: a session
runs unattended and can be repeated after every fix. They are not a
substitute for real people (see Limits).

## Method

1. **Personas from the public listing only.** Each persona is fitted to the
   Play Store description: a grandmother copying her recipe notebook, a
   sceptic who wants "what can I cook from my fridge", a baker who thinks
   in grams. The persona never sees SPEC.md, the code or the docs,
   so it meets the app the way a new user does.
2. **A real device loop.** The engine screenshots the emulator, the persona
   decides one action (tap, type, scroll, back) and the engine performs it
   with `adb`. Personas get no tools of their own; they run isolated
   (`claude -p --tools ""`), and the engine checks that isolation against a
   positive control.
3. **Think-aloud and a declared outcome.** Each step carries the persona's
   reasoning. A run ends with the persona's own verdict: `done`, `give_up`,
   or out of steps.
4. **Synthesis against the code.** After a session, every problem and wish
   is grouped across personas and runs, backed by screenshots, and mapped to
   the files and lines responsible.
5. **Calibration.** `config-seeded/` plants six known defects in the app
   (no save confirmation, a vague error message, a missing add button, …),
   so the study can show how many of the planted defects the personas find.

## A persona's "done" is only its belief

From iteration 11 the engine also reads the app's **real end state** after
each run: a scripted pass over the UI (`capture_state` in
`persona-lab/config/config.sh`) that records the recipes, cookbooks and
shopping lists actually saved. Each run then gets a `verified` verdict next
to what the persona declared.

The two disagree in both directions:

- **Over-claiming.** Personas say `done` when only part of the goal was met.
  In iteration 13 all four `done` runs were "partly" on inspection.
- **Under-claiming, which is the more interesting case.** In iteration 12 a
  persona gave up, convinced her cheesecake recipe might be lost. The end
  state showed it saved in full. Three findings together explained why:
  the new recipe was not visible on the home screen (F-010), the app hung
  when she tried to check (F-009), and a snackbar was the only
  confirmation. Iteration 14 shows the same pattern in the numbers: 1 run
  declared `done`, 2 verified.

"The user thinks they lost data" is a defect in its own right. A test that
only checks the database, or a study that only trusts the user's report,
would miss it.

## The findings ledger

Since iteration 11 each finding has a stable id in
[`persona-lab/history/findings.json`](../../persona-lab/history/findings.json)
(rendered as [`findings.md`](../../persona-lab/history/findings.md)). A
finding records where it was first and last seen, how many sessions saw it,
and where it lives in the code. The owner marks a fix with
`bash persona-lab/run.sh persona-lab/config --finding F-012 fixed "<commit>"`.
The next study then confirms it (`verified`) or reopens it (`regressed`).

The current ledger has **35 findings**: 17 problems (5 × P1, 5 × P2,
7 × P3) and 18 wishes. One wish, recipe scaling, is a deliberate
out-of-scope item (SPEC.md §7). None is marked fixed yet: the project is
feature-complete and no longer actively developed, so the ledger is
published as it stands.

## What the studies changed

Iterations 1–10 (2026-10-23 → 2026-11-02, before the ledger) fed straight
into fixes. Each fix commit names the iteration it came from:

| Iteration | Observation | Fix |
|---|---|---|
| 1 | The swipe hint on recipe rows appeared in all 9 runs, including after every save. | [`352e236`](https://github.com/Maleckidd/KeepTaste/commit/352e236) plays it once, never after saving |
| 1 | On a fresh install, 3 of 5 personas tapped the big "+" expecting a new recipe and got a new cookbook. | [`fb95f64`](https://github.com/Maleckidd/KeepTaste/commit/fb95f64) makes the home FAB add a recipe, with the cookbook picked in the form |
| 3 | All three personas read a red Delete sliding out by itself as a threat. | [`c0d0f75`](https://github.com/Maleckidd/KeepTaste/commit/c0d0f75) makes the hint reveal only Edit |
| 3 | A persona typed into the "Paste products" sheet with nothing focused. | [`92d0a6a`](https://github.com/Maleckidd/KeepTaste/commit/92d0a6a) focuses the field on open |
| 3 | A late tap on an expired snackbar hit the ingredient underneath. | [`f303228`](https://github.com/Maleckidd/KeepTaste/commit/f303228) swallows that tap |
| 3 | The PDF share looked dead while it rendered, so the persona tapped again. | [`641b381`](https://github.com/Maleckidd/KeepTaste/commit/641b381) shows "Preparing PDF…" |
| 4 | A checked shopping item dropped below the fold and read as deleted. | [`a0e9d21`](https://github.com/Maleckidd/KeepTaste/commit/a0e9d21) says where it went, with Undo |
| 7 | Real pasted recipes and Polish recipe sites failed to import. | [`5deb42d`](https://github.com/Maleckidd/KeepTaste/commit/5deb42d), with the study's own clipboard texts as unit-test fixtures |

Across 14 sessions there were 93 runs (2026-10-23 → 2026-11-14). The
per-session table is in
[`persona-lab/history/README.md`](../../persona-lab/history/README.md).

## Limits

- Personas are not people. They are more patient with some things and less
  with others, and they share one model's blind spots. Treat what they find
  as hypotheses to check, never as a verdict. A calibration against the
  five real testers was considered and skipped as too costly.
- They see screenshots, not the screen in motion: animation timing and
  haptics are invisible to them.
- The end-state check reads the UI and depends on screen shapes, so a
  redesign of the recipe list or the home grid needs a look at
  `capture_state`.

## Running it

The engine lives in its own repository; KeepTaste's
[`persona-lab/run.sh`](../../persona-lab/run.sh) finds a clone next to this
one, or the directory in `PERSONA_LAB_ENGINE`:

```bash
git clone https://github.com/Maleckidd/persona-lab ../persona-lab
bash persona-lab/run.sh persona-lab/config --count 1 --runs 1   # smoke run
```

It needs an Android emulator with a release build of the app and the
`claude` CLI. See the engine's README for the rest.
