// Tests for the ingredients → shopping item candidates parser (SPEC.md §5.12).
// Target module: utils/ingredients.ts (pure, no native imports).

import {
  parseIngredients,
  parseIngredientLines,
  parsePastedProducts,
  splitInlineProducts,
} from '../utils/ingredients';

describe('parseIngredients — basics', () => {
  it('returns [] for empty and whitespace-only text', () => {
    expect(parseIngredients('')).toEqual([]);
    expect(parseIngredients('   \n \n\t')).toEqual([]);
  });

  it('turns each plain line into a candidate, verbatim', () => {
    expect(parseIngredients('200g flour\n100g butter')).toEqual([
      '200g flour',
      '100g butter',
    ]);
  });

  it('keeps quantities embedded in the name', () => {
    expect(parseIngredients('- 500 ml zakwasu żytniego')).toEqual([
      '500 ml zakwasu żytniego',
    ]);
  });

  it('preserves the order of appearance', () => {
    expect(parseIngredients('c\na\nb')).toEqual(['c', 'a', 'b']);
  });

  it('handles CRLF line breaks', () => {
    expect(parseIngredients('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('parseIngredients — skipped lines', () => {
  it('skips empty and whitespace-only lines', () => {
    expect(parseIngredients('a\n\n   \nb')).toEqual(['a', 'b']);
  });

  it('skips Markdown headings (grouping labels, not products)', () => {
    expect(parseIngredients('# Dough\nflour\n## Sauce\ncream')).toEqual([
      'flour',
      'cream',
    ]);
  });

  it('skips headings without a space after # (form placeholder style)', () => {
    expect(parseIngredients('#Krem\n300ml śmietanki')).toEqual([
      '300ml śmietanki',
    ]);
  });

  it('skips lines that are only a list marker', () => {
    expect(parseIngredients('-\n- \neggs')).toEqual(['eggs']);
  });
});

describe('parseIngredients — list markers', () => {
  it.each([
    ['- 3 eggs', '3 eggs'],
    ['* 3 eggs', '3 eggs'],
    ['+ 3 eggs', '3 eggs'],
    ['• 3 eggs', '3 eggs'],
  ])('strips the unordered marker in %j', (line, expected) => {
    expect(parseIngredients(line)).toEqual([expected]);
  });

  it.each([
    ['1. flour', 'flour'],
    ['2) sugar', 'sugar'],
    ['12. salt', 'salt'],
  ])('strips the ordered marker in %j', (line, expected) => {
    expect(parseIngredients(line)).toEqual([expected]);
  });

  it('trims surrounding whitespace around lines and markers', () => {
    expect(parseIngredients('  -   2 ząbki czosnku  ')).toEqual([
      '2 ząbki czosnku',
    ]);
  });

  it('does not strip a hyphen that is part of the text', () => {
    expect(parseIngredients('all-purpose flour')).toEqual([
      'all-purpose flour',
    ]);
  });
});

describe('parseIngredients — bold markers', () => {
  it('strips ** when it wraps the whole line', () => {
    expect(parseIngredients('**2 cups flour**')).toEqual(['2 cups flour']);
  });

  it('strips ** wrapping the text after a list marker', () => {
    expect(parseIngredients('- **butter**')).toEqual(['butter']);
  });

  it('keeps inner ** that does not wrap the whole line', () => {
    expect(parseIngredients('2 cups **strong** flour')).toEqual([
      '2 cups **strong** flour',
    ]);
  });

  it('skips a line that is only bold markers', () => {
    expect(parseIngredients('****')).toEqual([]);
  });
});

// The same parser backs pasting a loose product list into a shopping list
// (SPEC.md §5.16) — not just recipe ingredients. These cases pin the behavior
// for real pasted text: mixed bullet styles, numbered notes, blank-line gaps.
describe('parseIngredients — pasted shopping list (§5.16)', () => {
  it('parses a loose paste with mixed markers and blank lines', () => {
    const text = [
      'mleko 2l',
      '',
      '- chleb',
      '• masło',
      '1. 6 jajek',
      '2) ser żółty',
    ].join('\n');
    expect(parseIngredients(text)).toEqual([
      'mleko 2l',
      'chleb',
      'masło',
      '6 jajek',
      'ser żółty',
    ]);
  });

  it('keeps duplicates (no merging, §5.12/§5.16)', () => {
    expect(parseIngredients('mleko\nmleko')).toEqual(['mleko', 'mleko']);
  });
});

describe('parseIngredients — realistic input', () => {
  it('parses a sectioned ingredient list', () => {
    const text = [
      '# Zakwas',
      '- 500 ml zakwasu żytniego',
      '- 2 ząbki czosnku',
      '- liść laurowy',
      '',
      '# Wywar',
      '- 300 g białej kiełbasy',
      '- 4 jajka',
      '- 1 cebula',
      '- majeranek',
    ].join('\n');
    expect(parseIngredients(text)).toEqual([
      '500 ml zakwasu żytniego',
      '2 ząbki czosnku',
      'liść laurowy',
      '300 g białej kiełbasy',
      '4 jajka',
      '1 cebula',
      'majeranek',
    ]);
  });
});

// The rendered-line variant backs the in-recipe check-off list (SPEC.md §5.4):
// same normalization, but headings survive and items carry a stable index.
describe('parseIngredientLines', () => {
  it('returns [] for empty and whitespace-only text', () => {
    expect(parseIngredientLines('')).toEqual([]);
    expect(parseIngredientLines('   \n \n\t')).toEqual([]);
  });

  it('numbers items from 0, skipping headings', () => {
    expect(parseIngredientLines('# Dough\n- flour\n- butter')).toEqual([
      { kind: 'heading', text: 'Dough' },
      { kind: 'item', text: 'flour', index: 0 },
      { kind: 'item', text: 'butter', index: 1 },
    ]);
  });

  it('strips the # markers of a heading, with or without a space', () => {
    expect(parseIngredientLines('## Sauce\n#Krem')).toEqual([
      { kind: 'heading', text: 'Sauce' },
      { kind: 'heading', text: 'Krem' },
    ]);
  });

  it('drops a line that is only # markers', () => {
    expect(parseIngredientLines('#\n## \nflour')).toEqual([
      { kind: 'item', text: 'flour', index: 0 },
    ]);
  });

  it('keeps item indices contiguous across sections and blank lines', () => {
    const text = [
      '# Zakwas',
      '- 500 ml zakwasu żytniego',
      '',
      '# Wywar',
      '- 4 jajka',
      '- majeranek',
    ].join('\n');
    expect(parseIngredientLines(text)).toEqual([
      { kind: 'heading', text: 'Zakwas' },
      { kind: 'item', text: '500 ml zakwasu żytniego', index: 0 },
      { kind: 'heading', text: 'Wywar' },
      { kind: 'item', text: '4 jajka', index: 1 },
      { kind: 'item', text: 'majeranek', index: 2 },
    ]);
  });

  it('normalizes item text exactly like parseIngredients', () => {
    const text = [
      '# Ciasto',
      '  -   2 ząbki czosnku  ',
      '**butter**',
      '2 cups **strong** flour',
      '12. salt',
      '-',
      '',
      'all-purpose flour',
    ].join('\r\n');
    const items = parseIngredientLines(text).filter(
      (line): line is Extract<typeof line, { kind: 'item' }> =>
        line.kind === 'item'
    );
    expect(items.map((i) => i.text)).toEqual(parseIngredients(text));
    expect(items.map((i) => i.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

// Pasting into a shopping list (§5.16) splits at inline separators as well as
// line breaks; recipe ingredients (§5.12) stay line-based.
describe('splitInlineProducts', () => {
  it.each([
    ['mleko, chleb, masło', ['mleko', 'chleb', 'masło']],
    ['mleko; chleb;masło', ['mleko', 'chleb', 'masło']],
    ['mleko | chleb', ['mleko', 'chleb']],
    ['mleko • chleb • masło', ['mleko', 'chleb', 'masło']],
    ['Mleko. Chleb. Masło.', ['Mleko', 'Chleb', 'Masło']],
    ['mleko. chleb', ['mleko', 'chleb']],
    ['mleko,,  , chleb,', ['mleko', 'chleb']],
  ] as const)('%p -> %p', (line, expected) => {
    expect(splitInlineProducts(line)).toEqual([...expected]);
  });

  it('keeps decimal commas and periods', () => {
    expect(splitInlineProducts('2,5 kg ziemniaków, 1.5 l mleka')).toEqual([
      '2,5 kg ziemniaków',
      '1.5 l mleka',
    ]);
  });

  it('does not split inside brackets', () => {
    expect(splitInlineProducts('mąka (typ 650, 1 kg), cukier [biały; drobny]')).toEqual([
      'mąka (typ 650, 1 kg)',
      'cukier [biały; drobny]',
    ]);
  });

  it('keeps a period after an abbreviation unless a capital follows', () => {
    expect(splitInlineProducts('2 szt. jajek, ok. 1 kg jabłek')).toEqual([
      '2 szt. jajek',
      'ok. 1 kg jabłek',
    ]);
    expect(splitInlineProducts('jajka 10 szt. Mleko')).toEqual(['jajka 10 szt', 'Mleko']);
  });

  it('keeps a period with no space after it (e.g. a domain or initials)', () => {
    expect(splitInlineProducts('sok Tymbark.pl')).toEqual(['sok Tymbark.pl']);
  });

  it('returns [] for separators only', () => {
    expect(splitInlineProducts(' , ; . ')).toEqual([]);
  });
});

describe('parsePastedProducts', () => {
  it('splits a one-line comma list', () => {
    expect(parsePastedProducts('mleko, chleb, masło, 6 jajek')).toEqual([
      'mleko',
      'chleb',
      'masło',
      '6 jajek',
    ]);
  });

  it('mixes lines, markers and inline separators', () => {
    const text = ['# Nabiał', '- mleko, jogurt', '• ser; masło', '', '1. chleb'].join('\n');
    expect(parsePastedProducts(text)).toEqual([
      'mleko',
      'jogurt',
      'ser',
      'masło',
      'chleb',
    ]);
  });

  it('strips a list marker that starts an inline piece', () => {
    expect(parsePastedProducts('1. mleko, 2. chleb')).toEqual(['mleko', 'chleb']);
  });

  it('still parses one product per line like parseIngredients', () => {
    const text = 'mleko 2l\n\n- chleb\n• masło\n2) ser żółty';
    expect(parsePastedProducts(text)).toEqual(parseIngredients(text));
  });

  it('keeps duplicates', () => {
    expect(parsePastedProducts('mleko, mleko')).toEqual(['mleko', 'mleko']);
  });

  it('leaves recipe ingredient parsing line-based', () => {
    expect(parseIngredients('sól, pieprz do smaku')).toEqual(['sól, pieprz do smaku']);
  });
});
