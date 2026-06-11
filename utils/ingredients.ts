// Pure parser for the recipe → shopping list bridge (SPEC.md §5.12).
// No native imports, no DB access.

/**
 * Splits a recipe's raw ingredients Markdown into shopping item candidates,
 * one per content line:
 * - empty lines and Markdown headings (`#...`, grouping labels) are skipped
 * - leading list markers (`-`, `*`, `+`, `•`, `1.`, `1)`) are stripped
 * - surrounding `**…**` is stripped when it wraps the whole line
 * - everything else stays verbatim — quantities remain part of the name
 */
export function parseIngredients(text: string): string[] {
  const candidates: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    line = line.replace(/^(?:[-*+•]|\d+[.)])(?:\s+|$)/, '').trim();
    const bold = line.match(/^\*\*(.*)\*\*$/);
    if (bold) line = bold[1].trim();
    if (line) candidates.push(line);
  }
  return candidates;
}
