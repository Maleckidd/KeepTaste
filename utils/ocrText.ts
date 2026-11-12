// Pure assembly of OCR text-recognition blocks into a single string
// (SPEC.md §5.15 mode T3, "Text assembly"). No native imports — the native
// recognition wrapper lives in utils/recipeOcr.ts and adapts its result into
// the OcrBlock shape below before calling here. Deterministic and testable.

import { isRecipeNoise } from './recipeImport';

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
 * - within a block, lines are `lines[].text` (falling back to `block.text`
 *   when `lines` is missing or empty); on the column-aware path, soft-wrapped
 *   lines are rejoined (`reflowLines`) — also across blocks, since ML Kit
 *   often returns a wrapped line's tail as its own block; on the y-sort
 *   fallback and for unframed blocks lines stay as read,
 * - whitespace-only lines are dropped,
 * - blocks are separated by a single `\n` (no blank line).
 */
export function ocrBlocksToText(blocks: OcrBlock[]): string {
  const hasTop = (b: OcrBlock): boolean =>
    b.frame != null && typeof b.frame.top === 'number';

  // The status bar goes before the layout is read: a clock on the left and a
  // battery on the right would pass for two columns. Only in the top row — a
  // "1:30" further down is a table's value.
  const tops = blocks.filter(hasTop).map((b) => b.frame!.top);
  const topRow = tops.length > 0 ? Math.min(...tops) : 0;
  const isStatusBar = (b: OcrBlock): boolean => {
    const lines = blockLines(b);
    return (
      hasTop(b) &&
      b.frame!.top <= topRow + 1.6 * (b.frame!.height ?? 0) &&
      lines.length > 0 &&
      lines.every((l) => CLOCK_LINE.test(l) || SCREEN_SIGNAL_LINE.test(l))
    );
  };
  const content = blocks.filter((b) => !isStatusBar(b));
  const framed = content.filter(hasTop);
  const unframed = content.filter((b) => !hasTop(b));
  const boxes = framed.map((block, index) => toBox(block, index));
  const lines: string[] = boxes.every((b): b is Box => b != null)
    ? flowEntries(readingOrder(fuseTableRows(boxes)))
    : framed
        .map((block, index) => ({ block, index }))
        .sort((a, b) => a.block.frame!.top - b.block.frame!.top || a.index - b.index)
        .flatMap((entry) => blockLines(entry.block));

  return [...lines, ...unframed.flatMap(blockLines)].join('\n');
}

function blockLines(block: OcrBlock): string[] {
  const source =
    block.lines && block.lines.length > 0
      ? block.lines.map((l) => l.text)
      : [block.text];
  return source.filter((line) => line.trim().length > 0);
}

// A list item or step at line start: typographic bullet, Markdown marker,
// "1." / "1)", "Krok 2" / "Step 2".
const LIST_START = /^(?:[•●▪◦‣∙·○■□►➢☐◯]|[-*+]\s|\d+[.)]\s|(?:krok|step)\s+\d)/iu;

// A numbered step ("1. Pokrój…") or a video chapter ("0:45 Podsmaż…") — it
// runs on until the next one.
const STEP_START = /^\d{1,2}[.)]\s|^\d{1,2}:\d{2}\s/;

// Words a quantity-less ingredient line starts with: measure words and pantry
// staples. A short lowercase tail under a full line is that line's wrapped end
// ("1,5 kg kwaśnych" / "jabłek") unless it opens like a new item ("sól").
const ITEM_START = new RegExp(
  '^(?:' +
    's[oó]l|sól|pieprz|cukier|olej|oliwa|woda|mas[łl]o|mleko|m[ąa]ka|dro[żz]d[żz]e|ocet|mi[óo]d|' +
    'jajk[oa]|ser|ry[żz]|kasza|makaron|bu[łl]ka|[śs]mietana|jogurt|' +
    'koperek|szczypiorek|natka|pietruszka|bazylia|oregano|tymianek|majeranek|cynamon|papryka|' +
    'czosnek|cebula|przyprawy|zio[łl]a|kminek|wanilia|kurkuma|imbir|chili|' +
    'szczypta|gar[śs][ćc]|odrobina|kilka|troch[ęe]|p[ęe]czek|z[ąa]bek|g[łl][óo]wka|listek|li[śs]cie|' +
    'ga[łl][ąa]zka|plaster|kostka|puszka|s[łl]oik|opakowanie|kawa[łl]ek|[łl]y[żz]k[ai]|[łl]y[żz]eczk[ai]|' +
    'szklank[ai]|opcjonalnie|ewentualnie|dodatkowo|oraz|plus|' +
    'salt|pepper|sugar|oil|water|butter|flour|milk|eggs?|garlic|onion|pinch|handful|optional' +
  ')(?![\\p{L}])',
  'iu'
);

