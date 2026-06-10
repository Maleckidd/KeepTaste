// Pure Markdown import parser. Inverts the export format produced by
// utils/markdown.ts (see SPEC.md §5.6 / §5.8). No native imports — this module
// must stay testable in plain ts-jest.

export type ImportedRecipe = {
  title: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  ingredients: string;
  instructions: string;
  notes: string | null;
};

export type ParseResult =
  | { ok: true; cookbookName: string; recipes: ImportedRecipe[] }
  | { ok: false; error: string };

/**
 * Inverts formatTime from utils/markdown.ts. Accepts "45 min", "1 hr 30 min",
 * "2 hr", "1 hr 5 min". Surrounding whitespace is tolerated. Returns null for
 * anything that doesn't match (including the "—" placeholder and "-").
 */
export function parseTimeToMinutes(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  // "1 hr 30 min" / "2 hr" / "1 hr"
  const hrMatch = s.match(/^(\d+)\s*hr(?:\s+(\d+)\s*min)?$/);
  if (hrMatch) {
    const h = parseInt(hrMatch[1], 10);
    const m = hrMatch[2] ? parseInt(hrMatch[2], 10) : 0;
    return h * 60 + m;
  }

  // "45 min"
  const minMatch = s.match(/^(\d+)\s*min$/);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  return null;
}

function trimTrailingBlankLines(lines: string[]): string {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  // Also drop leading blank lines so a section body that starts with a blank
  // line (always the case, since the header is followed by '') is clean.
  while (out.length > 0 && out[0].trim() === '') {
    out.shift();
  }
  return out.join('\n');
}

function parseRecipeBlock(blockLines: string[]): ImportedRecipe {
  // First non-empty line is the "## Title" line.
  const titleLine = blockLines[0] ?? '';
  const title = titleLine.replace(/^##\s+/, '').trim();

  let prepTime: number | null = null;
  let cookTime: number | null = null;
  let servings: number | null = null;
  let ingredients = '';
  let instructions = '';
  let notes: string | null = null;

  // Walk the rest of the block. Lines before the first ### header may contain
  // the meta line; ### headers introduce section bodies.
  type Section = 'pre' | 'ingredients' | 'instructions' | 'notes';
  let section: Section = 'pre';
  let buffer: string[] = [];

  const flush = () => {
    if (section === 'ingredients') ingredients = trimTrailingBlankLines(buffer);
    else if (section === 'instructions') instructions = trimTrailingBlankLines(buffer);
    else if (section === 'notes') notes = trimTrailingBlankLines(buffer);
    buffer = [];
  };

  for (let i = 1; i < blockLines.length; i++) {
    const line = blockLines[i];

    if (line === '### Ingredients') {
      flush();
      section = 'ingredients';
      continue;
    }
    if (line === '### Instructions') {
      flush();
      section = 'instructions';
      continue;
    }
    if (line === '### Notes') {
      flush();
      section = 'notes';
      continue;
    }

    if (section === 'pre') {
      // Look for the meta line (Prep/Cook/Servings tokens). Other lines in the
      // pre-section are ignored.
      if (/\*\*(Prep|Cook|Servings):\*\*/.test(line)) {
        const tokens = line.split('|').map((t) => t.trim());
        for (const token of tokens) {
          const prep = token.match(/^\*\*Prep:\*\*\s*(.+)$/);
          if (prep) {
            prepTime = parseTimeToMinutes(prep[1]);
            continue;
          }
          const cook = token.match(/^\*\*Cook:\*\*\s*(.+)$/);
          if (cook) {
            cookTime = parseTimeToMinutes(cook[1]);
            continue;
          }
          const serv = token.match(/^\*\*Servings:\*\*\s*(\d+)/);
          if (serv) {
            servings = parseInt(serv[1], 10);
            continue;
          }
        }
      }
      continue;
    }

    buffer.push(line);
  }

  flush();

  return { title, prepTime, cookTime, servings, ingredients, instructions, notes };
}

export function parseCookbookMarkdown(content: string): ParseResult {
  // Normalize line endings first.
  const normalized = content.replace(/\r\n/g, '\n');

  if (normalized.trim() === '') {
    return { ok: false, error: 'The file is empty.' };
  }

  const lines = normalized.split('\n');

  // Cookbook name from the first "# " heading (not "## " / "### ").
  let cookbookName: string | null = null;
  let headingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+/.test(lines[i]) && !/^##/.test(lines[i])) {
      cookbookName = lines[i].replace(/^#\s+/, '').trim();
      headingIndex = i;
      break;
    }
  }

  if (cookbookName === null) {
    return {
      ok: false,
      error: 'No cookbook heading found. The file must start with a "# Name" line.',
    };
  }

  // Split everything after the heading into recipe blocks. A block starts at a
  // "## " line and runs until the next "## " line, a "---" line, or EOF.
  const recipes: ImportedRecipe[] = [];
  let current: string[] | null = null;

  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (/^##\s+/.test(line)) {
      if (current) recipes.push(parseRecipeBlock(current));
      current = [line];
      continue;
    }

    if (line.trim() === '---') {
      if (current) {
        recipes.push(parseRecipeBlock(current));
        current = null;
      }
      continue;
    }

    if (current) current.push(line);
  }

  if (current) recipes.push(parseRecipeBlock(current));

  return { ok: true, cookbookName, recipes };
}
