---
description: Persona-based usability test of the app on the Android emulator (persona-lab)
argument-hint: "[--only <id>] [--runs N] [--count N] [--personas-file F] [--max-steps N]"
---

Run a persona-lab session for this app. The engine is a repository of its own: `persona-lab/run.sh` finds it through `PERSONA_LAB_ENGINE` or as a clone called `persona-lab` next to this repository, and its rules are in that clone's `docs/how-it-works.md`. This app's side is in `persona-lab/README.md`. Read them if anything below is unclear.

1. Check the preconditions and report any that fail instead of working around them:
   - the engine is there: `$PERSONA_LAB_ENGINE/run.sh`, or `../persona-lab/engine/run.sh` when the variable is not set,
   - the emulator from `persona-lab/config/config.sh` (`ANDROID_SERIAL`) is listed by `adb devices`,
   - the `claude` CLI is on PATH and authenticated (`ANTHROPIC_API_KEY` set, or a `claude setup-token` login).
2. Run, in the background (a session takes minutes per persona run):
   `bash persona-lab/run.sh persona-lab/config $ARGUMENTS`
3. Do NOT drive the emulator, read persona transcripts mid-run, or edit the personas while it runs. The personas must see only the screen.
4. When it finishes, read `persona-lab/runs/<session>/synthesis.md` (and `isolation/isolation.md`) and give the user:
   - whether isolation held,
   - personas × runs and their outcomes (`summary.json`), plus total cost. Report two numbers, never one: how many runs the persona declared done (`outcome`) and how many the app's end state confirms (`verified: met`). Name every run with `self_report: overclaimed`,
   - runs with `tainted: true` (a rig incident: the host slept, a call hung, typing ran too slowly to trust, or the run began right after a stall) and what was discarded because of them,
   - the top problems and wishes from the synthesis, with their ledger ids and links to the files,
   - what the ledger says changed: findings that came back after being marked fixed (`regressed`) and fixes that held (`verified`) — `persona-lab/history/findings.md`,
   - the calibration result, if `persona-lab/config/calibration/real-testers.md` is filled or the session ran with `--seeded`.
   Do not fix anything found unless the user asks. When the user fixes a finding, mark it: `bash persona-lab/run.sh persona-lab/config --finding F-012 fixed "<commit>"`.