// `parsePastedRecipe` flips ingredients → instructions on a longer line, and
// the flip is sticky — an item join must not cross it.
const MAX_ITEM_JOIN = 80;

// A line opening with an amount — wider than QTY_CELL, which needs a letter
// right after the number ("2-3 ząbki", "1 1/2 szklanki", "ok. 200 g").
const QTY_START = /^(?:(?:ok\.?|około|ca\.?)\s*)?[0-9½¼¾⅓⅔⅛]/i;

// A trailing word that leaves the phrase open ("smalcu lub" / "masła").
const FUNCTION_WORDS = new Set([
  'i', 'a', 'o', 'u', 'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'lub', 'oraz',
  'albo', 'czy', 'ani', 'że', 'przez', 'pod', 'nad', 'przy', 'bez', 'dla', 'ok.', 'około', 'np.',
  'and', 'or', 'with', 'of', 'the', 'an', 'to', 'in', 'for', 'on', 'at', 'until', 'into', 'from',
]);

const firstWord = (line: string): string => line.split(/\s+/)[0];
const wordCount = (line: string): number => line.split(/\s+/).length;
const isAllCaps = (line: string): boolean => /\p{L}/u.test(line) && line === line.toUpperCase();
const count = (line: string, ch: string): number => line.split(ch).length - 1;
const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Lines that must start a new output line whatever the geometry says.
function neverJoin(prev: string, next: string): boolean {
  return (
    LIST_START.test(next) ||
    STEP_START.test(next) ||
    // App chrome under a caption ("Zobacz wszystkie komentarze") is dropped by
    // the parser only while it is a line of its own. (Chrome that itself wraps
    // still joins its own tail: "…obserwuj @konto po" / "więcej!".)
    isRecipeNoise(next) ||
    prev.endsWith(':') ||
    next.endsWith(':') ||
    /^[\p{L} ]{1,25}:\s/u.test(next) ||
    !/[\p{L}\d]/u.test(prev) ||
    !/[\p{L}\d]/u.test(next) ||
    (isAllCaps(next) && !isAllCaps(prev)) ||
    // A heading under a finished paragraph.
    (/[.!?]$/.test(prev) && wordCount(next) <= 3 && !/[.!?,;]$/.test(next)) ||
    // A heading over its text: a few words without punctuation, then a capital.
    (wordCount(prev) <= 4 && /[\p{L}]$/u.test(prev) && !isOpenEnd(prev) &&
      !isAllCaps(prev) && /^\p{Lu}\p{Ll}/u.test(next))
  );
}

function isOpenEnd(line: string): boolean {
  const words = line.split(/\s+/);
  return (
    line.endsWith(',') ||
    /\s[-–—]$/.test(line) ||
    count(line, '(') > count(line, ')') ||
    // A list element cut after its amount ("…wołowiny, 1/2" / "cebuli").
    /,\s[0-9½¼¾⅓⅔⅛]+(?:[.,/][0-9]+)?$/.test(line) ||
    FUNCTION_WORDS.has(words[words.length - 1].toLowerCase())
  );
}

// One visual line with the geometry the reflow needs. `exact` — the line's own
// ML Kit frame; otherwise estimated from the block box (its longest line spans
// it, its height is shared evenly), which is too coarse to read indents from.
interface VLine {
  text: string;
  left: number;
  right: number;
  top: number;
  height: number;
  charW: number;
  exact: boolean;
}

