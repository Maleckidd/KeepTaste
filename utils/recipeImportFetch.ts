// Thin native fetch wrapper for single-recipe import (SPEC.md §5.15). The only
// network call in the app: a user-initiated fetch of a URL the user pasted,
// straight to that site. Parsing happens in the pure utils/recipeImport.ts.

const TIMEOUT_MS = 15000;

// Browser-like headers. React Native's default User-Agent is `okhttp/...`,
// which many sites' WAFs reject even though they serve the same HTML (incl.
// JSON-LD) to a normal browser — recipe sites keep that data readable for SEO.
// This is the cheap lever that recovers UA-filtered sites; pages behind a full
// JS challenge / paywall still fail and fall back to paste-text (§5.15).
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en,pl;q=0.9',
};

// `blocked` = we reached the server but it refused / returned an error status
//   (WAF block, paywall, 4xx/5xx) → guide the user to paste instead.
// `network` = no usable response at all (offline, DNS, timeout/abort).
export type FetchRecipeResult =
  | { ok: true; html: string }
  | { ok: false; reason: 'blocked' | 'network' };

export async function fetchRecipeFromUrl(
  url: string
): Promise<FetchRecipeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return { ok: false, reason: 'blocked' };
    const html = await res.text();
    return { ok: true, html };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
