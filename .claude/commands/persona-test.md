---
description: Persona-based usability test of the app on the Android emulator (persona-lab)
argument-hint: "[--only <id>] [--runs N] [--count N] [--personas-file F] [--max-steps N]"
---

Run a persona-lab session for this app. The engine and its rules are in `persona-lab/README.md`; read it if anything below is unclear.

1. Check the preconditions and report any that fail instead of working around them:
   - the emulator from `persona-lab/config/config.sh` (`ANDROID_SERIAL`) is listed by `adb devices`,
   - the `claude` CLI is on PATH and authenticated (`ANTHROPIC_API_KEY` set, or a `claude setup-token` login).
2. Run, in the background (a session takes minutes per persona run):
   `bash persona-lab/engine/run.sh persona-lab/config $ARGUMENTS`
3. Do NOT drive the emulator, read persona transcripts mid-run, or edit the personas while it runs. The personas must see only the screen.
4. When it finishes, read `persona-lab/runs/<session>/synthesis.md` (and `isolation/isolation.md`) and give the user:
   - whether isolation held,
   - personas × runs and their outcomes (`summary.json`), plus total cost,
   - the top problems and wishes from the synthesis, with links to the files,
   - the calibration result, if `persona-lab/config/calibration/real-testers.md` is filled.
   Do not fix anything found unless the user asks.
