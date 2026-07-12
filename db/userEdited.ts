// Best-effort "the user edited real data" signal (SPEC.md §5.20). Real
// mutations in db/recipes.ts and db/cookbooks.ts call this so a pristine demo
// seed can be told apart from a library the user has touched (canSilentReplace).
//
// Two guards keep it cheap and correct:
//   • a once-per-process boolean — after the first mark we skip the DB write,
//     so the hot mutation paths don't hit app_settings on every save;
//   • suppression — while a bulk op (import/restore) or the seed itself runs
//     inside withAutoBackupSuppressed, we don't mark, so the seed's own inserts
//     never make the library look edited.
//
// Fire-and-forget: it must never break a mutation, hence the void/catch at the
// call sites.
import { markUserEdited } from './settings';
import { isAutoBackupSuppressed } from '../utils/backupTrigger';

let markedThisProcess = false;

/** Records a real user edit (once per process), unless a bulk op is running. */
export function noteUserEdit(): void {
  if (markedThisProcess) return;
  if (isAutoBackupSuppressed()) return;
  markedThisProcess = true;
  void markUserEdited().catch(() => {
    // Best-effort; a failed flag write must never break the mutation.
    markedThisProcess = false;
  });
}

/** Test-only: resets the once-per-process guard. */
export function __resetUserEditGuard(): void {
  markedThisProcess = false;
}
