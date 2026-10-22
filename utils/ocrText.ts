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

export interface OcrLine {
  text: string;
  frame?: OcrBlockFrame;
}

export interface OcrBlock {
  text: string;
  lines?: OcrLine[];
  frame?: OcrBlockFrame;
}

/** Pixel size of the image ML Kit read — its frames share this space. */
export interface OcrImageSize {
  width: number;
  height: number;
}

/**
 * Turns recognized text blocks into a plain-text string in reading order:
 * - when every framed block has a full bounding box (`top`/`left`/`width`/
 *   `height`), blocks are ordered column-aware (see `readingOrder`): a
 *   two-column cookbook page reads down the left column, then the right one,
 *   instead of interleaving the two line by line,
 * - otherwise blocks are stably sorted ascending by `frame.top`,
 * - either way, blocks lacking a frame (or a numeric `frame.top`) sort after
 *   framed blocks in their original order,
 * - a name ……… quantity table is read row by row, each row as one line,
 * - a `Label:` cell and the value beside it on the same row (`Czas:` ·
 *   `40 min`) are joined into one line with a space,
 * - within a block, `lines[].text` join with `\n` (falling back to `block.text`
 *   when `lines` is missing or empty),
 * - whitespace-only lines are dropped,
 * - blocks are separated by a single `\n` (no blank line).
 */
export function ocrBlocksToText(blocks: OcrBlock[]): string {
  const hasTop = (b: OcrBlock): boolean =>
    b.frame != null && typeof b.frame.top === 'number';

  const framed = blocks.filter(hasTop);
  const unframed = blocks.filter((b) => !hasTop(b));
  const boxes = framed.map((block, index) => toBox(block, index));
  // Each entry is one visual line: a single block, or same-row cells.
  const entries: OcrBlock[][] = boxes.every((b): b is Box => b != null)
    ? readingOrder(fuseTableRows(boxes)).map((entry) => entry.map((b) => b.block))
    : framed
        .map((block, index) => ({ block, index }))
        .sort((a, b) => a.block.frame!.top - b.block.frame!.top || a.index - b.index)
        .map((entry) => [entry.block]);

  const blockTexts: string[] = [];
  for (const entry of [...entries, ...unframed.map((b) => [b])]) {
    const kept = entry.length > 1
      ? [entry.map((b) => blockLines(b).join(' ')).join(' ')]
      : blockLines(entry[0]);
    if (kept.length > 0) blockTexts.push(kept.join('\n'));
  }

  return blockTexts.join('\n');
}

function blockLines(block: OcrBlock): string[] {
  const source =
    block.lines && block.lines.length > 0
      ? block.lines.map((l) => l.text)
      : [block.text];
  return source.filter((line) => line.trim().length > 0);
}

/**
 * Drops lines the crop edge cut through. Cropping a screenshot to the recipe
 * often slices the first or last text line in half, and ML Kit reads the
 * visible half as gibberish ("Dah", "Lat"). Such a line is squat — under 70%
 * of the median line height — and touches the top or bottom image edge (within
 * half a median line). A full-height line touching the edge (a tight crop) and
 * small print away from the edges are kept. Needs the image size and at least
 * three lines to judge; otherwise the blocks come back unchanged.
 */
export function dropClippedEdgeLines(blocks: OcrBlock[], size?: OcrImageSize): OcrBlock[] {
  if (!size) return blocks;
  const linesOf = (b: OcrBlock): OcrLine[] =>
    b.lines && b.lines.length > 0 ? b.lines : [{ text: b.text, frame: b.frame }];
  const heights = blocks
    .flatMap(linesOf)
    .map((l) => l.frame?.height)
    .filter((h): h is number => typeof h === 'number' && h > 0)
    .sort((a, b) => a - b);
  if (heights.length < 3) return blocks;
  const median = heights[Math.floor(heights.length / 2)];
  const isClipped = (l: OcrLine): boolean => {
    const f = l.frame;
    if (!f || typeof f.height !== 'number') return false;
    const atEdge = f.top <= 0.5 * median || f.top + f.height >= size.height - 0.5 * median;
    return atEdge && f.height < 0.7 * median;
  };

  const out: OcrBlock[] = [];
  for (const block of blocks) {
    const lines = linesOf(block);
    const kept = lines.filter((l) => !isClipped(l));
    if (kept.length === lines.length) out.push(block);
    else if (kept.length > 0) {
      out.push({
        text: kept.map((l) => l.text).join('\n'),
        lines: kept,
        frame: unionFrame(kept) ?? block.frame,
      });
    }
  }
  return out;
}

