// Pure assembly of OCR text-recognition blocks into a single string
// (SPEC.md §5.15 mode T3, "Text assembly"). No native imports — the native
// recognition wrapper lives in utils/recipeOcr.ts and adapts its result into
// the OcrBlock shape below before calling here. Deterministic and testable.

export interface OcrBlockFrame {
  top: number;
  left?: number;
  width?: number;
  height?: number;
}

export interface OcrBlock {
  text: string;
  lines?: { text: string }[];
  frame?: OcrBlockFrame;
}

/**
 * Turns recognized text blocks into a top-to-bottom plain-text string:
 * - blocks are stably sorted ascending by `frame.top`; blocks lacking a frame
 *   (or a numeric `frame.top`) sort after framed blocks in their original order,
 * - within a block, `lines[].text` join with `\n` (falling back to `block.text`
 *   when `lines` is missing or empty),
 * - whitespace-only lines are dropped,
 * - blocks are separated by a single `\n` (no blank line).
 */
export function ocrBlocksToText(blocks: OcrBlock[]): string {
  const hasTop = (b: OcrBlock): boolean =>
    b.frame != null && typeof b.frame.top === 'number';

  // Decorate-sort-undecorate for a stable sort that keeps unframed blocks in
  // their original relative order after all framed ones.
  const ordered = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => {
      const aHas = hasTop(a.block);
      const bHas = hasTop(b.block);
      if (aHas && bHas) {
        const diff = a.block.frame!.top - b.block.frame!.top;
        return diff !== 0 ? diff : a.index - b.index;
      }
      if (aHas) return -1;
      if (bHas) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.block);

  const blockTexts: string[] = [];
  for (const block of ordered) {
    const source =
      block.lines && block.lines.length > 0
        ? block.lines.map((l) => l.text)
        : [block.text];
    const kept = source.filter((line) => line.trim().length > 0);
    if (kept.length > 0) blockTexts.push(kept.join('\n'));
  }

  return blockTexts.join('\n');
}
