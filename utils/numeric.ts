export function parsePositiveInt(value: string): number | null {
  const n = parseInt(value.trim(), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