function unionFrame(lines: OcrLine[]): OcrBlockFrame | undefined {
  const frames = lines.map((l) => l.frame);
  if (!frames.every((f) => f && typeof f.left === 'number' && typeof f.width === 'number' && typeof f.height === 'number')) {
    return undefined;
  }
  const fs = frames as Required<OcrBlockFrame>[];
  const top = Math.min(...fs.map((f) => f.top));
  const left = Math.min(...fs.map((f) => f.left));
  return {
    top,
    left,
    width: Math.max(...fs.map((f) => f.left + f.width)) - left,
    height: Math.max(...fs.map((f) => f.top + f.height)) - top,
  };
}

interface Box {
  block: OcrBlock;
  index: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Null when the frame has only `top` — such blocks can't be placed in columns.
function toBox(block: OcrBlock, index: number): Box | null {
  const f = block.frame!;
  if (typeof f.left !== 'number' || typeof f.width !== 'number' || typeof f.height !== 'number') {
    return null;
  }
  return {
    block,
    index,
    top: f.top,
    bottom: f.top + f.height,
    left: f.left,
    right: f.left + f.width,
  };
}

const byTop = (a: Box, b: Box) => a.top - b.top || a.index - b.index;
const byLeft = (a: Box, b: Box) => a.left - b.left || a.index - b.index;

const isSingleLine = (b: Box): boolean =>
  (b.block.lines?.length ?? 0) <= 1 && !b.block.text.includes('\n');

// Two boxes sit on the same visual row when they overlap vertically by at
// least half the taller one.
const sameRow = (a: Box, b: Box): boolean =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >=
  0.5 * Math.max(a.bottom - a.top, b.bottom - b.top);

// A short quantity cell: "800 gramów", "2 łyżki", "½ szklanki" — never a
// numbered step ("1. Pokrój…").
const QTY_CELL = /^[0-9½¼¾⅓⅔⅛]+([.,/][0-9]+)?\s*\p{L}/u;
const isQtyCell = (b: Box): boolean => {
  const t = b.block.text.trim();
  return isSingleLine(b) && t.length <= 20 && QTY_CELL.test(t);
};

// A multi-line block made only of quantity cells ("2 łyżki" / "2 łyżki") as
// one box per line, the block's height shared evenly between its lines.
function splitQuantityLines(b: Box): Box[] {
  const lines = blockLines(b.block);
  if (lines.length < 2) return [b];
  const step = (b.bottom - b.top) / lines.length;
  const parts = lines.map((text, i): Box => {
    const top = b.top + i * step;
    return {
      block: { text, frame: { top, left: b.left, width: b.right - b.left, height: step } },
      index: b.index,
      top,
      bottom: top + step,
      left: b.left,
      right: b.right,
    };
  });
  return parts.every(isQtyCell) ? parts : [b];
}

/**
 * Recipe sites lay ingredients out as a table — name on the left, quantity
 * right-aligned on the right ("schab bez kości ……… 800 gramów"). ML Kit
 * returns the two cells as separate blocks with a wide gutter between them,
 * which column detection would read as two columns (all names, then all
 * quantities). When at least three rows pair a short name cell with a
 * quantity cell to its right, each pair is fused into one box first. ML Kit
 * sometimes merges consecutive quantity cells into one multi-line block; such
 * a block is split into per-line boxes so each line can find its row.
 */
function fuseTableRows(input: Box[]): Box[] {
  const boxes = input.flatMap(splitQuantityLines);
  const used = new Set<Box>();
  const pairs: [Box, Box][] = [];
  for (const qty of boxes.filter(isQtyCell)) {
    let name: Box | null = null;
    for (const b of boxes) {
      if (
        b === qty || used.has(b) || !isSingleLine(b) || isQtyCell(b) ||
        b.right > qty.left || !sameRow(b, qty) ||
        b.block.text.trim().length > 40 || /^\d+[.)]/.test(b.block.text.trim())
      ) {
        continue;
      }
      if (name == null || b.right > name.right) name = b;
    }
    if (name) {
      used.add(name);
      pairs.push([name, qty]);
    }
  }
  if (pairs.length < 3) return input;
  const fused = new Set(pairs.flat());
  return [
    ...boxes.filter((b) => !fused.has(b)),
    ...pairs.map(([name, qty]): Box => ({
      block: {
        text: `${name.block.text.trim()} ${qty.block.text.trim()}`,
        frame: {
          top: Math.min(name.top, qty.top),
          left: name.left,
          width: qty.right - name.left,
          height: Math.max(name.bottom, qty.bottom) - Math.min(name.top, qty.top),
        },
      },
      index: Math.min(name.index, qty.index),
      top: Math.min(name.top, qty.top),
      bottom: Math.max(name.bottom, qty.bottom),
      left: name.left,
      right: qty.right,
    })),
  ];
}

