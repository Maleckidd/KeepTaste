// Title + ingredient search (SPEC.md §5.3). Pure logic: diacritic folding,
// light stemming of long query words, AND across title/ingredients, title
// matches ranked before ingredient matches, and a cleaned "hint" line showing
// which ingredient matched.
import {
  STEM_MIN_LENGTH,
  normalizeForSearch,
  queryTerms,
  cleanIngredientLine,
  matchRecipes,
} from '../utils/search';
import { partitionToTry } from '../utils/toTry';

type R = { id: number; title: string; ingredients: string; toTry: number };

let nextId = 1;
function r(title: string, ingredients = '', toTry = 0): R {
  return { id: nextId++, title, ingredients, toTry };
}

describe('STEM_MIN_LENGTH', () => {
  it('is 5', () => {
    expect(STEM_MIN_LENGTH).toBe(5);
  });
});

describe('normalizeForSearch', () => {
  it('lowercases and folds Polish diacritics: "Żurek" → "zurek"', () => {
    expect(normalizeForSearch('Żurek')).toBe('zurek');
  });

  it('folds every uppercase Polish letter', () => {
    expect(normalizeForSearch('ĄĆĘŁŃÓŚŹŻ')).toBe('acelnoszz');
  });

  it('folds every lowercase Polish letter', () => {
    expect(normalizeForSearch('ąćęłńóśźż')).toBe('acelnoszz');
  });

  it('lowercases plain ASCII: "Pasta" → "pasta"', () => {
    expect(normalizeForSearch('Pasta')).toBe('pasta');
  });

  it('leaves already-normal text (incl. markers, digits) unchanged', () => {
    expect(normalizeForSearch('- 2 cukinie')).toBe('- 2 cukinie');
  });
});

describe('queryTerms', () => {
  it('empty query → []', () => {
    expect(queryTerms('')).toEqual([]);
  });

  it('whitespace-only query → []', () => {
    expect(queryTerms('   ')).toEqual([]);
  });

  it('trims, splits on runs of spaces, stems words of length >= 5', () => {
    expect(queryTerms('  feta   cukinia ')).toEqual(['feta', 'cukini']);
  });

  it('normalizes before stemming: "Żurek" → ["zure"]', () => {
    expect(queryTerms('Żurek')).toEqual(['zure']);
  });

  it('keeps short words (< 5) as typed: "jajo" → ["jajo"]', () => {
    expect(queryTerms('jajo')).toEqual(['jajo']);
  });

  it('uppercase + diacritics: "ŁOSOŚ" → ["loso"]', () => {
    expect(queryTerms('ŁOSOŚ')).toEqual(['loso']);
  });

  it('splits on tabs and newlines too', () => {
    expect(queryTerms('feta\tjajo\nsól')).toEqual(['feta', 'jajo', 'sol']);
  });
});

describe('cleanIngredientLine', () => {
  it('strips a "-" list marker', () => {
    expect(cleanIngredientLine('- 2 cukinie')).toBe('2 cukinie');
  });

  it('strips a "*" list marker', () => {
    expect(cleanIngredientLine('* 1 łyżka')).toBe('1 łyżka');
  });

  it('strips a "+" list marker', () => {
    expect(cleanIngredientLine('+ szczypta soli')).toBe('szczypta soli');
  });

  it('strips a "•" bullet', () => {
    expect(cleanIngredientLine('• sól')).toBe('sól');
  });

  it('strips an ordered "1." marker', () => {
    expect(cleanIngredientLine('1. mąka')).toBe('mąka');
  });

  it('strips an ordered "1)" marker', () => {
    expect(cleanIngredientLine('1) mąka')).toBe('mąka');
  });

  it('strips bold wrapping the whole line', () => {
    expect(cleanIngredientLine('**2 jajka**')).toBe('2 jajka');
  });

  it('strips leftover inline ** after the list marker', () => {
    expect(cleanIngredientLine('- 200 g **feta**')).toBe('200 g feta');
  });

  it('strips heading markers: "# Sos" → "Sos"', () => {
    expect(cleanIngredientLine('# Sos')).toBe('Sos');
  });

  it('strips multi-# heading markers: "## Sos" → "Sos"', () => {
    expect(cleanIngredientLine('## Sos')).toBe('Sos');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanIngredientLine('  plain  ')).toBe('plain');
  });

  it('keeps original casing and diacritics', () => {
    expect(cleanIngredientLine('- 200 g Mąki pszennej')).toBe(
      '200 g Mąki pszennej'
    );
  });

  it('falls back to the trimmed raw line when cleaning leaves nothing', () => {
    expect(cleanIngredientLine('  -  ')).toBe('-');
    expect(cleanIngredientLine('#')).toBe('#');
  });
});

