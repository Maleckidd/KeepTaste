// Lightweight manual mock — pure-logic tests load the backupTrigger ->
// backupArchiveFs chain at module load time, which imports this native module,
// but they never exercise the native pack/unpack (that's device-only per
// CLAUDE.md). zip/unzip echo the target path; subscribe is a no-op.
export const DEFAULT_COMPRESSION = -1;
export const NO_COMPRESSION = 0;
export const BEST_SPEED = 1;
export const BEST_COMPRESSION = 9;

export async function zip(_source: string | string[], target: string): Promise<string> {
  return target;
}

export async function unzip(_source: string, target: string): Promise<string> {
  return target;
}

export function subscribe(
  _cb: (e: { progress: number; filePath: string }) => void
): { remove: () => void } {
  return { remove: () => {} };
}
