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
