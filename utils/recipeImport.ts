// Pure parsers for single-recipe import (SPEC.md §5.15). No native imports,
// no network, no DB. The only native part lives in utils/recipeImportFetch.ts.
import { parsePositiveInt } from './numeric';

/**
 * Parses an ISO-8601 duration string into total minutes (hours + minutes).
 * Seconds and the date part (days etc.) are dropped. Only accepts strings
 * matching the strict ISO duration shape; anything else (numbers, plain text,
 * empty) → null. A zero-minute total → null (no value).
 */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  // PnDTnHnMnS — date part optional, at least one time component required.
  const match = /^P(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const total = hours * 60 + minutes;
  return total >= 1 ? total : null;
}

export interface ParsedRecipe {
  title?: string;
  prepTime?: number | null;
  cookTime?: number | null;
  servings?: number | null;
  ingredients?: string;
  instructions?: string;
}

type JsonLdNode = Record<string, unknown>;

function typeIncludesRecipe(node: JsonLdNode): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type === 'Recipe';
  if (Array.isArray(type)) return type.includes('Recipe');
  return false;
}

/** Flattens a JSON-LD value into a list of candidate objects in document order. */
function collectCandidates(parsed: unknown): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      const node = value as JsonLdNode;
      out.push(node);
      if (Array.isArray(node['@graph'])) {
        (node['@graph'] as unknown[]).forEach(visit);
      }
    }
  };
  visit(parsed);
  return out;
}

function mapInstructions(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      lines.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const node = item as JsonLdNode;
    if (Array.isArray(node.itemListElement)) {
      // HowToSection — flatten its steps.
      for (const step of node.itemListElement as unknown[]) {
        if (step && typeof step === 'object') {
          const text = (step as JsonLdNode).text;
          if (typeof text === 'string') lines.push(text);
        }
      }
      continue;
    }
    if (typeof node.text === 'string') lines.push(node.text);
  }
  return lines.join('\n');
}

function mapYield(value: unknown): number | null {
  let raw = value;
  if (Array.isArray(raw)) raw = raw[0];
  if (raw === undefined || raw === null) return null;
  return parsePositiveInt(String(raw));
}

function mapRecipe(node: JsonLdNode): ParsedRecipe {
  const result: ParsedRecipe = {};
  if (typeof node.name === 'string') result.title = node.name;

  const ingredients = node.recipeIngredient;
  if (Array.isArray(ingredients)) {
    result.ingredients = ingredients.filter((i) => typeof i === 'string').join('\n');
  }

  const instructions = mapInstructions(node.recipeInstructions);
  if (instructions) result.instructions = instructions;

  result.prepTime = parseIsoDuration(node.prepTime);
  result.cookTime = parseIsoDuration(node.cookTime);
  result.servings = mapYield(node.recipeYield);

  return result;
}

/**
 * Extracts the first Schema.org Recipe from a page's JSON-LD blocks, in
 * document (then within-block) order. Returns null if no Recipe is found.
 */
export function parseRecipeJsonLd(html: string): ParsedRecipe | null {
  if (!html) return null;
  const blockRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const candidates = collectCandidates(parsed);
    const recipe = candidates.find(typeIncludesRecipe);
    if (recipe) return mapRecipe(recipe);
  }
  return null;
}

// ----- Pasted-text parsing (SPEC §5.15) -----
//
// Real copied blog text is far messier than a clean header-delimited recipe:
// nutrition tables, author prose, UI buttons, image alt-text, ingredient
// name/amount on separate lines, titles that appear late, and no reliable
// "Instructions" header. This parser is a best-effort, deterministic (no AI)
// heuristic tuned on real samples. It degrades gracefully — when no structure
// is recognized it falls back to dumping the body into instructions.

export interface ParsedPastedRecipe {
  title?: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  ingredients: string;
  instructions: string;
  notes: string;
}

const FRACTION = '0-9¼½¾⅓⅔⅛⅜⅝⅞';

