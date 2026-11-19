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
  notes?: string;
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
  const lines: string[] = [];
  // Sites wrap steps in every combination: a string, a list of strings or
  // HowToSteps, a single object, HowToSections, even a list inside a list.
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      lines.push(item);
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === 'object') {
      const node = item as JsonLdNode;
      if (node.itemListElement !== undefined) visit(node.itemListElement);
      else if (typeof node.text === 'string') lines.push(node.text);
    }
  };
  visit(value);
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

// ----- Microdata (SPEC §5.15) -----
//
// Sites without a JSON-LD Recipe often mark it up in the HTML itself. Fully, as
// on aniagotuje.pl, or only the name and description, as on kwestiasmaku.com
// and mojewypieki.com: there the Recipe element is still the part of the page
// that holds the recipe, so its text goes through parsePastedRecipe.

interface HtmlElement {
  tag: string;
  attrs: string;
  contentStart: number;
  contentEnd: number;
  parent: HtmlElement | null;
  isItem: boolean;
  props: string[];
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr',
]);

function htmlAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/**
 * Elements in document order with their parents. Tolerant, since real pages
 * leave <li> and <p> unclosed: a closing tag also closes whatever is still open
 * inside it, and one with no matching open tag is ignored.
 */
function scanHtmlElements(html: string): HtmlElement[] {
  const out: HtmlElement[] = [];
  const stack: HtmlElement[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let open = stack.length - 1;
      while (open >= 0 && stack[open].tag !== tag) open--;
      if (open < 0) continue;
      for (let k = open; k < stack.length; k++) stack[k].contentEnd = m.index;
      stack.length = open;
      continue;
    }
    const attrs = m[3];
    const el: HtmlElement = {
      tag,
      attrs,
      contentStart: tagRe.lastIndex,
      contentEnd: html.length,
      parent: stack[stack.length - 1] ?? null,
      isItem: /(?:^|\s)itemscope(?:[\s=/]|$)/i.test(attrs),
      props: (htmlAttr(attrs, 'itemprop') ?? '').split(/\s+/).filter(Boolean),
    };
    out.push(el);
    if (!VOID_TAGS.has(tag) && !attrs.trimEnd().endsWith('/')) stack.push(el);
  }
  return out;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½',
  frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', hellip: '…', oacute: 'ó', Oacute: 'Ó',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (whole, dec, hex, name) => {
    if (name) return HTML_ENTITIES[name] ?? whole;
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return code >= 1 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function htmlToText(html: string): string {
  const breaks =
    /<(?:br|\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section|article|aside|header|footer|blockquote|dl|dt|dd))\b[^>]*>/gi;
  return decodeHtmlEntities(html.replace(breaks, '\n').replace(/<[^>]*>/g, ''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function isRecipeItem(el: HtmlElement): boolean {
  const type = el.isItem ? htmlAttr(el.attrs, 'itemtype') : null;
  return !!type && type.split(/\s+/).some((t) => /^https?:\/\/schema\.org\/Recipe\/?$/i.test(t));
}

function nearestItem(el: HtmlElement): HtmlElement | null {
  let parent = el.parent;
  while (parent && !parent.isItem) parent = parent.parent;
  return parent;
}

/** The property values of one item: its own, not those of the items nested in it. */
function itemProperties(
  html: string,
  elements: HtmlElement[],
  item: HtmlElement
): Record<string, unknown[]> {
  const props: Record<string, unknown[]> = {};
  for (const el of elements) {
    if (el.props.length === 0 || nearestItem(el) !== item) continue;
    let value: unknown;
    if (el.isItem) {
      const nested = itemProperties(html, elements, el);
      value = { text: nested.text?.[0], itemListElement: nested.itemListElement };
    } else {
      const raw =
        htmlAttr(el.attrs, 'content') ??
        htmlAttr(el.attrs, 'datetime') ??
        html.slice(el.contentStart, el.contentEnd);
      value = htmlToText(raw);
    }
    for (const prop of el.props) (props[prop] ??= []).push(value);
  }
  return props;
}

/**
 * Extracts the first Schema.org Recipe from a page's microdata. When the item
 * marks up neither ingredients nor steps, the text of its element is read as a
 * pasted recipe instead. That has to yield both, otherwise → null.
 */
export function parseRecipeMicrodata(html: string): ParsedRecipe | null {
  if (!html) return null;
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  const elements = scanHtmlElements(clean).filter((el) => el.isItem || el.props.length > 0);
  const recipe = elements.find(isRecipeItem);
  if (!recipe) return null;

  const props = itemProperties(clean, elements, recipe);
  const parsed = mapRecipe({
    name: props.name?.[0],
    recipeIngredient: [...(props.recipeIngredient ?? []), ...(props.ingredients ?? [])],
    recipeInstructions: props.recipeInstructions,
    prepTime: props.prepTime?.[0],
    cookTime: props.cookTime?.[0],
    recipeYield: props.recipeYield,
  });
  if (parsed.ingredients || parsed.instructions) return parsed;

  // The name goes first so that its repeats in the text count as the title.
  const body = htmlToText(clean.slice(recipe.contentStart, recipe.contentEnd));
  const text = parsePastedRecipe(parsed.title ? `${parsed.title}\n${body}` : body);
  if (!text.ingredients || !text.instructions) return null;
  return {
    title: parsed.title ?? text.title,
    prepTime: parsed.prepTime ?? text.prepTime,
    cookTime: parsed.cookTime ?? text.cookTime,
    servings: parsed.servings ?? text.servings,
    ingredients: text.ingredients,
    instructions: text.instructions,
    notes: text.notes,
  };
}

/** A page's structured Recipe: JSON-LD first, then microdata. */
export function parseRecipeHtml(html: string): ParsedRecipe | null {
  return parseRecipeJsonLd(html) ?? parseRecipeMicrodata(html);
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
  'w tym cukry', 'w 100 g', 'w 100g', 'dowiedz się więcej', 'dowiedz sie wiecej',
  'reklama', 'advertisement', 'sponsored', 'ad', 'udostępnij', 'udostepnij', 'share', 'print',
  'nie wygaszaj', 'nie wygaszaj ekranu',
  'print recipe', 'save', 'save recipe',
]);
const NOISE_PREFIX = [
  'ilość lajków', 'ilosc lajkow', 'dieta:', 'hity kwestii smaku', 'średnia ', 'srednia ',
  'nutrition', 'wartość energetyczna', 'wartosc energetyczna', 'wartości odżywcze',
  'wartosci odzywcze', 'zapisz się do', 'zapisz sie do', 'ten wpis zawiera', 'this post contains',
  'jump to recipe', 'przejdź do przepisu', 'przejdz do przepisu',
];

// Where a copied page stops being the recipe: everything below is related
// recipes and comments. Ends the recipe once it has steps (see the main walk).
const PAGE_TAIL_HEADERS = new Set([
  'zobacz też', 'zobacz tez', 'zobacz także', 'zobacz takze', 'podobne przepisy',
  'polecane przepisy', 'inne przepisy', 'przeczytaj też', 'przeczytaj tez', 'czytaj też',
  'czytaj tez', 'czytaj także', 'czytaj takze', 'komentarze', 'wasze komentarze',
  'dodaj komentarz', 'you may also like', 'you might also like', 'related recipes',
  'related posts', 'more recipes', 'comments', 'leave a comment', 'leave a reply', 'tagi', 'tags',
  'kategoria', 'kategorie', 'categories', 'przeglądaj wpisy po składnikach',
]);

// Copy that sells: a call to action, a discount, a price. (Not a link: a blog
// signs its own recipes with one.)
const AD_COPY =
  /kup teraz|zam[óo]w|sprawd[źz] ofert|promocj|rabat|taniej|gratis|buy now|shop now|order now|learn more|dowiedz si[ęe]|-\s?\d+\s?%|\d+[.,]\d{2}\s?z[łl]/i;
// An ad is a few words, never a sentence of the recipe.
const isSlogan = (line: string) => line.split(/\s+/).length <= 6 && !/[.?]$/.test(line);

// When a post went up: "Wczoraj o 18:22", "12 maja o 9:05".
const POST_META =
  /^(wczoraj|dzisiaj|today|yesterday)\b.{0,6}\d{1,2}:\d{2}.{0,6}$|^\d{1,2}\s+\p{L}{3,12}(\s+\d{4})?\s+(o|at)\s+\d{1,2}:\d{2}.{0,6}$/iu;

// What a social or chat app draws around the text in a screenshot (or leaves in
// a copied post): like and comment counters, "2 dni temu", reply/like buttons,
// the composer placeholder, presence, view counts. Matched on the lowercased
// line, each pattern covering the whole line or its unmistakable start.
const APP_CHROME: RegExp[] = [
  /^liczba polubie[ńn](?![\p{L}])|^polubienia:|^liked by\b|^\d[\d\s.,]*\s*(polubie\p{L}*|likes?)$/u,
  /^(zobacz|wy[śs]wietl) (wszystkie )?komentarz|^view all( \d+)? comments?/u,
  /^(\d+\s+\p{L}+\.?\s+temu|\d+\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\b.{0,30}$/u,
  /^zobacz t[łt]+umaczenie|^see translation|^zobacz wi[ęe]cej$|^see more$/u,
  /lubi[ęe] to!?.*\b(komentarz|odpowiedz|udost[ęe]pnij)|^(like|reply|comment|share)(\s+(like|reply|comment|share))+\b/u,
  /^\d+\s+\p{L}{1,5}\.\s+lubi[ęe] to|^\d+\s*[a-z]{1,3}\s+like\s+reply/u,
  /^\d+\s+komentarz\p{L}*$|\d+\s+komentarz\p{L}*\s*[·•]?\s*\d+\s+udost[ęe]pnie|^\d+\s+comments?$|\d+\s+comments?\s*[·•]?\s*\d+\s+shares?/u,
  /^(lubi[ęe] to|skomentuj|wy[śs]lij|odpowiedz|like|comment|send|reply)$/u,
  /^(przekazan[ao]|forwarded)$|^(\p{L}+,\s*){2,}(ty|you)$/u,
  /^@[a-z0-9_.]+([\s.]+[a-z0-9_.]+){0,4}$/u,
  /^(napisz|dodaj) komentarz|^(write|add) a comment/u,
  /^aktywn\p{L}*\s*\(?a?\)?\s.*(temu|teraz)$|^active (now|\d+.*ago)$|^(online|dost[ęe]pn[ya]|pisze\.\.\.|typing\.\.\.)$|^(widzian[yao]|last seen)\b/u,
  /^(wiadomo[śs][ćc]|message|aa)$/u,
  /^(pon|wt|[śs]r|czw|pt|sob|niedz)\.$|^(pon|wt|[śs]r|czw|pt|sob|niedz|mon|tue|wed|thu|fri|sat|sun)\p{L}*\.?,?\s+\d{1,2}:\d{2}$|^(dzisiaj|wczoraj|today|yesterday)(,?\s+\d{1,2}:\d{2})?$/u,
  /^(edytowano|edited)\b.{0,24}$/u,
  POST_META,
  /^[\d.,]+\s*(tys\.|mln|k|m)?\s*(wy[śs]wietle[ńn]|views)(?![\p{L}])|^(subskrybuj|subscribe)\b/u,
  /oryginalny d[źz]wi[ęe]k|original (sound|audio)/u,
];

function isPageTail(line: string): boolean {
  const n = line.toLowerCase().replace(/[:!]+$/, '').replace(/\s*\(\d+\)$/, '').trim();
  return PAGE_TAIL_HEADERS.has(n) || /^(view all )?\d+ (comments?|komentarz\p{L}*)$/u.test(n);
}

// A nutrition table row. Not noise among the ingredients: "białko 30 g" is one.
const NUTRIENT_VALUE =
  /^(białko|bialko|tłuszcze?|tluszcze?|węglowodany|weglowodany|błonnik|blonnik|cukry|kalorie|protein|fat|carbs|carbohydrates?|fib(er|re)|calories)\s*:?\s*\d+([.,]\d+)?\s*(g|mg|kcal)?$/i;

/** A line of site or app chrome the paste parser drops (see `isNoise`). */
export function isRecipeNoise(line: string): boolean {
  return isNoise(line.trim());
}

function isNoise(line: string): boolean {
  // A back chevron in front of a screen title ("< Komentarze") is not text.
  const n = line.toLowerCase().replace(/^[<‹←]\s*/, '').replace(/[:!]+$/, '').trim();
  if (NOISE_EXACT.has(n)) return true;
  if (NOISE_PREFIX.some((p) => n.startsWith(p))) return true;
  if (isPageTail(line)) return true;
  if (APP_CHROME.some((re) => re.test(n))) return true;
  // Hashtags, also behind a caption's "mniej"/"more" toggle; "# Ciasto" is a group heading.
  // Words are split on whitespace only (`#a#b` is one word): a nested `(#\S+\s*)+`
  // matches the same lines but backtracks exponentially on `#!#!#…` (ReDoS).
  if (/^#\S+(\s+#\S+)*\s*(mniej|wi[ęe]cej|more|less)?$/.test(n)) return true;
  if (/\b(follow|obserwuj)\s+@\S|^save this\b|\blink (in|w) bio\b/.test(n)) return true;
  if (/^(\S\s)?[0-9]+([.,][0-9]+)?\s*kcal$/.test(n)) return true; // "186 kcal", its icon read as a stray character
  // A rating: "4.8 / 5 (…)". Not "1/2 szklanki mleka" — text follows the fraction.
  if (/^[0-9]+([.,][0-9]+)?\s*\/\s*[0-9]+([.,][0-9]+)?(\s*\(.*\)|\s+(ocen|g[łl]os|gwiazd|votes?|reviews?|ratings?|stars?)\p{L}*.*)?$/u.test(n)) return true;
  if (/\s[>›»]$/.test(n)) return true; // a button/link label: "EMAIL >", "STERUJ GŁOSEM ›"
  // A chrome label with its icon OCR'd as a stray letter: "DODAJ NOTATKĘ E".
  const iconless = /^(.*\S)\s\S$/.exec(n);
  if (iconless && NOISE_EXACT.has(iconless[1])) return true;
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

// "Składniki", also OCR-mangled ("Sktadniki": ł read as t) and carrying the
// yield ("SKŁADNIKI / 4 PORCJE", "Składniki (4 porcje)").
const PASTE_INGREDIENT_MAIN =
  /^(?:sk[łlt]adniki|ingredients|(?:what )?you(?:['’]ll| will)? need|(?:co |czego )?potrzebujesz|potrzebujemy|potrzebne b[ęe]d[ąa]|b[ęe]dziesz potrzebowa[ćc]|potrzebne sk[łl]adniki)(?:\s*[/(–\-:|·]\s*(\d+)\s*(?:porcj\p{L}*|os\p{L}*|sztuk\p{L}*|servings?|portions?)\)?)?$/u;
const PASTE_INGREDIENT_LEAD =
  /^na\s+(\d+)\s+(?:porcj\p{L}*|os[oó]b\p{L}*|sztuk\p{L}*)\s+(?:potrzebujesz|potrzebujemy|potrzebne(?:\s+b[ęe]d[ąa])?|b[ęe]dziesz potrzebowa[ćc])$/u;
const PASTE_STEP_HEADERS = new Set([
  'przygotowanie', 'sposób przygotowania', 'sposob przygotowania', 'sposób wykonania',
  'sposob wykonania', 'wykonanie', 'sposób przyrządzania', 'instrukcje', 'kroki',
  'instructions', 'method', 'steps', 'directions', 'preparation', 'przygotowanie krok po kroku',
  'krok po kroku', 'how', 'how to', 'how to make', 'how to make it', 'what to do', 'jak zrobić',
  'jak zrobic', 'jak to zrobić', 'jak to zrobic', 'jak przygotować', 'jak przygotowac',
]);
const PASTE_NOTES_HEADERS = new Set([
  'wskazówki', 'wskazowki', 'wskazówka', 'rady/porady', 'rady i porady', 'porada',
  'porady', 'rada', 'dobra rada', 'uwagi', 'tip', 'tips', 'note', 'notes',
]);

type PasteHeader =
  | { kind: 'ingredients-main'; servings?: number | null }
  | { kind: 'ingredients-group'; label: string }
  | { kind: 'instructions' }
  | { kind: 'instructions-title' } // e.g. "Przepis i sposób przygotowania na:" — next line is the dish title
  | { kind: 'notes' };

function classifyPasteHeader(line: string): PasteHeader | null {
  const lower = line.trim().replace(/:$/, '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.startsWith('przepis') && / na$/.test(lower)) return { kind: 'instructions-title' };
  const main = PASTE_INGREDIENT_MAIN.exec(lower);
  if (main) return { kind: 'ingredients-main', servings: main[1] ? parsePositiveInt(main[1]) : null };
  // A caption's lead-in with the yield in front: "Na 2 porcje potrzebujesz:".
  const lead = PASTE_INGREDIENT_LEAD.exec(lower);
  if (lead) return { kind: 'ingredients-main', servings: parsePositiveInt(lead[1]) };
  // No colon in the label: "Składniki na ciasto: 200 g mąki" is an inline
  // header (splitInlineHeader), not a group named "ciasto: 200 g mąki".
  const grp = /^sk[łlt]adniki na ([^:]+)$/.exec(lower);
  if (grp) return { kind: 'ingredients-group', label: grp[1] };
  if (PASTE_STEP_HEADERS.has(lower)) return { kind: 'instructions' };
  if (PASTE_NOTES_HEADERS.has(lower)) return { kind: 'notes' };
  return null;
}

/**
 * An inline header: one of the parser's own header words, then a colon and
 * content on the same line ("Method: Soften the onion…", "Składniki: 1 l
 * wody"). The whole part before the FIRST colon must be a header (exact,
 * case-insensitive — "Sól: do smaku", "Uwaga: gorące!", "Follow the method: …"
 * don't trigger) and the remainder must be non-empty (a bare "Method:" is a
 * plain header line). "Przepis … na:" is excluded: its next line is the title.
 */
function splitInlineHeader(line: string): { header: PasteHeader; rest: string } | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const head = line.slice(0, colon).trim();
  const rest = line.slice(colon + 1).trim();
  if (!head || !rest) return null;
  const header = classifyPasteHeader(head);
  if (!header || header.kind === 'instructions-title') return null;
  return { header, rest };
}

// A number with an optional range ("4-6", "4–6", "4 to 6", "4 do 6") — the
// range takes its first number, like servings labels and JSON-LD recipeYield.
const YIELD_N = '(\\d+)(?:\\s*(?:-|–|—|to|do)\\s*\\d+)?';
// Whole-bracket yield forms (matched on the lowercased bracket content).
// Deliberately narrow: "(for 2 hours)", "(na 2 dni)", "(4)" don't match.
const TITLE_YIELD_PATTERNS = [
  `(?:serves|servings?|for|yields?)\\s*:?\\s*${YIELD_N}(?:\\s+(?:people|persons|portions?|servings?))?`,
  `makes\\s*:?\\s*${YIELD_N}(?:\\s+\\p{L}+){0,2}`,
  `${YIELD_N}\\s*(?:servings?|portions?|people|persons)`,
  `dla\\s+${YIELD_N}(?:\\s+os\\p{L}*\\.?)?`,
  `(?:na\\s+)?${YIELD_N}\\s+porcj\\p{L}*`,
  `porcj\\p{L}*\\s*:?\\s*${YIELD_N}`,
  `${YIELD_N}\\s+os\\p{L}*\\.?`,
  `${YIELD_N}\\s+sztuk\\p{L}*`,
].map((p) => new RegExp(`^(?:${p})$`, 'u'));

/**
 * Servings from a parenthetical yield in a recipe title ("Shakshuka (serves
 * 2)", "Pierogi (dla 4 osób)", "Zupa (4–6 porcji)"). The first bracket whose
 * whole content is a yield with a number ≥ 1 is removed (spaces collapsed,
 * trailing dash/colon/comma stripped); other brackets are kept. No yield
 * bracket → title unchanged, servings null. Paste path only (SPEC §5.15).
 */
export function extractTitleServings(title: string): { title: string; servings: number | null } {
  const groupRe = /\(([^()]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(title)) !== null) {
    const content = m[1].trim().toLowerCase();
    for (const re of TITLE_YIELD_PATTERNS) {
      const ym = re.exec(content);
      if (!ym) continue;
      const servings = parsePositiveInt(ym[1]);
      if (servings === null) break;
      const before = title.slice(0, m.index);
      const after = title.slice(m.index + m[0].length);
      // "Shakshuka (serves 2)!" → "Shakshuka!" — no space (or dangling dash)
      // left in front of punctuation that followed the bracket.
      const joined = /^\s*[!?.,;:]/.test(after)
        ? before.replace(/[\s–\-—:,]+$/, '') + after.trimStart()
        : `${before} ${after}`;
      const cleaned = joined
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s–\-—:,]+$/, '');
      return { title: cleaned, servings };
    }
  }
  return { title, servings: null };
}

const EMOJI = '\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}';
const EMOJI_RE = new RegExp(`[${EMOJI}]`, 'u');
const LEADING_EMOJI_RE = new RegExp(`^[${EMOJI}\\uFE0F\\u200D\\s]+`, 'u');

// Lines that sit above a dish name on a copied page or a scanned book page.
const TITLE_CHROME = new Set([
  'strona główna', 'strona glowna', 'home', 'start', 'menu', 'szukaj', 'search', 'blog',
  'przepisy', 'recipes', 'obiady', 'zupy', 'desery', 'ciasta', 'wypieki', 'śniadania',
  'sniadania', 'kolacje', 'przystawki', 'sałatki', 'salatki', 'napoje', 'dania główne',
  'dania glowne', 'dania mięsne', 'dania miesne', 'breakfast', 'lunch', 'dinner', 'desserts',
  'soups', 'salads', 'drinks', 'starters', 'main courses',
  'facebook', 'instagram', 'messenger', 'whatsapp', 'tiktok', 'youtube', 'pinterest',
  'notatki', 'notes', 'gotowe', 'done',
]);

// "Halina Kowalczyk · 3 godz." — a post's author line; OCR loses the dot.
const AUTHOR_LINE = /^\S+(\s+\S+)+\s+\d+\s*(godz\.?|tyg\.?|dni|mies\.?)$/i;
// The line under a contact's name in a chat header.
// Under a group chat's name: its members. Under a sender's name: "Przekazana".
const CHAT_SUBTITLE = /^((\p{L}+,\s*){2,}(ty|you)|przekazan[ao]|forwarded)$/iu;
const CHAT_MARK = /^(aa|wiadomo[śs][ćc]|message)$/i;
const PRESENCE_LINE = /^(online|dost[ęe]pn[ya]|aktywn\p{L}*\s*\(?a?\)?\s.*(temu|teraz)|active (now|\d+.*ago)|(widzian[yao]|last seen)\b.*)$/iu;

function isTitleChrome(line: string): boolean {
  // A back chevron in front of a screen title: "< Notatki".
  if (TITLE_CHROME.has(line.toLowerCase().replace(/^[<‹←]\s*/, ''))) return true;
  if (/[·•]\s*\d+\s*(s|m|min|h|d|w|g|godz\.?|dni|tyg\.?)$/i.test(line)) return true; // "name · 2d"
  if (/^@?[\w.]*[._][\w.]*$/.test(line) || /^@[\w.]+(\s+[\d\-./]+)?$/.test(line)) return true; // an account name
  if (AUTHOR_LINE.test(line)) return true;
  return /^[^›»>]+(\s[›»>]\s[^›»>]+)+$/.test(line); // "Home > Recipes > Dinner"
}

function isSentence(line: string): boolean {
  const words = line.split(/\s+/).length;
  return (
    /[.?…]$/.test(line) ||
    (line.endsWith('!') && words >= 5) ||
    (line.includes(',') && words >= 8) ||
    line.length > 80
  );
}

// A leading number is data ("200 g mąki") unless it is a compound ("3-składnikowe ciastka").
const isTitleData = (line: string) =>
  (new RegExp(`^[${FRACTION}]`).test(line) && !/^\d+-\p{L}/u.test(line)) ||
  isPureQuantity(line) ||
  /czas\s+\w+|liczba\s+porcji|^porcje\b|kcal/i.test(line);

const isSectionStart = (line: string) =>
  classifyPasteHeader(line) !== null || splitInlineHeader(line) !== null;

// A short capitals line over an ordinary one is a book's chapter name.
function isRunningHead(line: string, next: string | undefined): boolean {
  if (line !== line.toUpperCase() || line === line.toLowerCase()) return false;
  // Up to four words — or six when it was letter-spaced and OCR broke it into
  // fragments ("ZUP Y I DA NIA …": two-letter pieces side by side). A capitals
  // title of five words ("PLACKI Z JABŁKAMI I CYNAMONEM") is a title.
  const words = line.split(/\s+/);
  const fragmented = words.some((w, i) => i > 0 && w.length <= 2 && words[i - 1].length <= 2);
  if (next === undefined || words.length > (fragmented ? 6 : 4)) return false;
  if (isSectionStart(next) || isTitleData(next) || isSentence(next)) return false;
  return /^\p{Lu}/u.test(next) && next !== next.toUpperCase();
}

// The title part of a line, cut at its first emoji: what a caption's opening
// looks like. `rest` is the remainder, so an unstructured text loses nothing.
function splitTitleLine(line: string): { title: string; rest: string } {
  const body = line.replace(LEADING_EMOJI_RE, '');
  const cut = body.search(EMOJI_RE);
  if (cut < 0) return { title: body.trim(), rest: '' };
  return { title: body.slice(0, cut).trim(), rest: body.slice(cut).replace(LEADING_EMOJI_RE, '') };
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

// Splits at commas that separate list items: not inside brackets, not a
// decimal comma ("1,5 l").
function splitCommaList(line: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0 && line[i + 1] === ' ') {
      items.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  items.push(current.trim());
  return items.filter(Boolean);
}

// "Czas przygotowania: 30 min | Czas pieczenia: 50 min | Porcje: 12" — one
// label per line, so each is read (the metadata pass takes one per line).
function splitLabelRow(line: string): string[] {
  const parts = line.split(/\s+[|·•]\s+/);
  return parts.length > 1 && parts.every((p) => /^[\p{L} ]{2,30}:\s*\S/u.test(p.trim()))
    ? parts
    : [line];
}

// A line that opens with an amount: "250 g mąki", "2 jajka", "½ banana",
// "1-2 łyżki". Not a step ("1. Wymieszaj") or a video chapter ("0:45 …").
const QUANTITY_LINE = new RegExp(
  `^[${FRACTION}]+(?:[.,/][0-9]+)?(?:\\s*[-–]\\s*[0-9]+)?\\s*\\p{L}`,
  'u'
);

/**
 * The ingredient list of a text without any header — a chat message, a note:
 * the first stretch of short lines in which at least three open with an
 * amount. Amount-less items inside it ("sól", "szczypta cukru") belong, and so
 * do up to three right after it; a sentence ends it. Returns the half-open
 * line range, or null when there is no such stretch.
 */
function findIngredientRun(lines: string[]): { start: number; end: number } | null {
  const words = (l: string) => l.split(/\s+/).length;
  const isItem = (l: string) => l.length <= 60 && !(/[.!?]$/.test(l) && words(l) >= 5);
  const isAmount = (l: string) => isItem(l) && QUANTITY_LINE.test(l);
  const isPlain = (l: string) => l.length <= 40 && !/[.!?:]$/.test(l) && words(l) <= 5;
  const start = lines.findIndex(isAmount);
  if (start < 0) return null;
  let amounts = 0;
  let lastAmount = start;
  let end = start;
  while (end < lines.length && (isAmount(lines[end]) || isPlain(lines[end]))) {
    if (isAmount(lines[end])) { amounts++; lastAmount = end; }
    end++;
  }
  if (amounts < 3) return null;
  return { start, end: Math.min(end, lastAmount + 4) };
}

/**
 * Best-effort heuristic split of pasted recipe text into title / times /
 * servings / ingredients / instructions / notes (SPEC §5.15). Deterministic,
 * conservative: when a line can't be confidently classified it is kept (not
 * dropped), and with no recognized structure the body falls back to
 * instructions. Author tips (Wskazówki / Rady-porady) route to notes.
 * A header with content after its colon ("Method: Soften the onion…") is an
 * inline header: it switches the section and the remainder becomes the
 * section's first line. A parenthetical yield in the final title ("Shakshuka
 * (serves 2)") sets servings unless a label already did, and is removed from
 * the title (extractTitleServings).
 */
export function parsePastedRecipe(text: string): ParsedPastedRecipe {
  const lines = text.split(/\r?\n/).flatMap(splitLabelRow);
  const consumed = new Array(lines.length).fill(false);

  // A post's caption opens with its author's account name, which the post
  // header shows on a line of its own above ("kasia.gotuje" … "kasia.gotuje
  // Placki bananowe"). Everything above the caption is app chrome. A name of
  // plain letters must be followed by something other than a lowercase word,
  // so a one-word title repeated in a sentence is left alone.
  let captionLine = -1;
  // OCR breaks a name at its underscores and dots ("domowa spizarnia" /
  // "domowa _spizarnia Ciasto…"), so names are compared without them.
  const handleKey = (h: string) => h.toLowerCase().replace(/[\s_.@]/g, '');
  for (let i = 0; i < Math.min(lines.length, 6) && captionLine < 0; i++) {
    const name = lines[i].trim();
    if (!/^@?[a-z0-9._]+(\s[a-z0-9._]+){0,2}$/.test(name) || handleKey(name).length < 3) continue;
    const plain = /^[a-z ]+$/.test(name);
    for (let j = i + 1; j < Math.min(lines.length, i + 9) && captionLine < 0; j++) {
      const tokens = lines[j].trim().split(/\s+/);
      for (let n = 1; n < Math.min(tokens.length, 5); n++) {
        if (handleKey(tokens.slice(0, n).join('')) !== handleKey(name)) continue;
        const rest = tokens.slice(n).join(' ');
        if (plain && /^\p{Ll}/u.test(rest)) continue;
        // Only in a post: the name carries its dot/underscore/@ somewhere, or
        // app chrome sits above the caption — and never across a recipe's own
        // header or amount lines ("pizza" … "pizza Margherita to klasyk").
        const above = lines.slice(0, j).map((l) => l.trim()).filter(Boolean);
        const isPost =
          /[._@]/.test(name) || /[._@]/.test(tokens.slice(0, n).join(' ')) ||
          above.some((l) => APP_CHROME.some((re) => re.test(l.toLowerCase())));
        if (!isPost || above.some((l) => isSectionStart(l) || QUANTITY_LINE.test(l))) continue;
        for (let k = 0; k < j; k++) consumed[k] = true;
        lines[j] = rest;
        captionLine = j;
        break;
      }
    }
  }
  // A screenshot cropped to the caption has no header line above it.
  if (captionLine < 0) {
    const first = lines.findIndex((l) => l.trim());
    const handle = first < 0 ? null : /^@?[a-z0-9]+[._][a-z0-9._]*\s+(?=\p{Lu})/u.exec(lines[first].trim());
    if (handle) {
      lines[first] = lines[first].trim().slice(handle[0].length);
      captionLine = first;
    }
  }
  // A chat screenshot: the dish is named in the message, not at the top.
  const chatLike = lines.some((l) => {
    const t = l.trim();
    return PRESENCE_LINE.test(t) || CHAT_SUBTITLE.test(t) || CHAT_MARK.test(t);
  });

  // --- metadata pass: prep/cook/servings from labeled lines (removed from body) ---
  let prepTime: number | null = null;
  let cookTime: number | null = null;
  let servings: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      prepTime === null &&
      (/czas\s+(przygotowania|szykowania)/.test(lower) ||
        // `(?!…)` — a step marker followed by text ("Preparation: 1. Mix") is
        // an inline header, not prep = 1. "Prep: 5." still reads as a time, and
        // "Prep: 1.5 h" is still recognized as a label (the decimal itself is
        // not parsed — extractMinutes handles integers only).
        // `t\p{L}{2,5}` — "time", also as OCR spells it ("timne").
      /^\s*(prep|preparation)(\s*t\p{L}{2,5})?\s*[:\-–]?\s*\d(?!\d*[.)]\s+\S)/u.test(lower) ||
        // PL "Przygotowanie: 15 min" only when the whole line is a duration;
        // "Przygotowanie: Gotuj 15 min." is an inline method header.
        /^\s*przygotowanie\s*[:\-–]\s*(\d+\s*(godz\p{L}*|h|min\p{L}*)\.?\s*)+$/u.test(lower))
    ) {
      prepTime = extractMinutes(lines[i]); consumed[i] = true; continue;
    }
    if (
      cookTime === null &&
      // `\S*` before the -enia stems absorbs OCR letter noise ("smnażenia")
      // and prefixed forms ("wypieczenia"); "gotowania" stays exact so
      // "przygotowania" can never read as a cook time.
      (/czas\s+(gotowania|\S*pieczenia|\S*a[żz]enia|duszenia)/.test(lower) ||
        /^\s*(cook|cooking|bake|baking|total)(\s*time)?\s*[:\-–]?\s*\d(?!\d*[.)]\s+\S)/.test(lower))
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
      // The yield closing a book's subtitle: "Sycąca zupa na chłodne dni. Dla 6 osób."
      const tail = /[.!]\s+dla\s+(\d+)\s+os[oó]b\p{L}*\.?$/u.exec(lower);
      if (tail) servings = parsePositiveInt(tail[1]);
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
  const takeTitle = (index: number): boolean => {
    const split = splitTitleLine(lines[index].trim());
    // Chat markup for bold/italic: "*Sos czosnkowy*".
    const candidate = split.title.replace(/^[*_]+|[*_]+$/g, '').trim();
    const rest = split.rest;
    // A caption's opening line names the dish even with a "!" on it.
    const judged = index === captionLine ? candidate.replace(/!+$/, '') : candidate;
    if (!candidate || isSentence(judged)) return false;
    // An emoji in a caption's opening line reads as a stray letter ("placki
    // bananowe e bez cukru"); the one-letter words of PL/EN are kept.
    // Elsewhere only a symbol no alphabet in use here has ("BIGOS Ə przepis").
    title = (index === captionLine
      ? candidate.replace(/\s[b-hj-np-tvxyB-HJ-NP-TVXY](?=\s)/g, '')
      : candidate
    ).replace(/\s[^\sA-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż&+\-–—/(]{1}(?=\s)/g, '');
    if (rest) lines[index] = rest;
    else consumed[index] = true;
    return true;
  };

  // A page prints its heading twice more often than it opens with it, so a line
  // repeated before the first section header wins over the first line.
  const seen = new Map<string, number>();
  let repeated = -1;
  for (let k = 0; k < lines.length; k++) {
    const t = lines[k].trim();
    if (consumed[k] || !t || isNoise(t)) continue;
    if (isSectionStart(t)) {
      if (repeated >= 0) takeTitle(repeated);
      break;
    }
    if (isTitleData(t) || isTitleChrome(t)) continue;
    const first = seen.get(t.toLowerCase());
    if (first === undefined) seen.set(t.toLowerCase(), k);
    else if (repeated < 0) repeated = first;
  }

  if (title === undefined) {
    for (let k = nextContent(0); k >= 0; k = nextContent(k + 1)) {
      const t = lines[k].trim();
      if (isSectionStart(t) || isTitleData(t)) break;
      // A contact's name sits over their presence line, a group's over the
      // post's author line — neither is a dish.
      const below = lines.slice(k + 1).find((l) => l.trim())?.trim();
      const isHeaderName =
        below !== undefined &&
        (PRESENCE_LINE.test(below) || AUTHOR_LINE.test(below) || POST_META.test(below) ||
          CHAT_SUBTITLE.test(below));
      const nextIdx = nextContent(k + 1);
      if (
        isHeaderName ||
        isTitleChrome(t) ||
        (k !== captionLine && isRunningHead(t, nextIdx >= 0 ? lines[nextIdx].trim() : undefined))
      ) {
        consumed[k] = true;
        continue;
      }
      takeTitle(k);
      break;
    }
  }

  // --- main walk ---
  const ingredientParts: string[] = [];
  const instructionLines: string[] = [];
  const noteLines: string[] = [];
  const preamble: string[] = [];
  let afterInlineList = false;
  let inlineList: string | null = null;
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
    if (isPageTail(line) && instructionLines.some((l) => l.trim())) break;
    // An ad: its label, and the copy under it when it visibly sells (a price,
    // a discount, "Kup teraz") — up to three short lines, never past a header,
    // an amount line, a step or a sentence. Without such a mark only the label
    // goes: blogs put "Reklama" in the middle of the method.
    if (/^(reklama|advertisement|sponsored|sponsorowane)$/i.test(line)) {
      let lastCopy = -1;
      let seen = 0;
      for (let k = i + 1; k < lines.length && seen < 3; k++) {
        const t = lines[k].trim();
        if (consumed[k] || !t || isNoise(t)) continue;
        if (isSectionStart(t) || QUANTITY_LINE.test(t) || /^(\d+[.)]\s|[-*•]\s|krok\s+\d|step\s+\d)/i.test(t)) break;
        if (!isSlogan(t)) break;
        seen++;
        if (AD_COPY.test(t)) lastCopy = k;
      }
      for (let k = i + 1; k <= lastCopy; k++) consumed[k] = true;
      continue;
    }
    if (isNoise(line)) continue;
    if (current !== 'ingredients' && NUTRIENT_VALUE.test(line)) continue;
    // A line repeating the title (a duplicated page heading) is chrome — drop it.
    if (title && line.toLowerCase() === title.toLowerCase()) continue;

    let header = classifyPasteHeader(line);
    // Inline header ("Method: Soften…"): the remainder is the section's first
    // line, pushed as-is (no quantity merge, no >80-char prose rule).
    let inlineRest: string | null = null;
    if (!header) {
      const inline = splitInlineHeader(line);
      if (inline) { header = inline.header; inlineRest = inline.rest; }
    }
    if (header) {
      if (header.kind === 'ingredients-main' || header.kind === 'ingredients-group') {
        if (firstBoundary === null) {
          // In a chat the line right above the list names the dish ("Brownie z
          // fasoli" / "Składniki: …"); the first line of the screen is small talk.
          const above = preamble[preamble.length - 1];
          if (
            chatLike && above !== undefined && above.split(/\s+/).length <= 6 &&
            !/[.!?:]$/.test(above) && !isTitleData(above)
          ) {
            title = above.replace(/^[*_]+|[*_]+$/g, '').trim() || title;
          }
          firstBoundary = 'ingredients';
          preamble.length = 0;
        }
        current = 'ingredients';
        if (header.kind === 'ingredients-group') {
          ingredientParts.push(`# ${capitalize(header.label)}`);
        } else if (header.servings != null) {
          if (servings === null) servings = header.servings;
        } else if (inlineRest === null) {
          // Peek for a standalone yield line right after "Składniki" (e.g. "2 sztuki").
          const y = nextContent(i + 1);
          if (servings === null && y >= 0) {
            // `[|/]` — the divider of "SKŁADNIKI / 4 PORCJE" read as its own line.
            const ym = /^[|/]?\s*(\d+)(?:\s*[-–]\s*\d+)?\s*(porcj\p{L}*|sztuk\p{L}*|os\p{L}*)$/u.exec(
              lines[y].trim().toLowerCase()
            );
            if (ym) { servings = parsePositiveInt(ym[1]); consumed[y] = true; }
          }
        }
        if (inlineRest !== null) ingredientParts.push(inlineRest);
        if (inlineRest !== null && header.kind === 'ingredients-main') inlineList = inlineRest;
        // "Składniki: a, b, c" is the whole list — a sentence after it is the method.
        afterInlineList = inlineRest !== null && inlineRest.split(', ').length >= 3;
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
        if (inlineRest !== null) instructionLines.push(inlineRest);
        continue;
      }
      // notes — an inline notes line ("Note: use cold milk.") is an aside:
      // only its remainder goes to notes and the section does NOT switch, so
      // the ingredients/steps that follow stay where they are. A bare notes
      // header line ("Wskazówki") starts the notes section.
      if (inlineRest !== null) noteLines.push(inlineRest);
      else current = 'notes';
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

    if (afterInlineList && current === 'ingredients') {
      afterInlineList = false;
      if (!QUANTITY_LINE.test(line) && !/^[-*•#]/.test(line) && /[.!?]$/.test(line) && line.split(/\s+/).length >= 4) {
        current = 'instructions';
        instructionLines.push(line);
        continue;
      }
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

    // A card's footer or a post's source link is not a step.
    if (current === 'instructions' && /^(www\.|https?:\/\/)\S+(\s.{0,40})?$/i.test(line)) {
      noteLines.push(line);
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

  // A lone number after the last step is a scanned page's number.
  while (instructionLines.length && /^\d{0,4}$/.test(instructionLines[instructionLines.length - 1])) {
    instructionLines.pop();
  }

  // No header and no numbered step. A run of amount lines is still an
  // ingredient list (a chat message, a note): what follows is the method, what
  // precedes is context for the notes — its last short line the dish's name,
  // when no title was found. Otherwise the body is the instructions (fallback
  // dump).
  if (firstBoundary === null && preamble.length) {
    const run = findIngredientRun(preamble);
    if (run) {
      const before = preamble.slice(0, run.start);
      const last = before[before.length - 1];
      if (
        title === undefined && last !== undefined && last.split(/\s+/).length <= 6 &&
        !/[.!?:]$/.test(last) && !isTitleData(last)
      ) {
        title = last.replace(/^[*_]+|[*_]+$/g, '').trim() || undefined;
        before.pop();
      }
      noteLines.unshift(...before);
      ingredientParts.push(...preamble.slice(run.start, run.end));
      instructionLines.push(...preamble.slice(run.end));
    } else {
      instructionLines.push(...preamble);
    }
  }

  // "Ciasto:" / "Farsz:" over their own items are group labels, not items.
  const isListItem = (l: string | undefined) =>
    l !== undefined && (QUANTITY_LINE.test(l) || /^[-*•]\s/.test(l));
  for (let k = 0; k < ingredientParts.length; k++) {
    const label = /^(\p{L}[\p{L} ]{1,24})\.?:$/u.exec(ingredientParts[k].trim());
    const next = ingredientParts.slice(k + 1).find((l) => l.trim());
    const isRemark = label !== null && /^(uwag[ai]|note|notes|tips?|porad[ay]|wskaz[óo]wk[ai]|ps|np|[źz]r[óo]d[łl]o|source|autor|author)$/i.test(label[1].trim());
    if (label && !isRemark && isListItem(next?.trim())) ingredientParts[k] = `# ${capitalize(label[1])}`;
  }

  // A list given whole after its header ("Potrzebujesz: 2 tortille, 150 g
  // wołowiny, 1/2 cebuli") reads — and shops — better one item per line. Not
  // one ingredient with its description ("1 kg ziemniaków, obranych,
  // pokrojonych w kostkę"): a part opening with a participle or adjective form.
  const at = inlineList === null ? -1 : ingredientParts.indexOf(inlineList);
  if (at >= 0) {
    const items = splitCommaList(inlineList!);
    const describes = (item: string) => /(ych|ich|ego|anej|onej|tej|wej|żej)$/u.test(item.split(/\s+/)[0]);
    if (items.length >= 3 && items.every((item) => item.length <= 40) && !items.slice(1).some(describes)) {
      ingredientParts.splice(at, 1, ...items);
    }
  }

  // Servings in the title ("Shakshuka (serves 2)"): the bracket is removed
  // even when a servings label already won. Applied to the final title, so a
  // late "Przepis … na:" title is covered too.
  if (title !== undefined) {
    const ts = extractTitleServings(title);
    if (servings === null) servings = ts.servings;
    title = ts.title || undefined;
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