describe('matchRecipes — empty query', () => {
  const recipes = [r('Żurek'), r('Pasta Carbonara', '- 200 g boczku'), r('Sałatka')];

  it.each(['', '   ', '\t\n'])('query %j → all recipes, input order', (q) => {
    const result = matchRecipes(recipes, q);
    expect(result.map((m) => m.recipe)).toEqual(recipes);
    for (const m of result) {
      expect(m.matchedIn).toBe('title');
      expect(m.ingredientHint).toBeNull();
    }
  });

  it('returns the same object references', () => {
    const result = matchRecipes(recipes, '');
    result.forEach((m, i) => expect(m.recipe).toBe(recipes[i]));
  });
});

describe('matchRecipes — diacritic folding', () => {
  const zurek = r('Żurek');

  it.each(['zurek', 'żurek', 'ŻUREK', 'Żurek'])(
    'query %j finds title "Żurek"',
    (q) => {
      const result = matchRecipes([zurek], q);
      expect(result).toHaveLength(1);
      expect(result[0].recipe).toBe(zurek);
      expect(result[0].matchedIn).toBe('title');
    }
  );

  it('query "Żurek" finds plain-ASCII title "zurek"', () => {
    const plain = r('zurek');
    expect(matchRecipes([plain], 'Żurek').map((m) => m.recipe)).toEqual([plain]);
  });

  it('folds in ingredients too: query "mąki" finds "Mąki"', () => {
    const pancakes = r('Naleśniki', '- 200 g Mąki pszennej');
    const result = matchRecipes([pancakes], 'mąki');
    expect(result).toHaveLength(1);
    expect(result[0].matchedIn).toBe('ingredients');
    expect(result[0].ingredientHint).toBe('200 g Mąki pszennej');
  });
});

describe('matchRecipes — stemming', () => {
  it('"cukinia" finds ingredient "- 2 cukinie"', () => {
    const rec = r('Leczo', '- 2 cukinie');
    expect(matchRecipes([rec], 'cukinia')).toHaveLength(1);
  });

  it('"pomidor" finds ingredient "pomidory"', () => {
    const rec = r('Sos', '- 4 pomidory');
    expect(matchRecipes([rec], 'pomidor')).toHaveLength(1);
  });

  it('"łosoś" finds title "Łosoś pieczony z warzywami"', () => {
    const rec = r('Łosoś pieczony z warzywami');
    const result = matchRecipes([rec], 'łosoś');
    expect(result).toHaveLength(1);
    expect(result[0].matchedIn).toBe('title');
  });

  it('short words match as typed: "jaj" finds "2 jajka"', () => {
    const rec = r('Omlet', '- 2 jajka');
    expect(matchRecipes([rec], 'jaj')).toHaveLength(1);
  });

  it('short words are not stemmed: "feta" does NOT find "fet"', () => {
    const rec = r('Coś', '- fet');
    expect(matchRecipes([rec], 'feta')).toEqual([]);
  });
});

describe('matchRecipes — substring and AND semantics', () => {
  it('mid-word substring: "carbon" finds "Pasta Carbonara"', () => {
    const rec = r('Pasta Carbonara');
    expect(matchRecipes([rec], 'carbon').map((m) => m.recipe)).toEqual([rec]);
  });

  it('AND across fields: "łosoś cukinia" matches title Łosoś + ingredient cukinie', () => {
    const rec = r('Łosoś', '- 2 cukinie');
    const result = matchRecipes([rec], 'łosoś cukinia');
    expect(result).toHaveLength(1);
    expect(result[0].matchedIn).toBe('ingredients');
  });

  it('AND: "łosoś pizza" → nothing when one term matches nowhere', () => {
    const rec = r('Łosoś', '- 2 cukinie');
    expect(matchRecipes([rec], 'łosoś pizza')).toEqual([]);
  });

  it('AND within ingredients: "cukinia feta" needs both', () => {
    const both = r('Zapiekanka', '- 2 cukinie\n- 200 g feta');
    const onlyCukinia = r('Leczo', '- 2 cukinie');
    const onlyFeta = r('Sałatka grecka', '- 200 g feta');
    expect(
      matchRecipes([onlyCukinia, both, onlyFeta], 'cukinia feta').map((m) => m.recipe)
    ).toEqual([both]);
  });

  it('searches raw markdown: "feta" finds "**feta**"', () => {
    const rec = r('Sałatka', '- 200 g **feta**');
    const result = matchRecipes([rec], 'feta');
    expect(result).toHaveLength(1);
    expect(result[0].ingredientHint).toBe('200 g feta');
  });

  it('no match → []', () => {
    expect(matchRecipes([r('Żurek', '- zakwas')], 'pizza')).toEqual([]);
  });
});

