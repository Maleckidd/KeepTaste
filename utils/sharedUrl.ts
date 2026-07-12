// Pure helpers for the Android share-target feature (SPEC §5.15). When the OS
// hands KeepTaste a chunk of shared text (from a browser "Share" action or a
// plain-text share), we need to decide whether it carries a recipe URL to fetch
// or is just free-form text to prefill the paste field. No native imports here —
// this module is unit-tested and consumed by the share handler + ImportSheet.

// Matches the first http(s):// URL in a blob of text. URLs stop at whitespace
// (so a trailing newline / space ends them); ftp://, mailto:, etc. are ignored
// by design — only http(s) recipe links are actionable.
const URL_RE = /https?:\/\/[^\s]+/i;

// Punctuation that commonly trails a URL when it's embedded in prose or wrapped
// in brackets — stripped from the end so "(https://x.com/r)" yields a clean URL.
// Note: '&' is NOT here, so query strings like "?a=1&b=2" survive intact.
const TRAILING_PUNCT = /[)\].,>]+$/;

/**
 * Extracts the first http(s):// URL from arbitrary shared text, cleaned of
 * surrounding punctuation/brackets. Returns null when the input is
 * null/undefined/whitespace-only or contains no http(s) URL.
 */
export function extractSharedUrl(text: string | null | undefined): string | null {
  if (text == null) return null;
  if (text.trim() === '') return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // A leading angle bracket ("<https://…>") won't be in the match (it starts at
  // http), but a trailing one is — strip trailing brackets/punctuation.
  const cleaned = match[0].replace(TRAILING_PUNCT, '');
  return cleaned.length > 0 ? cleaned : null;
}

/** The import intent derived from shared text: fetch a link, or prefill paste. */
export type ImportIntent =
  | { mode: 'link'; url: string }
  | { mode: 'paste'; text: string };

/**
 * Maps shared text to an import intent. A recipe URL wins and carries ONLY the
 * URL (not the surrounding title text). With no URL but some non-whitespace
 * content, we fall back to a paste intent holding the trimmed original text so
 * the user is never stranded. Empty/whitespace/null/undefined → null.
 */
export function toImportIntent(
  text: string | null | undefined
): ImportIntent | null {
  const url = extractSharedUrl(text);
  if (url) return { mode: 'link', url };
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return { mode: 'paste', text: trimmed };
}
