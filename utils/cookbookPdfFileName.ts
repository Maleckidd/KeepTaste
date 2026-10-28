// Readable file name for the shared cookbook PDF (SPEC.md §5.14):
// `{cookbook name} {YYYY-MM-DD}.pdf` instead of expo-print's random UUID.
// Pure — no native imports; URI-encoding the result is the caller's job.

const MAX_NAME_CHARS = 60;
// Characters invalid in file names on common platforms, plus ASCII controls.
const INVALID_CHARS = /[\/\\:*?"<>|\u0000-\u001F\u007F]/g;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function cookbookPdfFileName(name: string, date: Date, fallback: string): string {
  const cleaned = name
    .replace(/\s+/g, ' ')
    .replace(INVALID_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Cut by code points so an emoji is never split into a lone surrogate.
  const cut = Array.from(cleaned).slice(0, MAX_NAME_CHARS).join('').trim();
  const base = cut || fallback;
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return `${base} ${day}.pdf`;
}