describe('matchRecipes — ordering', () => {
  it('title group first, then ingredients group, each stable in input order', () => {
    const A = r('Leczo', '- 2 cukinie');
    const B = r('Cukinia faszerowana');
    const C = r('Zapiekanka', '- 1 cukinia');
    const D = r('Placki z cukinii');
    const result = matchRecipes([A, B, C, D], 'cukinia');
    expect(result.map((m) => m.recipe)).toEqual([B, D, A, C]);
    expect(result.map((m) => m.matchedIn)).toEqual([
      'title',
      'title',
      'ingredients',
      'ingredients',
    ]);
  });

  it('a mixed match (title has only some terms) is "ingredients", after pure title matches', () => {
    const mixed = r('Łosoś', '- 2 cukinie');
    const pureTitle = r('Łosoś z cukinią', '');
    const result = matchRecipes([mixed, pureTitle], 'łosoś cukinia');
    expect(result.map((m) => m.recipe)).toEqual([pureTitle, mixed]);
    expect(result[0].matchedIn).toBe('title');
    expect(result[1].matchedIn).toBe('ingredients');
  });

  it('a title match whose ingredients also match stays in the title group', () => {
    const rec = r('Cukinia faszerowana', '- 2 cukinie');
    const result = matchRecipes([rec], 'cukinia');
    expect(result[0].matchedIn).toBe('title');
    expect(result[0].ingredientHint).toBeNull();
  });
});

describe('matchRecipes — ingredient hint', () => {
  const salmon = () =>
    r(
      'Łosoś pieczony z warzywami',
      '- 2 filety z łososia (po około 180 g)\n- 2 cukinie\n- 1 czerwona papryka'
    );

  it('acceptance: "cukinia" → ingredients match with hint "2 cukinie"', () => {
    const rec = salmon();
    const result = matchRecipes([rec], 'cukinia');
    expect(result).toEqual([
      { recipe: rec, matchedIn: 'ingredients', ingredientHint: '2 cukinie' },
    ]);
  });

  it('acceptance: "łosoś cukinia" → hint skips the łosoś line the title already covers', () => {
    const rec = salmon();
    const result = matchRecipes([rec], 'łosoś cukinia');
    expect(result).toHaveLength(1);
    expect(result[0].matchedIn).toBe('ingredients');
    expect(result[0].ingredientHint).toBe('2 cukinie');
  });

  it('first matching line wins', () => {
    const rec = r('Leczo', '- 1 cukinia duża\n- 2 cukinie małe');
    expect(matchRecipes([rec], 'cukinia')[0].ingredientHint).toBe(
      '1 cukinia duża'
    );
  });

  it('handles CRLF line endings (no stray \\r in the hint)', () => {
    const rec = r('Leczo', '- 200 g mąki\r\n- 2 cukinie\r\n- sól');
    expect(matchRecipes([rec], 'cukinia')[0].ingredientHint).toBe('2 cukinie');
  });

  it('title-group matches have a null hint', () => {
    const rec = r('Żurek', '- zakwas');
    expect(matchRecipes([rec], 'żurek')[0].ingredientHint).toBeNull();
  });

  it('keeps original casing and diacritics in the hint', () => {
    const rec = r('Ryba', '- 1 Łosoś norweski');
    expect(matchRecipes([rec], 'losos')[0].ingredientHint).toBe(
      '1 Łosoś norweski'
    );
  });
});

describe('matchRecipes — identity and composition', () => {
  it('returns the same object reference in `recipe`', () => {
    const rec = r('Leczo', '- 2 cukinie');
    expect(matchRecipes([rec], 'cukinia')[0].recipe).toBe(rec);
  });

  it('does not mutate the input array', () => {
    const A = r('Leczo', '- 2 cukinie');
    const B = r('Cukinia faszerowana');
    const input = [A, B];
    matchRecipes(input, 'cukinia');
    expect(input).toEqual([A, B]);
  });

  it('partitionToTry over matches keeps title-before-ingredient order in both buckets', () => {
    const A = r('Leczo', '- 2 cukinie', 0); // ingredients, normal
    const B = r('Cukinia faszerowana', '', 1); // title, to try
    const C = r('Zapiekanka', '- 1 cukinia', 1); // ingredients, to try
    const D = r('Placki z cukinii', '', 0); // title, normal
    const ordered = matchRecipes([A, B, C, D], 'cukinia').map((m) => m.recipe);
    const { normal, toTry } = partitionToTry(ordered);
    expect(normal).toEqual([D, A]);
    expect(toTry).toEqual([B, C]);
  });
});
