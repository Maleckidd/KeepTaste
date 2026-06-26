// Pure cadence decision for the optional automatic backup (SPEC.md §5.17.3).
// No native imports — testable in plain ts-jest.

/**
 * True when an automatic backup is due: there has never been one, the last one
 * is unparseable, or at least `intervalDays` have passed since it.
 */
export function shouldAutoBackup(
  lastIso: string | null,
  nowIso: string,
  intervalDays: number
): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return true;
  const now = Date.parse(nowIso);
  return now - last >= intervalDays * 86_400_000;
}
