# Maestro E2E flows (Android emulator)

Device-level end-to-end flows for the real Android build. They run **locally on
an emulator only** — there is no CI job for them. Background, setup details and
troubleshooting: [docs/e2e-emulator.md](../docs/e2e-emulator.md).

| Flow | What it proves |
| --- | --- |
| `backup-restore.yaml` | A `.zip` backup restores into a fresh install: 4 cookbooks, recipes, the shopping list; the first-launch seed is replaced, not merged. |
| `backup-export.yaml` | "Export all data → Share / send" hands `keeptaste-backup.zip` to the system share sheet. |
| `create-recipe.yaml` | A recipe with a title and two ingredient lines is saved, listed under "All recipes" and shown in the recipe view. |
| `shopping-list.yaml` | A new list gets two products; ticking one moves it to "In cart" (checked) and the overview shows `1/2 in cart`. |

`subflows/` holds shared steps (`fresh-launch`, the file-picker step). Maestro
runs only the top-level files of a folder, so subflows never run on their own.

## Run

One-time setup (details in the doc): Maestro CLI, Java 17, a running emulator
with the system language set to **English**, and the side-by-side E2E build
`com.damianmalecki.keeptaste.e2e` installed.

```bash
# The restore flow needs the demo archive in the emulator's Downloads folder:
bash scripts/crop-demo-photos.sh            # once per clone (crops are git-ignored)
npx --yes tsx scripts/build-demo-backup.ts  # → assets/store/keeptaste-demo.zip
adb push assets/store/keeptaste-demo.zip /sdcard/Download/

export MAESTRO_CLI_NO_ANALYTICS=1           # optional: no usage analytics
maestro test .maestro/                      # all flows, ~2.5 min
maestro test .maestro/create-recipe.yaml    # one flow
```

Flows target `com.damianmalecki.keeptaste.e2e` by default. To run them against
another install, pass its package: `maestro test -e APP_ID=<package> .maestro/`.
That build must contain the `testID`s the flows use. Builds of 1.3.3 and
earlier don't have them.

## Rules for flows

- **Every flow starts with `subflows/fresh-launch.yaml`** (`clearState` + wait
  for home), so flows are independent and order-free. A cleared app is not
  empty: the first launch seeds a "Breakfasts" cookbook with "Pancakes".
- **No sleeps.** Wait with `extendedWaitUntil` / `assertVisible` (which retries
  for ~7 s) on something the next step needs.
- **Select by `testID`** (`id:`) for controls; use visible text only for content
  you are asserting (recipe titles, list names) or for system UI. New `testID`s
  go on the element itself; the UI kit (`Button`, `IconButton`, `Fab`,
  `EmptyState.actionTestID`) passes them through.
- **Never use `hideKeyboard` or `back` on a form.** On Android `hideKeyboard`
  sends a system Back, and Back closes a form without saving (a known app bug).
  Tap the form's own Save — it stays above the keyboard.
- **Keep system UI minimal** (file picker, share sheet): tap the file, assert
  one line, leave. Don't assert the picker's own layout.
