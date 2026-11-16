// Pure parser for the recipe → shopping list bridge (SPEC.md §5.12) and for the
// in-recipe ingredient check-off list (SPEC.md §5.4).
// No native imports, no DB access.

/**
 * One rendered line of a recipe's ingredients block:
 * - `heading` — a `#…` grouping label (never checkable, never a shopping item)
 * - `item` — a product line; `index` is its position among items only, so it
 *   lines up 1:1 with {@link parseIngredients} output.
 */
export type IngredientLine =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; text: string; index: number };

/**
 * Splits a recipe's raw ingredients Markdown into rendered lines:
 * - empty lines are skipped
 * - Markdown headings (`#...`, grouping labels) become `heading` lines with the
 *   `#` markers stripped
 * - leading list markers (`-`, `*`, `+`, `•`, `1.`, `1)`) are stripped
 * - surrounding `**…**` is stripped when it wraps the whole line
 * - everything else stays verbatim — quantities remain part of the name
 */
export function parseIngredientLines(text: string): IngredientLine[] {
  const lines: IngredientLine[] = [];
  let index = 0;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+/, '').trim();
      if (heading) lines.push({ kind: 'heading', text: heading });
      continue;
    }
    line = line.replace(/^(?:[-*+•]|\d+[.)])(?:\s+|$)/, '').trim();
    const bold = line.match(/^\*\*(.*)\*\*$/);
    if (bold) line = bold[1].trim();
    if (line) lines.push({ kind: 'item', text: line, index: index++ });
  }
  return lines;
}

/**
 * The shopping item candidates of an ingredients block — the `item` lines of
 * {@link parseIngredientLines}, in order of appearance.
 */
export function parseIngredients(text: string): string[] {
  const candidates: string[] = [];
  for (const line of parseIngredientLines(text)) {
    if (line.kind === 'item') candidates.push(line.text);
  }
  return candidates;
}

// Abbreviations that end in a period inside a product name ("2 szt. jajek",
// "ok. 1 kg ziemniaków"); a period after one splits only when a capital
// letter follows. Compared lower-cased.
const ABBREVIATIONS = new Set([
  'szt', 'ok', 'op', 'opak', 'łyż', 'łyżecz', 'łyżeczk', 'szkl', 'płask',
  'gr', 'np', 'ew', 'tj', 'pcs', 'pkg', 'tbsp', 'tsp', 'oz', 'lb', 'lbs',
  'approx',
]);

const isDigit = (ch: string | undefined) => !!ch && ch >= '0' && ch <= '9';
const isLetter = (ch: string | undefined) =>
  !!ch && ch.toLowerCase() !== ch.toUpperCase();
const isUpper = (ch: string | undefined) =>
  isLetter(ch) && ch === ch!.toUpperCase();

function nextNonSpace(text: string, from: number): string | undefined {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== ' ' && text[i] !== '\t') return text[i];
  }
  return undefined;
}

function wordBefore(text: string, end: number): string {
  let start = end;
  while (start > 0 && isLetter(text[start - 1])) start--;
  return text.slice(start, end).toLowerCase();
}

/**
 * Splits one pasted line into products at inline separators (SPEC.md §5.16):
 * `,` `;` `|` `•` and a sentence-ending `.`, all outside brackets.
 * - a `,` or `.` between two digits is a decimal ("2,5 kg", "1.5 l");
 * - a `.` right after a known abbreviation ("szt.", "ok.") splits only when
 *   a capital letter follows;
 * - empty pieces are dropped, list markers are not re-stripped.
 */
export function splitInlineProducts(line: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  const cut = (i: number) => {
    const piece = line.slice(start, i).trim();
    if (piece) pieces.push(piece);
    start = i + 1;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    if (depth > 0) continue;
    if (ch === ';' || ch === '|' || ch === '•') {
      cut(i);
    } else if (ch === ',') {
      if (!(isDigit(line[i - 1]) && isDigit(line[i + 1]))) cut(i);
    } else if (ch === '.') {
      if (isDigit(line[i - 1]) && isDigit(line[i + 1])) continue;
      // "…, 2. chleb": a number alone before the period is a list marker.
      if (/^\s*\d+$/.test(line.slice(start, i))) continue;
      const after = line[i + 1];
      // "Mleko.Chleb" or "e.g" — no space, keep unless the line ends here.
      if (after !== undefined && after !== ' ' && after !== '\t' && after !== '.') {
        continue;
      }
      if (ABBREVIATIONS.has(wordBefore(line, i)) && !isUpper(nextNonSpace(line, i + 1))) {
        continue;
      }
      cut(i);
    }
  }
  cut(line.length);
  return pieces;
}

/**
 * The products of a loose paste into a shopping list (SPEC.md §5.16): the
 * line-based {@link parseIngredientLines} items, each split further at inline
 * separators by {@link splitInlineProducts} — so "mleko, chleb; masło" works
 * as well as one product per line. Recipe ingredients (§5.12) stay line-based.
 */
export function parsePastedProducts(text: string): string[] {
  const products: string[] = [];
  for (const line of parseIngredientLines(text)) {
    if (line.kind !== 'item') continue;
    for (const piece of splitInlineProducts(line.text)) {
      // A piece may carry its own marker: "mleko • - chleb" or "**ser**".
      const clean = piece
        .replace(/^(?:[-*+]|\d+[.)])(?:\s+|$)/, '')
        .replace(/^\*\*(.*)\*\*$/, '$1')
        .trim();
      if (clean) products.push(clean);
    }
  }
  return products;
}