// Null without a full block box — such a block cannot be reflowed.
function blockVLines(block: OcrBlock): VLine[] | null {
  const source: OcrLine[] =
    block.lines && block.lines.length > 0
      ? block.lines
      : block.text.split('\n').map((text) => ({ text }));
  const kept = source.filter((l) => l.text.trim().length > 0);
  const len = kept.map((l) => l.text.trim().length);
  const isFull = (f?: OcrBlockFrame): f is Required<OcrBlockFrame> =>
    f != null && typeof f.left === 'number' && typeof f.width === 'number' &&
    f.width > 0 && typeof f.height === 'number';
  if (kept.every((l) => isFull(l.frame))) {
    return kept.map((l, i) => {
      const f = l.frame as Required<OcrBlockFrame>;
      return {
        text: l.text, left: f.left, right: f.left + f.width, top: f.top,
        height: f.height, charW: f.width / len[i], exact: true,
      };
    });
  }
  const f = block.frame;
  if (!f || typeof f.left !== 'number' || typeof f.width !== 'number') return null;
  const left = f.left;
  const charW = f.width / Math.max(1, ...len);
  const height = (typeof f.height === 'number' ? f.height : 0) / Math.max(1, kept.length);
  return kept.map((l, i) => ({
    text: l.text, left, right: left + len[i] * charW, top: f.top + i * height,
    height, charW, exact: false,
  }));
}

/**
 * Rejoins a block's soft-wrapped visual lines into the lines the author wrote
 * (SPEC.md §5.15 T3) — see `reflowLines` for the rules. `margin` is the right
 * edge the text could reach; without a full box the lines come back unchanged.
 */
export function reflowBlockLines(block: OcrBlock, margin?: number): string[] {
  const lines = blockVLines(block);
  if (!lines) return blockLines(block);
  const f = block.frame!;
  const boxRight = (f.left ?? 0) + (f.width ?? 0);
  return reflowLines(lines, Math.max(margin ?? -Infinity, boxRight), Infinity);
}

/**
 * Rejoins soft-wrapped visual lines of one stretch of text (lines at normal
 * line spacing, in reading order) into the lines the author wrote. Precision
 * over recall: a false join corrupts an ingredient list (two items become one
 * check-off/shopping line), a missed join is just a line break the user
 * tidies in the review form.
 *
 * A line can only continue the previous one when that one reached the right
 * margin (the next word did not fit). Such runs are judged together: a run
 * that reads as prose — sentence punctuation, a break in mid-sentence, not
 * mostly quantity lines — is joined whole; elsewhere a line joins only after
 * an open end (comma, spaced dash, open bracket, trailing function word — and
 * not before a quantity), across end-of-line hyphenation, or inside a
 * numbered step. A whole parenthetical joins a line that holds a number or
 * ends open, whatever the margin (a header keeps its own line). List items,
 * steps, labels, headers and punctuation-only lines never join, and neither
 * does a line indented from the text's left edge: that is where ML Kit dropped
 * an emoji bullet or number, so it starts an item. A short lowercase tail
 * under a full line is its wrapped end unless it opens like an item of its
 * own, and lines set clearly larger than the body text (`bodyHeight`) are one
 * wrapped heading.
 */