// Pure site/UI chrome and nutrition-fact lines — dropped (conservative list).
const NOISE_EXACT = new Set([
  'udostępnij przepis', 'udostepnij przepis', 'zapisz przepis', 'zapisz przepis w pdf',
  'zapisz', 'skomentuj przepis', 'dodaj do ulubionych', 'dodaj notatkę', 'dodaj notatke',
  'dodaj do listy zakupów', 'dodaj komentarz', 'dodaj komentarza', 'drukuj', 'drukuj przepis',
  'wydrukuj', 'wydrukuj przepis', 'oceń przepis', 'oceń', 'ocen', 'kopiuj', 'skopiuj',
  'ukryj zdjęcia', 'ukryj zdjecia', 'pokaż zdjęcia', 'pokaz zdjecia', 'komentarze', 'komentarz',
  'video', 'wideo', 'wartość energetyczna', 'wartosc energetyczna', 'wartość odżywcza',
  'węglowodany', 'weglowodany', 'białko', 'bialko', 'tłuszcze', 'tluszcze',
  'w tym cukry', 'w 100 g', 'w 100g',
]);
const NOISE_PREFIX = [
  'ilość lajków', 'ilosc lajkow', 'dieta:', 'hity kwestii smaku', 'średnia ', 'srednia ',
  'nutrition', 'wartość energetyczna', 'wartosc energetyczna',
];

function isNoise(line: string): boolean {
  const n = line.toLowerCase().replace(/[:!]+$/, '').trim();
  if (NOISE_EXACT.has(n)) return true;
  if (NOISE_PREFIX.some((p) => n.startsWith(p))) return true;
  if (/^[0-9]+([.,][0-9]+)?\s*kcal$/.test(n)) return true; // "186 kcal"
  if (/^[0-9]+([.,][0-9]+)?\s*\/\s*[0-9]+/.test(n)) return true; // rating "4.8 / 5 (…)"
  return false;
}

// A line that is only a quantity (number/fraction + optional known unit).
const PURE_QUANTITY = new RegExp(
  `^[${FRACTION}]+([.,/][0-9]+)?\\s*` +
    '(g|kg|dag|dkg|ml|l|szt\\.?|sztuk[aęi]?|łyżk[aęi]|łyżeczk[aęi]|szklank[aęi]|' +
    'szczypt[aęy]|opakowani[ae]|ząbk[aiów]*|plasterk?[aiów]*|garść|garści|kostk[aęi]|' +
    'kromk[aęi]|puszk[aęi]|porcj[aęi]?)?\\.?$',
  'i'
);

function isPureQuantity(line: string): boolean {
  return PURE_QUANTITY.test(line.trim());
}

function firstInt(s: string): number | null {
  const m = /(\d+)/.exec(s);
  return m ? parsePositiveInt(m[1]) : null;
}

// Total minutes from a free-form duration string ("1 godz 30 min", "30 minut").
function extractMinutes(s: string): number | null {
  let total = 0;
  let found = false;
  const h = /(\d+)\s*(godzin\w*|godz\.?|\bh\b)/i.exec(s);
  if (h) { total += parseInt(h[1], 10) * 60; found = true; }
  const m = /(\d+)\s*(minut\w*|min\.?|\bm\b)/i.exec(s);
  if (m) { total += parseInt(m[1], 10); found = true; }
  if (!found) {
    const n = /(\d+)/.exec(s);
    if (n) { total = parseInt(n[1], 10); found = true; }
  }
  return found && total >= 1 ? total : null;
}

const PASTE_INGREDIENT_MAIN = new Set(['składniki', 'skladniki', 'ingredients']);
const PASTE_STEP_HEADERS = new Set([
  'przygotowanie', 'sposób przygotowania', 'sposob przygotowania', 'sposób wykonania',
  'sposob wykonania', 'wykonanie', 'sposób przyrządzania', 'instrukcje', 'kroki',
  'instructions', 'method', 'steps', 'directions', 'preparation',
]);
const PASTE_NOTES_HEADERS = new Set([
  'wskazówki', 'wskazowki', 'wskazówka', 'rady/porady', 'rady i porady', 'porada',
  'porady', 'rada', 'uwagi', 'tip', 'tips', 'note', 'notes',
]);

type PasteHeader =
  | { kind: 'ingredients-main' }
  | { kind: 'ingredients-group'; label: string }
  | { kind: 'instructions' }
  | { kind: 'instructions-title' } // e.g. "Przepis i sposób przygotowania na:" — next line is the dish title
  | { kind: 'notes' };

