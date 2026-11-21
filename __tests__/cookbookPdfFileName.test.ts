// Tests for package F (SPEC.md §5.14): the shared cookbook PDF gets a
// readable file name `{cookbook name} {YYYY-MM-DD}.pdf` instead of expo-print's
// random UUID. Pure helper — no native imports, no file system.
//
// Module under test: utils/cookbookPdfFileName.ts
//   cookbookPdfFileName(name: string, date: Date, fallback: string): string
//
// Dates are always built with the local constructor (month is 0-based) — the
// helper must use the *local* calendar date, never the UTC one.

import { cookbookPdfFileName } from '../utils/cookbookPdfFileName';

const d = new Date(2026, 9, 26, 23, 30); // 26 Oct 2026, 23:30 local
const SUFFIX = ' 2026-10-26.pdf';

describe('utils/cookbookPdfFileName — date', () => {
  it('builds "{name} {YYYY-MM-DD}.pdf"', () => {
    expect(cookbookPdfFileName('Christmas', d, 'Cookbook')).toBe('Christmas 2026-10-26.pdf');
  });

  it('zero-pads month and day', () => {
    expect(cookbookPdfFileName('X', new Date(2026, 0, 5), 'Cookbook')).toBe('X 2026-01-05.pdf');
  });

  it('uses the local calendar date, not UTC (late evening)', () => {
    const late = new Date(2026, 9, 26, 23, 59);
    expect(cookbookPdfFileName('Late', late, 'Cookbook').endsWith('2026-10-26.pdf')).toBe(true);
  });

  it('uses the local calendar date, not UTC (just after midnight)', () => {
    const early = new Date(2026, 9, 26, 0, 1);
    expect(cookbookPdfFileName('Early', early, 'Cookbook').endsWith('2026-10-26.pdf')).toBe(true);
  });
});

describe('utils/cookbookPdfFileName — sanitizing', () => {
  it('keeps diacritics', () => {
    expect(cookbookPdfFileName('Święta Żółć', d, 'Cookbook')).toBe('Święta Żółć' + SUFFIX);
  });

  it('removes every character invalid in file names', () => {
    expect(cookbookPdfFileName('a/b\\c:d*e?f"g<h>i|j', d, 'Cookbook')).toBe('abcdefghij' + SUFFIX);
  });

  it('removes a colon without leaving a double space', () => {
    expect(cookbookPdfFileName('Breakfast: Sunday', d, 'Cookbook')).toBe('Breakfast Sunday' + SUFFIX);
  });

  it('collapses whitespace runs (tabs, newlines) and trims', () => {
    expect(cookbookPdfFileName('  Soups \t and\n\nStews  ', d, 'Cookbook')).toBe(
      'Soups and Stews' + SUFFIX,
    );
  });

  it('removes control characters (U+0000–U+001F, U+007F)', () => {
    expect(cookbookPdfFileName('A\u0000B\u001FC\u007FD', d, 'Cookbook')).toBe('ABCD' + SUFFIX);
  });

  it('keeps "#" and "%" (URI encoding is the caller\'s job)', () => {
    expect(cookbookPdfFileName('Pies #1 50%', d, 'Cookbook')).toBe('Pies #1 50%' + SUFFIX);
  });
});

describe('utils/cookbookPdfFileName — length cap (60 characters)', () => {
  it('cuts a long name to 60 characters', () => {
    expect(cookbookPdfFileName('a'.repeat(80), d, 'Cookbook')).toBe('a'.repeat(60) + SUFFIX);
  });

  it('trims a trailing space left by the cut (no double space before the date)', () => {
    expect(cookbookPdfFileName('a'.repeat(59) + ' bbbb', d, 'Cookbook')).toBe(
      'a'.repeat(59) + SUFFIX,
    );
  });

  it('counts a diacritic letter as one character', () => {
    expect(cookbookPdfFileName('ż'.repeat(70), d, 'Cookbook')).toBe('ż'.repeat(60) + SUFFIX);
  });

  it('cuts by code points — an emoji is never split into a lone surrogate', () => {
    const out = cookbookPdfFileName('😀'.repeat(70), d, 'Cookbook');
    expect(out.endsWith(SUFFIX)).toBe(true);
    const base = out.slice(0, -SUFFIX.length);
    expect(Array.from(base)).toHaveLength(60);
    expect(base).toBe('😀'.repeat(60));
    // No unpaired high/low surrogate anywhere in the result.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(
      false,
    );
  });
});

describe('utils/cookbookPdfFileName — fallback', () => {
  it.each(['', '   ', '///', '"?*'])('name %p falls back to the given word', (name) => {
    expect(cookbookPdfFileName(name, d, 'Cookbook')).toBe('Cookbook' + SUFFIX);
  });

  it('uses the localized fallback verbatim', () => {
    expect(cookbookPdfFileName('???', d, 'Książka kucharska')).toBe('Książka kucharska' + SUFFIX);
  });
});

describe('utils/cookbookPdfFileName — extension', () => {
  it.each(['Christmas', '', 'a'.repeat(200), 'x.pdf', 'Soups/Stews'])(
    'name %p always yields a ".pdf" file name',
    (name) => {
      const out = cookbookPdfFileName(name, d, 'Cookbook');
      expect(out.endsWith('.pdf')).toBe(true);
      expect(out.endsWith('.pdf.pdf')).toBe(false);
    },
  );
});