function reflowLines(lines: VLine[], margin: number, bodyHeight: number): string[] {
  const raw = lines.map((l) => l.text);
  if (lines.length < 2) return raw;
  const t = raw.map((l) => l.trim());
  const edge = Math.max(margin, ...lines.map((l) => l.right));
  const full = (i: number): boolean =>
    lines[i].right + lines[i].charW * (1 + 1.2 * firstWord(t[i + 1]).length) > edge;

  // Hanging indents (a marker at the left edge, wrapped text under it) are the
  // opposite layout, so with markers in sight an indent means nothing.
  const lineH = median(lines.map((l) => l.height));
  const minLeft = Math.min(...lines.map((l) => l.left));
  const readIndents =
    lines.every((l) => l.exact) &&
    !lines.some((l, i) => l.left - minLeft <= 0.5 * lineH && LIST_START.test(t[i]));
  // A heading wrapped over two lines, often centered: both lines much larger
  // than the body text. Neither the margin nor the indent applies to it.
  const heading = (i: number): boolean =>
    lines[i - 1].exact && lines[i].exact &&
    Math.min(lines[i - 1].height, lines[i].height) >= 1.35 * bodyHeight &&
    !/[.!?:;]$/.test(t[i - 1]) && !LIST_START.test(t[i]) && !QTY_START.test(t[i]) &&
    isAllCaps(t[i - 1]) === isAllCaps(t[i]);
  const startsItem = (i: number): boolean =>
    !heading(i) &&
    (neverJoin(t[i - 1], t[i]) || (readIndents && lines[i].left - minLeft > lineH));

  // Runs of wrapped lines: each line but the last reached the margin.
  const run: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    run.push(full(i - 1) && !startsItem(i) ? run[i - 1] : run[i - 1] + 1);
  }
  const prose = new Map<number, boolean>();
  for (let start = 0; start < lines.length; ) {
    let end = start;
    while (end + 1 < lines.length && run[end + 1] === run[start]) end++;
    prose.set(run[start], isProse(t.slice(start, end + 1)));
    start = end + 1;
  }

  const out = [raw[0]];
  for (let i = 0; i + 1 < lines.length; i++) {
    const [prev, next] = [t[i], t[i + 1]];
    if (startsItem(i + 1)) {
      out.push(raw[i + 1]);
      continue;
    }
    const built = out[out.length - 1].trimEnd();
    const wrapped = run[i] === run[i + 1];
    const hyphen = wrapped && /\p{Ll}-$/u.test(prev) && /^\p{Ll}/u.test(next);
    const joined = hyphen ? built.slice(0, -1) + next : `${built} ${next}`;
    // The line as written, without the bullet in front of it.
    const start = built.trimStart().replace(/^[•●▪◦‣∙·○■□►➢☐◯*+-]\s*/, '');
    const tail =
      wrapped && /^\p{Ll}/u.test(next) && !ITEM_START.test(next) &&
      ((QTY_START.test(start) && wordCount(next) <= 2) ||
        (prev.length >= 25 && wordCount(next) === 1));
    // A capitals title wrapped onto a second line ("… PEANUT BUTTER" /
    // "COOKIES (makes 12)"); a capitals header is too short to reach the margin.
    // The account name a caption opens with is not part of the title.
    const capsWrap =
      wrapped && wordCount(prev) >= 2 && isAllCaps(prev.replace(/^@?[a-z0-9._]{3,30}\s+/, '')) &&
      isAllCaps(next.replace(/\([^()]*\)/g, ''));
    const itemJoin =
      hyphen ||
      tail ||
      capsWrap ||
      // Not on reaching the margin: boxes hug the text, so a short header over
      // its parenthetical ("Składniki" / "(na 4 porcje)") always looks full.
      (/^\([^()]*\)[.,;]?$/.test(next) && (/\d/.test(prev) || isOpenEnd(prev))) ||
      (wrapped && isOpenEnd(prev) && !QTY_START.test(next));
    // An inline list under its label ("Potrzebujesz: 2 tortille, …") is one
    // line however long: the parser reads the label, not the length.
    // So is a line opening with an amount: the parser's prose rule skips those.
    const label = /^[\p{L} ]{1,25}:\s/u.test(start);
    const capped = !label && !QTY_START.test(start);
    const flows =
      heading(i + 1) ||
      (wrapped &&
        (prose.get(run[i]) || STEP_START.test(start) || (label && count(built, ',') >= 2)));
    if ((itemJoin && (!capped || joined.length <= MAX_ITEM_JOIN)) || flows) {
      out[out.length - 1] = joined;
    } else {
      out.push(raw[i + 1]);
    }
  }
  return out;
}