function classifyPasteHeader(line: string): PasteHeader | null {
  const lower = line.trim().replace(/:$/, '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.startsWith('przepis') && / na$/.test(lower)) return { kind: 'instructions-title' };
  if (PASTE_INGREDIENT_MAIN.has(lower)) return { kind: 'ingredients-main' };
  const grp = /^sk[łl]adniki na (.+)$/.exec(lower);
  if (grp) return { kind: 'ingredients-group', label: grp[1] };
  if (PASTE_STEP_HEADERS.has(lower)) return { kind: 'instructions' };
  if (PASTE_NOTES_HEADERS.has(lower)) return { kind: 'notes' };
  return null;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function trimBlankEdges(arr: string[]): string {
  let start = 0;
  let end = arr.length;
  while (start < end && !arr[start].trim()) start++;
  while (end > start && !arr[end - 1].trim()) end--;
  return arr.slice(start, end).join('\n');
}

// Merge a pure-quantity line onto the previous ingredient name ("ryż do sushi"
// + "250 g" → "ryż do sushi – 250 g"). Only when the previous line is a plain
// name (no digit, not a heading/bullet). Returns true if merged.
function tryMergeQuantity(parts: string[], line: string): boolean {
  if (!isPureQuantity(line)) return false;
  let j = parts.length - 1;
  while (j >= 0 && parts[j].trim() === '') j--;
  if (j < 0) return false;
  const prev = parts[j];
  if (/^[#\-*•]/.test(prev.trim())) return false;
  if (/\d/.test(prev)) return false;
  parts[j] = `${prev.trim()} – ${line.trim()}`;
  return true;
}

/**
 * Best-effort heuristic split of pasted recipe text into title / times /
 * servings / ingredients / instructions / notes (SPEC §5.15). Deterministic,
 * conservative: when a line can't be confidently classified it is kept (not
 * dropped), and with no recognized structure the body falls back to
 * instructions. Author tips (Wskazówki / Rady-porady) route to notes.
 */
export function parsePastedRecipe(text: string): ParsedPastedRecipe {
  const lines = text.split(/\r?\n/);
  const consumed = new Array(lines.length).fill(false);

  // --- metadata pass: prep/cook/servings from labeled lines (removed from body) ---
  let prepTime: number | null = null;
  let cookTime: number | null = null;
  let servings: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      prepTime === null &&
      (/czas\s+(przygotowania|szykowania)/.test(lower) ||
        /^\s*(prep|preparation)(\s*time)?\s*[:\-–]?\s*\d/.test(lower))
    ) {
      prepTime = extractMinutes(lines[i]); consumed[i] = true; continue;
    }
    if (
      cookTime === null &&
      (/czas\s+(gotowania|pieczenia|sma[żz]enia|duszenia)/.test(lower) ||
        /^\s*(cook|cooking|bake|baking|total)(\s*time)?\s*[:\-–]?\s*\d/.test(lower))
    ) {
      cookTime = extractMinutes(lines[i]); consumed[i] = true; continue;
    }
    if (servings === null) {
      if (
        /liczba\s+porcji|ilość\s+porcji|ilosc\s+porcji|^porcje\b|^porcji\b/.test(lower) ||
        /^\s*(serves|servings?|makes|yield|portions?)\b/.test(lower)
      ) {
        servings = firstInt(lines[i]); consumed[i] = true; continue;
      }
      const dla = /^dla\s+(\d+)\s+os/.exec(lower);
      if (dla) { servings = parsePositiveInt(dla[1]); consumed[i] = true; continue; }
    }
    // Drop any leftover "Czas ... <number>" label line (e.g. a third time we
    // don't map), so it can't leak into the body or be mistaken for a title.
    if (/^\s*czas\s+\w+.*\d/.test(lower)) { consumed[i] = true; continue; }
  }

  // Next non-consumed, non-empty, non-noise line index from `from` (consuming noise).
  const nextContent = (from: number): number => {
    for (let k = from; k < lines.length; k++) {
      if (consumed[k]) continue;
      const t = lines[k].trim();
      if (!t) continue;
      if (isNoise(t)) { consumed[k] = true; continue; }
      return k;
    }
    return -1;
  };

  // --- title detection ---
  let title: string | undefined;
  const firstIdx = nextContent(0);
  if (firstIdx >= 0) {
    const t = lines[firstIdx].trim();
    const looksData =
      new RegExp(`^[${FRACTION}]`).test(t) ||
      isPureQuantity(t) ||
      /czas\s+\w+|liczba\s+porcji|^porcje\b|kcal/i.test(t);
    if (classifyPasteHeader(t) === null && !looksData) {
      title = t;
      consumed[firstIdx] = true;
    }
  }

  // --- main walk ---
  const ingredientParts: string[] = [];
  const instructionLines: string[] = [];
  const noteLines: string[] = [];
  const preamble: string[] = [];
  let current: 'ingredients' | 'instructions' | 'notes' | null = null;
  let firstBoundary: 'ingredients' | 'instructions' | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (consumed[i]) continue;
    const line = lines[i].trim();
    if (!line) {
      if (current === 'ingredients') ingredientParts.push('');
      else if (current === 'instructions') instructionLines.push('');
      else if (current === 'notes') noteLines.push('');
      continue;
    }
    if (isNoise(line)) continue;
    // A line repeating the title (a duplicated page heading) is chrome — drop it.
    if (title && line.toLowerCase() === title.toLowerCase()) continue;

    const header = classifyPasteHeader(line);
    if (header) {
      if (header.kind === 'ingredients-main' || header.kind === 'ingredients-group') {
        if (firstBoundary === null) { firstBoundary = 'ingredients'; preamble.length = 0; }
        current = 'ingredients';
        if (header.kind === 'ingredients-group') {
          ingredientParts.push(`# ${capitalize(header.label)}`);
        } else {
          // Peek for a standalone yield line right after "Składniki" (e.g. "2 sztuki").
          const y = nextContent(i + 1);
          if (servings === null && y >= 0) {
            const ym = /^(\d+)\s*(porcj\w*|sztuk\w*|os\w*)$/.exec(lines[y].trim().toLowerCase());
            if (ym) { servings = parsePositiveInt(ym[1]); consumed[y] = true; }
          }
        }
        continue;
      }
      if (header.kind === 'instructions' || header.kind === 'instructions-title') {
        if (firstBoundary === null) {
          // Lines seen before the first method header were the ingredient list.
          firstBoundary = 'instructions';
          ingredientParts.push(...preamble);
          preamble.length = 0;
        } else {
          preamble.length = 0;
        }
        current = 'instructions';
        if (header.kind === 'instructions-title' && !title) {
          const ti = nextContent(i + 1);
          if (ti >= 0) { title = lines[ti].trim(); consumed[ti] = true; }
        }
        continue;
      }
      // notes
      current = 'notes';
      continue;
    }

    // Start of a step list ("1." — only the first item, so a stray "2./3." nav
    // list can't misfire) or a labeled step ("Krok 1" / "Step 2"), when no
    // instruction header was seen yet → instructions begin here.
    if (
      current !== 'instructions' &&
      current !== 'notes' &&
      (/^1[.)]\s/.test(line) || /^(krok|step)\s+\d+/i.test(line))
    ) {
      if (firstBoundary === null) {
        firstBoundary = 'instructions';
        ingredientParts.push(...preamble);
        preamble.length = 0;
      }
      current = 'instructions';
      instructionLines.push(line);
      continue;
    }

    // Long paragraph inside ingredients → method has started (no header given).
    // No real ingredient line exceeds 80 chars without a leading quantity, so
    // this reliably catches prose even as the first line after a header.
    if (
      current === 'ingredients' &&
      line.length > 80 &&
      !new RegExp(`^[${FRACTION}\\-*•#]`).test(line)
    ) {
      current = 'instructions';
      instructionLines.push(line);
      continue;
    }

    if (current === null) { preamble.push(line); continue; }
    if (current === 'ingredients') {
      if (!tryMergeQuantity(ingredientParts, line)) ingredientParts.push(line);
    } else if (current === 'instructions') {
      instructionLines.push(line);
    } else {
      noteLines.push(line);
    }
  }

  // No structure found at all → body is the instructions (fallback dump).
  if (firstBoundary === null && preamble.length) {
    instructionLines.push(...preamble);
  }

  return {
    title,
    prepTime,
    cookTime,
    servings,
    ingredients: trimBlankEdges(ingredientParts),
    instructions: trimBlankEdges(instructionLines),
    notes: trimBlankEdges(noteLines),
  };
}