// Groups boxes into horizontal bands: a new band starts where no box above
// reaches down to the next box's top.
function splitRows(boxes: Box[]): Box[][] {
  const rows: Box[][] = [];
  let bottom = -Infinity;
  for (const b of [...boxes].sort(byTop)) {
    if (rows.length === 0 || b.top >= bottom) rows.push([]);
    rows[rows.length - 1].push(b);
    bottom = rows[rows.length - 1].length === 1 ? b.bottom : Math.max(bottom, b.bottom);
  }
  return rows;
}

// Groups boxes left to right at vertical gutters no box crosses.
function xGroups(boxes: Box[]): Box[][] {
  const groups: Box[][] = [];
  let right = -Infinity;
  for (const b of [...boxes].sort(byLeft)) {
    if (groups.length === 0 || b.left >= right) groups.push([]);
    groups[groups.length - 1].push(b);
    right = groups[groups.length - 1].length === 1 ? b.right : Math.max(right, b.right);
  }
  return groups;
}

// Splits boxes at vertical gutters no box crosses, left to right. Only a real
// column layout counts: neighbouring groups must overlap vertically, so two
// stacked lines that merely don't overlap horizontally (a centered heading
// over a short left-aligned line) stay one column.
function splitColumns(boxes: Box[]): Box[][] {
  const cols = xGroups(boxes);
  const extent = (col: Box[]) => ({
    top: Math.min(...col.map((b) => b.top)),
    bottom: Math.max(...col.map((b) => b.bottom)),
  });
  for (let i = 1; i < cols.length; i++) {
    const a = extent(cols[i - 1]);
    const c = extent(cols[i]);
    if (a.top >= c.bottom || c.top >= a.bottom) return [boxes];
  }
  return cols;
}

/**
 * Column-aware reading order (a simplified XY-cut). Bands are merged
 * top-to-bottom into regions; a region ends where the next band would erase
 * its column gutter (a full-width title above or footer below the columns),
 * or where a multi-column band meets single-column text. Each region is then
 * read column by column, recursively; a region with no gutter is read
 * top-to-bottom, row by row. Returns visual lines: one box each, or the
 * single-line cells of one row (left to right) to be joined.
 */
function readingOrder(boxes: Box[]): Box[][] {
  const rows = splitRows(boxes);
  if (rows.length <= 1) return rows.flatMap(rowLines);
  const regions: Box[][] = [];
  let region: Box[] = [];
  for (const row of rows) {
    if (
      region.length > 0 &&
      splitColumns([...region, ...row]).length === 1 &&
      (splitColumns(region).length > 1 || splitColumns(row).length > 1)
    ) {
      regions.push(region);
      region = [];
    }
    region = [...region, ...row];
  }
  regions.push(region);
  if (regions.length > 1) return regions.flatMap(readingOrder);
  const cols = splitColumns(boxes);
  if (cols.length > 1) return cols.flatMap(readingOrder);
  return rows.flatMap(rowLines);
}

