// Tests for the ingredients → shopping item candidates parser (SPEC.md §5.12).
// Target module: utils/ingredients.ts (pure, no native imports).

import { parseIngredients } from '../utils/ingredients';

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
