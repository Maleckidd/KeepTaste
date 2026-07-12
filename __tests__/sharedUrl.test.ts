// TDD red phase for the Android share-target URL helper (SPEC §5.15).
// The module utils/sharedUrl.ts does NOT exist yet; these tests should fail
// because of the missing implementation, not setup errors.
import { extractSharedUrl, toImportIntent } from '@/utils/sharedUrl';

describe('extractSharedUrl', () => {
  it('returns a bare URL unchanged', () => {
    expect(extractSharedUrl('https://example.com/recipe')).toBe(
      'https://example.com/recipe'
    );
  });

  it('extracts the URL from "Title https://…" text', () => {
    expect(extractSharedUrl('Great pancakes https://example.com/recipe')).toBe(
      'https://example.com/recipe'
    );
  });

  it('finds a URL on a later line of multi-line text', () => {
    const text = 'Great pancakes\nby Someone\nhttps://example.com/recipe';
    expect(extractSharedUrl(text)).toBe('https://example.com/recipe');
  });

  it('matches http:// as well as https://', () => {
    expect(extractSharedUrl('see http://example.com/r')).toBe(
      'http://example.com/r'
    );
    expect(extractSharedUrl('see https://example.com/r')).toBe(
      'https://example.com/r'
    );
  });

  it('does not match ftp:// or mailto: schemes', () => {
    expect(extractSharedUrl('ftp://example.com/file')).toBeNull();
    expect(extractSharedUrl('mailto:cook@example.com')).toBeNull();
  });

  it('returns the first URL when several are present', () => {
    const text = 'first https://a.example.com/x then https://b.example.com/y';
    expect(extractSharedUrl(text)).toBe('https://a.example.com/x');
  });

  describe('trailing punctuation is stripped', () => {
    it('strips a trailing closing parenthesis', () => {
      expect(extractSharedUrl('(see https://example.com/r)')).toBe(
        'https://example.com/r'
      );
    });

    it('strips a trailing period', () => {
      expect(extractSharedUrl('here it is https://example.com/r.')).toBe(
        'https://example.com/r'
      );
    });

    it('strips a trailing comma', () => {
      expect(extractSharedUrl('https://example.com/r, and more')).toBe(
        'https://example.com/r'
      );
    });

    it('stops the URL at a newline', () => {
      expect(extractSharedUrl('https://example.com/r\nmore text')).toBe(
        'https://example.com/r'
      );
    });
  });

  it('preserves query strings (ampersands are not trailing punctuation)', () => {
    expect(
      extractSharedUrl('https://example.com/r?utm_source=share&x=y')
    ).toBe('https://example.com/r?utm_source=share&x=y');
  });

  it('strips surrounding angle brackets from "Title <url>" text', () => {
    expect(extractSharedUrl('Title <https://example.com/r>')).toBe(
      'https://example.com/r'
    );
  });

  it('returns null for text with no URL', () => {
    expect(extractSharedUrl('just some recipe notes')).toBeNull();
  });

  it('returns null for empty, whitespace-only, null and undefined', () => {
    expect(extractSharedUrl('')).toBeNull();
    expect(extractSharedUrl('   \n\t ')).toBeNull();
    expect(extractSharedUrl(null)).toBeNull();
    expect(extractSharedUrl(undefined)).toBeNull();
  });
});

describe('toImportIntent', () => {
  it('returns a link intent when a URL is present', () => {
    expect(toImportIntent('https://example.com/recipe')).toEqual({
      mode: 'link',
      url: 'https://example.com/recipe',
    });
  });

  it('carries only the extracted URL for a link intent', () => {
    expect(toImportIntent('Great pancakes https://example.com/recipe')).toEqual(
      { mode: 'link', url: 'https://example.com/recipe' }
    );
  });

  it('returns a paste intent with the full trimmed text when no URL', () => {
    expect(toImportIntent('  just some recipe notes  ')).toEqual({
      mode: 'paste',
      text: 'just some recipe notes',
    });
  });

  it('treats ftp:// / mailto: as paste text (no URL match)', () => {
    expect(toImportIntent('ftp://example.com/file')).toEqual({
      mode: 'paste',
      text: 'ftp://example.com/file',
    });
  });

  it('returns null for empty, whitespace-only, null and undefined', () => {
    expect(toImportIntent('')).toBeNull();
    expect(toImportIntent('   \n\t ')).toBeNull();
    expect(toImportIntent(null)).toBeNull();
    expect(toImportIntent(undefined)).toBeNull();
  });
});