// One row: a `Label:` cell with its value beside it reads as one line;
// otherwise each horizontal group top-to-bottom (a tilted header overlapping
// its paragraph stays in vertical order). Other side-by-side cells stay
// separate lines — a header next to a button ("PRZYGOTOWANIE" · "DODAJ
// NOTATKĘ") must stay recognizable.
function rowLines(row: Box[]): Box[][] {
  const groups = xGroups(row);
  if (
    groups.length === 2 &&
    row.length === 2 &&
    row.every(isSingleLine) &&
    groups[0][0].block.text.trim().endsWith(':')
  ) {
    return [[groups[0][0], groups[1][0]]];
  }
  return groups.flatMap((g) => [...g].sort(byTop).map((b) => [b]));
}

// Diacritics Polish never uses, which ML Kit's Latin model returns for Polish
// letters ("lyžka", "mạka", "podawaị").
const OCR_CONFUSABLES: Record<string, string> = {
  'ž': 'ż', 'Ž': 'Ż', 'ạ': 'ą', 'Ạ': 'Ą', 'ẹ': 'ę', 'Ẹ': 'Ę', 'ị': 'j',
  'š': 'ś', 'Š': 'Ś', 'č': 'ć', 'Č': 'Ć', 'ň': 'ń', 'Ň': 'Ń', 'ö': 'ó', 'Ö': 'Ó', 'İ': 'i',
};
const OCR_CONFUSABLE_RE = new RegExp(`[${Object.keys(OCR_CONFUSABLES).join('')}]`, 'g');

// Typographic bullets at line start. Markdown markers (`-`, `*`, `1.`) are
// left alone; ML Kit keeps or drops these glyphs at random, so stripping them
// is the only way to get consistent lines.
const OCR_BULLET_RE = /^[ \t]*[•●▪◦‣∙·○■□►➢][ \t]*/gm;

// Capitals whose lowercase differs only in size — ML Kit confuses the two
// mid-word ("SZczypta", "cZOsnku").
const SIZE_ONLY_CAPITALS = 'COSUVWXZŻŹŚĆÓ';

// A dotted/dashed separator rule between list rows, read as a punctuation run
// ("*********", "- - - -"); three dots ("...") are kept.
const OCR_SEPARATOR_LINE = /^\s*[*·.•_\-–—=~](?:\s*[*·.•_\-–—=~]){3,}\s*$/;

// A checkbox in front of a list item (przepisy.pl), only before a short item
// so a sentence starting with the word "O" is kept.
const OCR_CHECKBOX_RE = /^[O0☐□◯][ \t]+(?=\p{L}[^\n]{0,40}$)/gmu;

/**
 * Cleans systematic ML Kit misreads from assembled OCR text before it reaches
 * `parsePastedRecipe` (SPEC.md §5.15 T3). Conservative and idempotent:
 * - non-Polish diacritics map to the Polish letter they stand for (ž → ż, …),
 * - typographic bullets (`•`, `●`, `·`, …) at line start are stripped,
 * - inside a word with at least two lowercase letters, size-only capitals after
 *   the first letter are lowercased (`cZOsnku` → `czosnku`); all-caps words
 *   and initial capitals are kept,
 * - a `|` right after a number reads as the litre unit (`1| bulionu` → `1 l`),
 * - a lone `9` after a gram-sized number reads as `g` (`150 9` → `150 g`),
 * - a checkbox read as `O`/`0`/`☐` before a short item is stripped,
 * - separator rules read as punctuation runs (`*********`) are dropped
 *   (`O schab bez kości` → `schab bez kości`).
 */
export function normalizeOcrText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !OCR_SEPARATOR_LINE.test(line))
    .join('\n')
    .replace(OCR_CONFUSABLE_RE, (ch) => OCR_CONFUSABLES[ch])
    .replace(OCR_BULLET_RE, '')
    .replace(/\p{L}+/gu, (word) => {
      if ((word.match(/\p{Ll}/gu) ?? []).length < 2) return word;
      return (
        word[0] +
        [...word.slice(1)]
          .map((ch) => (SIZE_ONLY_CAPITALS.includes(ch) ? ch.toLowerCase() : ch))
          .join('')
      );
    })
    .replace(/(\d) ?\|(?= )/g, '$1 l')
    .replace(/(\d{2,}) 9(?=[\s,.;)]|$)/gm, '$1 g')
    .replace(OCR_CHECKBOX_RE, '');
}
