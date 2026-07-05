// TDD red phase for the "From photo (OCR)" import feature (SPEC.md §5.15, mode
// T3 "Text assembly"). The module @/utils/ocrText does not exist yet; these
// tests should fail because of the missing implementation, not setup errors.
import { ocrBlocksToText, OcrBlock } from '@/utils/ocrText';
import { parsePastedRecipe } from '@/utils/recipeImport';

describe('ocrBlocksToText', () => {
  it('sorts blocks ascending by frame.top (out-of-order array -> top-to-bottom text)', () => {
    const blocks: OcrBlock[] = [
      { text: 'bottom', frame: { top: 200 } },
      { text: 'top', frame: { top: 10 } },
      { text: 'middle', frame: { top: 100 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('top\nmiddle\nbottom');
  });

  it('joins a block\'s lines[].text with \\n in order', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'ignored fallback',
        lines: [{ text: 'first' }, { text: 'second' }, { text: 'third' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('first\nsecond\nthird');
  });

  it('falls back to block.text when lines is undefined', () => {
    const blocks: OcrBlock[] = [{ text: 'plain block text', frame: { top: 0 } }];
    expect(ocrBlocksToText(blocks)).toBe('plain block text');
  });

  it('falls back to block.text when lines is an empty array', () => {
    const blocks: OcrBlock[] = [
      { text: 'fallback here', lines: [], frame: { top: 0 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('fallback here');
  });

  it('drops whitespace-only / empty lines from the output', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'x',
        lines: [{ text: 'keep' }, { text: '   ' }, { text: '' }, { text: 'also keep' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('keep\nalso keep');
  });

  it('separates blocks by a single \\n (no blank line between blocks)', () => {
    const blocks: OcrBlock[] = [
      { text: 'block one', frame: { top: 0 } },
      { text: 'block two', frame: { top: 10 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('block one\nblock two');
  });

  it('returns "" for an empty array', () => {
    expect(ocrBlocksToText([])).toBe('');
  });

  it('does not throw when a block has no frame, and still contributes its text', () => {
    const blocks: OcrBlock[] = [{ text: 'no frame here' }];
    expect(() => ocrBlocksToText(blocks)).not.toThrow();
    expect(ocrBlocksToText(blocks)).toBe('no frame here');
  });

  it('blocks without frame.top sort AFTER framed blocks, keeping original relative order (stable)', () => {
    const blocks: OcrBlock[] = [
      { text: 'unframed A' },
      { text: 'framed low', frame: { top: 500 } },
      { text: 'unframed B' },
      { text: 'framed high', frame: { top: 5 } },
    ];
    // Framed blocks first (by top: 5 then 500), then unframed in original order.
    expect(ocrBlocksToText(blocks)).toBe(
      'framed high\nframed low\nunframed A\nunframed B'
    );
  });

  it('preserves Polish diacritics verbatim', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'x',
        lines: [{ text: 'Składniki' }, { text: 'łyżka' }, { text: 'żółty' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('Składniki\nłyżka\nżółty');
  });

  it('integrates with parsePastedRecipe: multi-block OCR result -> title + non-empty split', () => {
    // Given out of vertical order to also exercise the sort.
    const blocks: OcrBlock[] = [
      {
        text: 'Przygotowanie',
        lines: [
          { text: 'Przygotowanie' },
          { text: '1. Wymieszać mąkę z jajkami.' },
          { text: '2. Usmażyć na patelni.' },
        ],
        frame: { top: 300 },
      },
      {
        text: 'Naleśniki',
        lines: [{ text: 'Naleśniki' }],
        frame: { top: 10 },
      },
      {
        text: 'Składniki',
        lines: [
          { text: 'Składniki' },
          { text: 'mąka' },
          { text: 'jajka' },
        ],
        frame: { top: 120 },
      },
    ];

    const assembled = ocrBlocksToText(blocks);
    const parsed = parsePastedRecipe(assembled);

    expect(parsed.title).toBe('Naleśniki');
    expect(parsed.ingredients).toBe('mąka\njajka');
    expect(parsed.instructions).toBe(
      '1. Wymieszać mąkę z jajkami.\n2. Usmażyć na patelni.'
    );
  });
});