// A run of wrapped lines that reads as a paragraph, not as list items that
// happen to fill the column: it has sentence punctuation, breaks somewhere in
// mid-sentence, and is not mostly quantity/bullet lines. Two lines need a
// first line long enough not to be an ingredient name.
function isProse(t: string[]): boolean {
  if (t.length < 2) return false;
  const items = t.filter((l) => (QTY_START.test(l) && !STEP_START.test(l)) || /^[•●▪◦‣∙·○■□►➢☐◯]|^[-*+]\s/.test(l));
  // A long line wrapped before a number ("…wymieszaj krótko i piecz" / "45
  // minut w 175°C.") is a sentence, not an item under an item.
  const wrappedBeforeNumber =
    t.length === 2 && items.length === 1 && items[0] === t[1] &&
    /[.!?]$/.test(t[1]) && t[0].length >= 45;
  if (items.length * 2 >= t.length && !wrappedBeforeNumber) return false;
  if (!t.some((l) => /[.!?…]$/.test(l) || /[.!?]\s+\p{Lu}/u.test(l))) return false;
  const midSentence = t.some(
    (l, i) => i + 1 < t.length && !/[.!?:;…]$/.test(l) && /^[\p{Ll}\d(]/u.test(t[i + 1])
  );
  if (t.length === 2) {
    return t[0].length >= 45 || /[.!?]\s+\p{Lu}/u.test(t[0]) || (t[0].length >= 25 && midSentence);
  }
  const body = t.slice(0, -1);
  const mean = body.reduce((sum, l) => sum + l.length, 0) / body.length;
  return midSentence && mean >= 18;
}

// Two lines at normal line spacing, in the same size and at the same left
// edge (give or take an indent) belong to one stretch of text, whichever
// blocks ML Kit put them in.
function chains(group: VLine[], next: VLine): boolean {
  const prev = group[group.length - 1];
  const h = Math.max(prev.height, next.height);
  // A box hugs its glyphs: a line without ascenders ("pan.") starts lower, one
  // without descenders ends higher — the smaller of the two pitches is true.
  const pitch = Math.min(
    next.top - prev.top,
    next.top + next.height - (prev.top + prev.height)
  );
  const minLeft = Math.min(...group.map((l) => l.left));
  return (
    h > 0 &&
    next.top - prev.top >= 0.4 * h &&
    pitch <= 1.85 * h &&
    h <= 1.6 * Math.min(prev.height, next.height) &&
    Math.abs(next.left - minLeft) <= 2.5 * h
  );
}

// Emoji keycaps (1️⃣ 2️⃣ 3️⃣) in front of steps read as bare numbers. Lines that
// open "1 Xxx", "2 Xxx", … in order are those steps: they get their dot back,
// so they read — and parse — as a numbered list.
function numberKeycapSteps(lines: VLine[]): void {
  const KEYCAP = /^(\d{1,2})\s+(?=\p{Lu}\p{Ll})/u;
  // A step is a sentence; "1 Cebula", "2 Marchewki" is a list of names.
  const steps = lines.filter((l) => {
    const text = l.text.trim();
    return KEYCAP.test(text) && (text.length >= 25 || /[.!?]$/.test(text));
  });
  let expected = 1;
  const inOrder = steps.filter((l) => {
    if (Number(KEYCAP.exec(l.text.trim())![1]) !== expected) return false;
    expected++;
    return true;
  });
  if (inOrder.length < 2) return;
  for (const l of inOrder) l.text = l.text.trim().replace(KEYCAP, '$1. ');
}

// Reading-order entries → output lines. Single blocks are regrouped into
// stretches of text and reflowed against the right edge of the text sharing
// their left edge in the same column — in a screenshot that is the caption or
// chat bubble, not the status bar far to the right. Same-row cells (a table
// row, `Label:` + value) are one line and end a stretch.
function flowEntries(entries: Box[][]): string[] {
  const out: string[] = [];
  const linesOf = new Map<Box, VLine[]>();
  for (const b of entries.flat()) linesOf.set(b, blockVLines(b.block) ?? []);
  const all = entries.flatMap((entry) => (entry.length === 1 ? linesOf.get(entry[0])! : []));
  numberKeycapSteps(all);
  const heights = [...linesOf.values()].flat().map((l) => l.height);
  const bodyHeight = heights.length > 0 ? median(heights) : Infinity;
  const leafLines = new Map<Box[], VLine[]>();
  let group: VLine[] = [];
  let groupLeaf: Box[] | undefined;
  const flush = () => {
    if (group.length === 0) return;
    const pool = groupLeaf ? leafLines.get(groupLeaf) ?? [] : [];
    const lineH = median(group.map((l) => l.height));
    const minLeft = Math.min(...group.map((l) => l.left));
    const margin = Math.max(
      ...group.map((l) => l.right),
      ...pool.filter((l) => l.left >= minLeft - lineH && l.left <= minLeft + 2.5 * lineH).map((l) => l.right)
    );
    out.push(...reflowLines(group, margin, bodyHeight));
    group = [];
  };
  for (const entry of entries) {
    if (entry.length > 1) {
      flush();
      const row = entry.map((b) => blockLines(b.block).join(' ')).join(' ');
      if (row.trim().length > 0) out.push(row);
      continue;
    }
    const [box] = entry;
    const lines = linesOf.get(box)!;
    if (lines.length === 0) continue;
    if (box.leaf && !leafLines.has(box.leaf)) {
      leafLines.set(box.leaf, box.leaf.flatMap((b) => linesOf.get(b) ?? []));
    }
    if (group.length > 0 && (box.leaf !== groupLeaf || !chains(group, lines[0]))) flush();
    groupLeaf = box.leaf;
    group.push(...lines);
  }
  flush();
  return out;
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
  /** The boxes of the reading-order column (XY-cut leaf) the box sits in. */
  leaf?: Box[];
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
// column layout counts: neighbouring groups must hold text side by side — some
// box of one level with some box of the other. Stacked lines that merely
// don't overlap horizontally stay one column: a centered heading over a short
// left-aligned line, or a chat's right-aligned bubble between left-aligned
// ones (it sits within their span, yet beside none of them).
function splitColumns(boxes: Box[]): Box[][] {
  const cols = xGroups(boxes);
  const beside = (a: Box, c: Box): boolean =>
    Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) >
    0.25 * Math.min(a.bottom - a.top, c.bottom - c.top);
  for (let i = 1; i < cols.length; i++) {
    if (!cols[i - 1].some((a) => cols[i].some((c) => beside(a, c)))) return [boxes];
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
  if (rows.length <= 1) return leaf(rows);
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
  return leaf(rows);
}

// A leaf of the XY-cut is one column of text: its boxes share the right
// margin soft-wrapped lines are judged against (see `flowEntries`).
function leaf(rows: Box[][]): Box[][] {
  const all = rows.flat();
  for (const b of all) b.leaf = all;
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
const OCR_CHECKBOX_RE =
  /^(?:[O0☐□◯][ \t]+(?=[\p{L}\d][^\n]{0,40}$)|[O☐□◯](?=\d)|D[ \t]+(?=\p{Ll}[^\n]{0,40}$))/gmu;

// The phone's status bar: a clock, and the signal with the battery ("5G I
// 82%"). The network name is matched as printed and only with a percentage —
// "3g soli" and "70%" are recipe lines.
const CLOCK_LINE = /^\s*\d{1,2}:\d{2}\s*$/;
const SCREEN_SIGNAL_LINE = /^\s*(?:5G|4G|LTE|3G|H\+|VoLTE|Wi-?Fi)(?![\p{L}\d]).{0,10}\d{1,3}\s?%\s*$/u;
// A chat message's send time: with delivery ticks (read as "✔"/"vv"), or bare
// at a time of day — "1:30" is a duration, and a table's value.
const TICKED_TIME_LINE = /^\s*\d{1,2}:\d{2}\s*[✓✔vV/]{1,3}\s*$/;
const TIME_OF_DAY_LINE = /^\s*(?:0?[6-9]|1\d|2[0-3]):[0-5]\d\s*$/;
const TICKED_TIME_TAIL = /\s\d{1,2}:\d{2}\s*[✓✔]{1,3}\s*$/;
// …and at the end of the message's last line ("…koperek 17:15").
const CHAT_TIME_TAIL = /(\S+)[ \t]+(?:0?[6-9]|1\d|2[0-3]):[0-5]\d(?:[ \t]*[✓✔vV]{1,3})?[ \t]*$/gm;
// Words a time of the recipe's own follows: "Piecz do 18:30", "o 17:00".
const TIME_LEAD = /^(o|at|do|od|na|po|przed|godz\.?|godzina|godzinie|oko[łl]o|ok\.?|until|till|by|from|before|after|:)$/i;

// ML Kit's Latin model reads the Polish "ł" as "t" or "l" ("tyżka", "masto",
// "pót"), and drops the tail of "ą"/"ś"/"ż". There is no dictionary on the
// device, so only cooking words whose misread form is not a Polish word are
// put back: [letters before, the misread letter, letters after, the right one].
const L = '[tl]';
const END = '(?![\\p{L}])';
const POLISH_MISREADS: [string, string, string, string][] = [
  ['', L, 'y[żz](?:k|ecz|ek)', 'ł'], // łyżka, łyżeczka, łyżek
  ['ły', 'z', '(?:k|ecz|ek)', 'ż'],
  ['pó', 't', END, 'ł'], // pół
  ['pó[łl]t', L, 'ust', 'ł'], // półtłusty
  ['mas', L, `(?:o|a|em|u)${END}`, 'ł'], // masło
  ['p', L, 'atk(?:i|ów|ami|ach)', 'ł'], // płatki
  ['jab', L, '(?:k|ek|ecz|uszk)', 'ł'], // jabłka
  ['kie', L, 'bas', 'ł'], // kiełbasa
  ['bu', L, `k[aięą]\\s+tart`, 'ł'], // bułka tarta
  ['bu', 'l', `k[aięą]${END}`, 'ł'],
  ['bu', L, 'ecz[kc]', 'ł'],
  ['bia', L, `(?:k|y(?:ch|m)?${END}|a${END}|e(?:go|j)?${END}|ą${END})`, 'ł'], // białko, biały
  ['[żz]ó', L, 't', 'ł'], // żółtko
  ['', 'z', 'ółt', 'ż'],
  ['s', L, 'odk', 'ł'], // słodka
  ['g', L, '(?:adk|ówk|ęb)', 'ł'], // gładki, główka, głęboki
  ['t', L, '(?:uszcz|ucz|ust)', 'ł'], // tłuszcz, tłuczek, tłusty
  ['kawa', L, `(?:ek|k[aiu]|ków|kami|kiem)${END}`, 'ł'], // kawałek (not "kawalkada")
  ['wa', 't', `(?:ki${END}|kiem${END}|ków${END}|kuj|kowa)`, 'ł'], // wałki
  ['ca', 't', `(?:y|a|e|ą|o[śs][ćc]|ego|ej|ym|ych)${END}`, 'ł'], // cały
  ['ma', 't', 'ym(?=\\s+ogni)', 'ł'], // (na) małym ogniu — "matym" alone is a form of "mat"
  ['dojrza', L, '(?=[yaei])', 'ł'], // dojrzałe
  ['w', L, '(?:osk|ó[żz]|o[żz]y)', 'ł'], // włoski, włóż
  ['(?:wy|prze|roz|na|u|do|po|od|za)', L, '(?:ó[żz]|o[żz]y)', 'ł'], // wyłóż, przełożyć
  ['(?:wy|w|po|do)', L, 'ącz', 'ł'], // wyłącz, połącz
  ['sa', L, 'at', 'ł'], // sałata
  ['zio', L, `(?:a|ami|ach|owy|owe)${END}`, 'ł'], // zioła
  ['migda', L, '', 'ł'], // migdały
  ['po', 't', `(?:owę${END}|ówk)`, 'ł'], // połowę, połówki ("potowy" is a word)
  ['sto', L, 'ow', 'ł'], // (łyżka) stołowa
  ['(?:s|wy|o)?ch', L, 'od', 'ł'], // schłodź, chłodny
  ['(?:o|wy|prze)?p', L, 'ucz', 'ł'], // opłucz
  ['', L, 'oso[śs]', 'ł'], // łosoś
  ['', L, 'opatk', 'ł'], // łopatka
  ['sk', L, 'adnik', 'ł'], // składniki
  ['', 's', '(?:mietan|wie[żz]|liwk)', 'ś'], // śmietana, świeży, śliwki
  ['m', 'a', `kę${END}`, 'ą'], // mąkę (never "make")
  ['m', 'a', 'ki\\s+(?:pszenn|ziemniacz|tortow|żytni|kukurydz|ryżow|orkiszow|gryczan|krupczat)', 'ą'],
];
// The same letters dropped outright, or read as a capital "I".
const POLISH_DROPPED: [RegExp, string][] = [
  [/(^|[^\p{L}])I?y[żz](?=k|ecz|ek)/gmu, '$1łyż'], // (ł)yżka — no Polish word opens "yż"
  [/(^|[^\p{L}])kiebas/gimu, '$1kiełbas'],
  [/(^|[^\p{L}])maym(?=\s+ogni)/gimu, '$1małym'],
  [/(^|[^\p{L}])Iub(?![\p{L}])/gmu, '$1lub'],
];
const POLISH_MISREAD_RES = POLISH_MISREADS.map(
  ([before, wrong, after, right]): [RegExp, string] => [
    new RegExp(`(^|[^\\p{L}])(${before})(${wrong})(${after})`, 'gimu'),
    right,
  ]
);

/**
 * Cleans systematic ML Kit misreads from assembled OCR text before it reaches
 * `parsePastedRecipe` (SPEC.md §5.15 T3). Conservative and idempotent:
 * - the status bar is dropped (a clock on the first line, the signal/battery
 *   line) and, in a chat — a time with delivery ticks, or two bare times of
 *   day — the send times: on lines of their own and at the end of a message,
 * - non-Polish diacritics map to the Polish letter they stand for (ž → ż, …),
 * - typographic bullets (`•`, `●`, `·`, …) at line start are stripped,
 * - inside a word with at least two lowercase letters, size-only capitals after
 *   the first letter are lowercased (`cZOsnku` → `czosnku`); all-caps words
 *   and initial capitals are kept,
 * - a `0` between letters reads as the letter (`p0syp`, `PRZYG0TOWANIE`),
 * - Polish cooking words with a misread `ł`/`ś`/`ą`/`ż` are put back
 *   (`tyżka` → `łyżka`, `masto` → `masło`, `pót` → `pół`),
 * - a space swallowed before the conjunction `i` is restored where the word
 *   cannot end that way (`śmietankęi` → `śmietankę i`, `oczkachi`),
 * - a `|` right after a number reads as the litre unit (`1| bulionu` → `1 l`),
 * - a lone `9` after a gram-sized number reads as `g` (`150 9` → `150 g`),
 * - a list dash or an amount glued to what follows is spaced (`-1 marchewka`,
 *   `1łyżeczka`),
 * - labels a `|` separated, with the bar read as `I`, go one per line
 *   (`Czas: 30 min I Porcje: 4`),
 * - a checkbox read as `O`/`0`/`☐` before a short item is stripped,
 * - separator rules read as punctuation runs (`*********`) are dropped
 *   (`O schab bez kości` → `schab bez kości`).
 */
export function normalizeOcrText(text: string): string {
  const lines = text.split('\n');
  const firstLine = lines.findIndex((l) => l.trim().length > 0);
  // A chat: a send time with delivery ticks, or bare send times minutes apart
  // (a baking schedule's "08:00" … "20:00" are hours apart).
  const minutes = lines
    .filter((l) => TIME_OF_DAY_LINE.test(l))
    .map((l) => l.trim().split(':').map(Number))
    .map(([h, m]) => h * 60 + m);
  const isChat =
    lines.some((l) => TICKED_TIME_LINE.test(l) || TICKED_TIME_TAIL.test(l)) ||
    (minutes.length >= 2 && Math.max(...minutes) - Math.min(...minutes) <= 120);
  let out = lines
    .filter(
      (line, i) =>
        !OCR_SEPARATOR_LINE.test(line) &&
        !SCREEN_SIGNAL_LINE.test(line) &&
        !TICKED_TIME_LINE.test(line) &&
        !(CLOCK_LINE.test(line) && i === firstLine) &&
        !(isChat && TIME_OF_DAY_LINE.test(line))
    )
    .join('\n')
    .replace(CHAT_TIME_TAIL, (whole, last: string) => (isChat && !TIME_LEAD.test(last) ? last : whole))
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
    .replace(/(\p{L})0(?=\p{L})/gu, (_, before: string) =>
      before + (before === before.toLowerCase() ? 'o' : 'O')
    );
  for (const [re, to] of POLISH_DROPPED) out = out.replace(re, to);
  for (const [re, right] of POLISH_MISREAD_RES) {
    out = out.replace(re, (_, lead: string, before: string, wrong: string, after: string) => {
      const upper = wrong !== wrong.toLowerCase();
      return lead + before + (upper ? right.toUpperCase() : right) + after;
    });
  }
  return out
    .replace(
      /(\p{L}{2,}[ęąó]|\p{L}{3,}ach|\p{L}{3,}owe|\p{L}{2,}(?:[bcdfghjklłmnprstwzżśćń]|[kg]i)em)i(?![\p{L}])/gu,
      '$1 i'
    )
    .replace(/(\d)[oO](?=\s?°)/g, '$10')
    .replace(/(^|\s)(\d)([1-9]\/[2-9])(?=\s)/gm, '$1$2 $3')
    .replace(/^([ \t]*)-[ \t]*\n(?=[ \t]*\S)/gm, '$1- ')
    .replace(/^[ \t]*\.[ \t]+(?=\d)/gm, '')
    .replace(/^[ \t]*\p{L}(?=[½¼¾⅓⅔⅛])/gmu, '')
    .replace(/^[\dOo@©®][ \t]+(?=\p{Lu}[\p{L} ]{1,20}:\s)/gmu, '')
    .replace(/(\d) ?\|(?= )/g, '$1 l')
    .replace(/(\d{2,}) 9(?=[\s,.;)]|$)/gm, '$1 g')
    .replace(/^([ \t]*)-(?=\d)/gm, '$1- ')
    .replace(/(\d)(\p{Ll}{4,})/gu, '$1 $2')
    .replace(/[ \t]+[I|][ \t]+(?=\p{Lu}[\p{L} ]{1,25}:)/gu, '\n')
    .replace(/^(.*:\s.*\S)[ \t]+[I|][ \t]*$/gm, '$1')
    .replace(OCR_CHECKBOX_RE, '');
}
