// TDD red phase for single-recipe import (SPEC.md §5.15).
// The module utils/recipeImport.ts does not exist yet; these tests should
// fail because of the missing implementation, not setup errors.
import {
  parseIsoDuration,
  parseRecipeJsonLd,
  parsePastedRecipe,
} from '../utils/recipeImport';

// Wraps a single JSON-LD object in a <script> tag, as it appears in page HTML.
function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

describe('parseIsoDuration', () => {
  it('PT1H30M -> 90', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90);
  });

  it('PT45M -> 45', () => {
    expect(parseIsoDuration('PT45M')).toBe(45);
  });

  it('PT2H -> 120', () => {
    expect(parseIsoDuration('PT2H')).toBe(120);
  });

  it('PT15M -> 15', () => {
    expect(parseIsoDuration('PT15M')).toBe(15);
  });

  it('PT0M -> null (zero duration is treated as no value)', () => {
    expect(parseIsoDuration('PT0M')).toBeNull();
  });

  it('ignores seconds: PT1M30S -> 1', () => {
    expect(parseIsoDuration('PT1M30S')).toBe(1);
  });

  it('ignores the date part: P1DT2H -> 120 (days dropped, 2h kept)', () => {
    expect(parseIsoDuration('P1DT2H')).toBe(120);
  });

  it('undefined -> null', () => {
    expect(parseIsoDuration(undefined)).toBeNull();
  });

  it('missing/empty string -> null', () => {
    expect(parseIsoDuration('')).toBeNull();
  });

  it('malformed "15 min" -> null', () => {
    expect(parseIsoDuration('15 min')).toBeNull();
  });

  it('a number input (15) -> null (only ISO duration strings accepted)', () => {
    expect(parseIsoDuration(15)).toBeNull();
  });
});

describe('parseRecipeJsonLd', () => {
  it('maps a single Recipe block (all fields)', () => {
    const html = ldScript({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Pancakes',
      recipeIngredient: ['2 eggs', '1 cup flour', 'milk'],
      recipeInstructions: 'Mix everything. Fry.',
      prepTime: 'PT10M',
      cookTime: 'PT20M',
      recipeYield: 4,
    });
    const r = parseRecipeJsonLd(html);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Pancakes');
    expect(r!.ingredients).toBe('2 eggs\n1 cup flour\nmilk');
    expect(r!.instructions).toBe('Mix everything. Fry.');
    expect(r!.prepTime).toBe(10);
    expect(r!.cookTime).toBe(20);
    expect(r!.servings).toBe(4);
  });

  it('recipeInstructions as HowToStep[] -> joined with \\n', () => {
    const html = ldScript({
      '@type': 'Recipe',
      name: 'Steps',
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Step one' },
        { '@type': 'HowToStep', text: 'Step two' },
        { '@type': 'HowToStep', text: 'Step three' },
      ],
    });
    expect(parseRecipeJsonLd(html)!.instructions).toBe(
      'Step one\nStep two\nStep three'
    );
  });

  it('recipeInstructions as HowToSection[] -> flattened, joined with \\n', () => {
    const html = ldScript({
      '@type': 'Recipe',
      name: 'Sections',
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          itemListElement: [
            { '@type': 'HowToStep', text: 'A1' },
            { '@type': 'HowToStep', text: 'A2' },
          ],
        },
        {
          '@type': 'HowToSection',
          itemListElement: [{ '@type': 'HowToStep', text: 'B1' }],
        },
      ],
    });
    expect(parseRecipeJsonLd(html)!.instructions).toBe('A1\nA2\nB1');
  });

  it('@graph array containing a Recipe among non-Recipe nodes -> found', () => {
    const html = ldScript({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Some Blog' },
        { '@type': 'Person', name: 'Author' },
        { '@type': 'Recipe', name: 'Graph Recipe' },
      ],
    });
    expect(parseRecipeJsonLd(html)!.title).toBe('Graph Recipe');
  });

  it('@type as array ["Recipe","NewsArticle"] -> found', () => {
    const html = ldScript({
      '@type': ['Recipe', 'NewsArticle'],
      name: 'Array Type',
    });
    expect(parseRecipeJsonLd(html)!.title).toBe('Array Type');
  });

  it('multiple script blocks, only the second is a Recipe -> found', () => {
    const html =
      ldScript({ '@type': 'WebSite', name: 'Not a recipe' }) +
      ldScript({ '@type': 'Recipe', name: 'Second Block' });
    expect(parseRecipeJsonLd(html)!.title).toBe('Second Block');
  });

  it('two Recipes -> the first in block order wins', () => {
    const html =
      ldScript({ '@type': 'Recipe', name: 'First Wins' }) +
      ldScript({ '@type': 'Recipe', name: 'Second Loses' });
    expect(parseRecipeJsonLd(html)!.title).toBe('First Wins');
  });

  describe('recipeYield parsing', () => {
    it('string "4 servings" -> 4', () => {
      const html = ldScript({ '@type': 'Recipe', name: 'Y', recipeYield: '4 servings' });
      expect(parseRecipeJsonLd(html)!.servings).toBe(4);
    });

    it('string "a lot" -> null', () => {
      const html = ldScript({ '@type': 'Recipe', name: 'Y', recipeYield: 'a lot' });
      expect(parseRecipeJsonLd(html)!.servings).toBeNull();
    });

    it('array ["4","4 servings"] -> 4 (first element)', () => {
      const html = ldScript({ '@type': 'Recipe', name: 'Y', recipeYield: ['4', '4 servings'] });
      expect(parseRecipeJsonLd(html)!.servings).toBe(4);
    });

    it('number 4 -> 4', () => {
      const html = ldScript({ '@type': 'Recipe', name: 'Y', recipeYield: 4 });
      expect(parseRecipeJsonLd(html)!.servings).toBe(4);
    });

    it('missing -> servings is falsy (null/undefined)', () => {
      const html = ldScript({ '@type': 'Recipe', name: 'Y' });
      expect(parseRecipeJsonLd(html)!.servings).toBeFalsy();
    });
  });

  it('prepTime/cookTime missing -> null', () => {
    const html = ldScript({ '@type': 'Recipe', name: 'NoTimes' });
    const r = parseRecipeJsonLd(html)!;
    expect(r.prepTime).toBeNull();
    expect(r.cookTime).toBeNull();
  });

  it('prepTime/cookTime malformed -> null', () => {
    const html = ldScript({
      '@type': 'Recipe',
      name: 'BadTimes',
      prepTime: '10 minutes',
      cookTime: 'soon',
    });
    const r = parseRecipeJsonLd(html)!;
    expect(r.prepTime).toBeNull();
    expect(r.cookTime).toBeNull();
  });

  it('recipeIngredient missing -> ingredients is falsy/empty', () => {
    const html = ldScript({ '@type': 'Recipe', name: 'NoIngredients' });
    expect(parseRecipeJsonLd(html)!.ingredients).toBeFalsy();
  });

  it('no Recipe anywhere -> null', () => {
    const html =
      ldScript({ '@type': 'WebSite', name: 'Blog' }) +
      ldScript({ '@type': 'Person', name: 'Author' });
    expect(parseRecipeJsonLd(html)).toBeNull();
  });

  it('one malformed JSON block plus one valid Recipe block -> still found', () => {
    const html =
      '<script type="application/ld+json">{ this is not valid json }</script>' +
      ldScript({ '@type': 'Recipe', name: 'Survivor' });
    expect(parseRecipeJsonLd(html)!.title).toBe('Survivor');
  });

  it("empty html '' -> null", () => {
    expect(parseRecipeJsonLd('')).toBeNull();
  });
});

describe('parsePastedRecipe', () => {
  it('first non-empty line -> title (skips leading blank lines)', () => {
    const text = '\n\n  Chocolate Cake  \nsome body text';
    const r = parsePastedRecipe(text);
    expect(r.title).toBe('Chocolate Cake');
  });

  it('EN headers Ingredients/Instructions split the body (case-insensitive, trailing colon)', () => {
    const text = [
      'My Recipe',
      'INGREDIENTS:',
      'flour',
      'sugar',
      'instructions',
      'Mix.',
      'Bake.',
    ].join('\n');
    const r = parsePastedRecipe(text);
    expect(r.title).toBe('My Recipe');
    expect(r.ingredients).toBe('flour\nsugar');
    expect(r.instructions).toBe('Mix.\nBake.');
  });

  it('PL headers Składniki/Przygotowanie split the body', () => {
    const text = [
      'Naleśniki',
      'Składniki',
      'mąka',
      'jajka',
      'Przygotowanie',
      'Wymieszać.',
      'Usmażyć.',
    ].join('\n');
    const r = parsePastedRecipe(text);
    expect(r.title).toBe('Naleśniki');
    expect(r.ingredients).toBe('mąka\njajka');
    expect(r.instructions).toBe('Wymieszać.\nUsmażyć.');
  });

  it('PL steps header "Sposób przygotowania" is recognized', () => {
    const text = [
      'Zupa',
      'Składniki',
      'woda',
      'Sposób przygotowania',
      'Zagotować.',
    ].join('\n');
    const r = parsePastedRecipe(text);
    expect(r.ingredients).toBe('woda');
    expect(r.instructions).toBe('Zagotować.');
  });

  it('sections in either order (instructions before ingredients)', () => {
    const text = [
      'Reverse Recipe',
      'Instructions',
      'Do this.',
      'Ingredients',
      'one thing',
    ].join('\n');
    const r = parsePastedRecipe(text);
    expect(r.ingredients).toBe('one thing');
    expect(r.instructions).toBe('Do this.');
  });

  it('no recognizable header -> whole body goes to instructions, ingredients empty', () => {
    const text = ['Just A Title', 'line one', 'line two', 'line three'].join('\n');
    const r = parsePastedRecipe(text);
    expect(r.title).toBe('Just A Title');
    expect(r.ingredients).toBe('');
    expect(r.instructions).toBe('line one\nline two\nline three');
  });

  it('empty/whitespace-only input -> no title, empty fields', () => {
    const r = parsePastedRecipe('   \n\n  \t ');
    expect(r.title).toBeUndefined();
    expect(r.ingredients).toBe('');
    expect(r.instructions).toBe('');
  });

  it("empty string '' -> no title, empty fields, does not throw", () => {
    const r = parsePastedRecipe('');
    expect(r.title).toBeUndefined();
    expect(r.ingredients).toBe('');
    expect(r.instructions).toBe('');
  });

  // ----- real-world blog patterns (SPEC §5.15) -----

  it('extracts prep/cook/servings from labeled lines and removes them from the body', () => {
    const r = parsePastedRecipe(
      [
        'Leniwe kluski',
        'Czas przygotowania: 30 minut',
        'Czas gotowania klusek łącznie: 10 minut',
        'Liczba porcji: 50 klusek',
        'Składniki',
        '500 g twarogu',
      ].join('\n')
    );
    expect(r.title).toBe('Leniwe kluski');
    expect(r.prepTime).toBe(30);
    expect(r.cookTime).toBe(10);
    expect(r.servings).toBe(50);
    expect(r.ingredients).toBe('500 g twarogu');
  });

  it('combined hours + minutes -> total minutes', () => {
    const r = parsePastedRecipe(['Tytuł', 'Czas pieczenia: 1 godzina 30 minut', 'Składniki', 'x'].join('\n'));
    expect(r.cookTime).toBe(90);
  });

  it('no reliable title (first content is metadata/header) -> title undefined', () => {
    const r = parsePastedRecipe(
      ['Czas przygotowania: 30 minut', 'Liczba porcji: 4', 'Składniki', 'mąka'].join('\n')
    );
    expect(r.title).toBeUndefined();
    expect(r.prepTime).toBe(30);
    expect(r.servings).toBe(4);
    expect(r.ingredients).toBe('mąka');
  });

  it('"Przepis ... na:" marker -> next line is the title; instructions follow', () => {
    const r = parsePastedRecipe(
      ['Składniki:', 'ryż', 'Przepis i sposób przygotowania na:', "Sałatka a'la sushi", '1. Gotujemy ryż.'].join('\n')
    );
    expect(r.title).toBe("Sałatka a'la sushi");
    expect(r.ingredients).toBe('ryż');
    expect(r.instructions).toBe('1. Gotujemy ryż.');
  });

  it('drops intro/tagline between the title and the Składniki header', () => {
    const r = parsePastedRecipe(
      [
        'Ciasto na pizzę',
        'Pyszna domowa pizza krok po kroku',
        'Przepis na łatwe ciasto.',
        'Składniki',
        '250 g mąki',
        'Przygotowanie',
        'Wymieszać.',
      ].join('\n')
    );
    expect(r.title).toBe('Ciasto na pizzę');
    expect(r.ingredients).toBe('250 g mąki');
    expect(r.instructions).toBe('Wymieszać.');
  });

  it('numbered steps start instructions even without a method header', () => {
    const r = parsePastedRecipe(
      ['Pączki', 'Ciasto', '450 g mąki', '2 jajka', '1. Wymieszaj.', '2. Usmaż.'].join('\n')
    );
    expect(r.title).toBe('Pączki');
    expect(r.ingredients).toBe('Ciasto\n450 g mąki\n2 jajka');
    expect(r.instructions).toBe('1. Wymieszaj.\n2. Usmaż.');
  });

  it('merges a quantity-only line onto the previous ingredient name', () => {
    const r = parsePastedRecipe(
      ['Składniki:', 'ryż do sushi', '250 g', 'ogórek', '1 sztuka', 'wasabi', 'sos sojowy', '4 łyżki'].join('\n')
    );
    expect(r.ingredients).toBe('ryż do sushi – 250 g\nogórek – 1 sztuka\nwasabi\nsos sojowy – 4 łyżki');
  });

  it('routes a trailing tips section (Wskazówki) to notes', () => {
    const r = parsePastedRecipe(
      ['Zupa', 'Składniki', 'woda', 'Przygotowanie', 'Zagotować.', 'Wskazówki', 'Można dodać śmietanę.'].join('\n')
    );
    expect(r.instructions).toBe('Zagotować.');
    expect(r.notes).toBe('Można dodać śmietanę.');
  });

  it('routes "Rady/porady" to notes', () => {
    const r = parsePastedRecipe(['Pączki', 'Składniki', 'mąka', 'Rady/porady', 'Smaż w 175°C.'].join('\n'));
    expect(r.notes).toBe('Smaż w 175°C.');
  });

  it('drops UI-chrome noise lines (Udostępnij / Zapisz PDF / Dodaj do ulubionych)', () => {
    const r = parsePastedRecipe(
      [
        'Sałatka',
        'Składniki:',
        'sól',
        'Udostępnij przepis',
        'Zapisz przepis w PDF',
        'Dodaj do ulubionych',
        'Przygotowanie',
        'Wymieszać.',
      ].join('\n')
    );
    expect(r.ingredients).toBe('sól');
    expect(r.instructions).toBe('Wymieszać.');
  });

  it('converts "Składniki na X" sub-sections into ingredient group headings', () => {
    const r = parsePastedRecipe(
      ['Leniwe', 'Składniki na leniwe', '500 g twarogu', 'Składniki na sos waniliowy', '2 łyżki masła'].join('\n')
    );
    expect(r.ingredients).toBe('# Leniwe\n500 g twarogu\n# Sos waniliowy\n2 łyżki masła');
  });

  it('captures a standalone yield line ("2 sztuki") right after Składniki as servings', () => {
    const r = parsePastedRecipe(['Pizza', 'Składniki', '2 sztuki', '250 g mąki', 'Przygotowanie', 'Piec.'].join('\n'));
    expect(r.servings).toBe(2);
    expect(r.ingredients).toBe('250 g mąki');
  });

  it('English metadata labels: Prep / Cook / Serves', () => {
    const r = parsePastedRecipe(
      ['Easy Pancakes', 'Prep: 10 mins', 'Cook: 20 mins', 'Serves 4', 'Ingredients', '100g flour', 'Method', '1. Whisk.'].join('\n')
    );
    expect(r.title).toBe('Easy Pancakes');
    expect(r.prepTime).toBe(10);
    expect(r.cookTime).toBe(20);
    expect(r.servings).toBe(4);
    expect(r.ingredients).toBe('100g flour');
    expect(r.instructions).toBe('1. Whisk.');
  });

  it('"Krok N" / "Step N" headings start the instructions (no method header)', () => {
    const r = parsePastedRecipe(
      ['Pierogi', 'Składniki', '500 g mąki', 'Krok 1: Zagnieć ciasto', 'Wyrabiaj 10 minut.', 'Krok 2: Ulep', 'Sklejaj brzegi.'].join('\n')
    );
    expect(r.ingredients).toBe('500 g mąki');
    expect(r.instructions).toBe('Krok 1: Zagnieć ciasto\nWyrabiaj 10 minut.\nKrok 2: Ulep\nSklejaj brzegi.');
  });

  it('English "Tip" header routes to notes', () => {
    const r = parsePastedRecipe(['Pancakes', 'Ingredients', 'flour', 'Method', 'Whisk.', 'Tip', 'Rest the batter.'].join('\n'));
    expect(r.instructions).toBe('Whisk.');
    expect(r.notes).toBe('Rest the batter.');
  });

  it('drops more UI chrome + rating lines (Kopiuj / Ukryj zdjęcia / Drukuj Przepis / Średnia x / 5)', () => {
    const r = parsePastedRecipe(
      [
        'Pierogi',
        'Składniki:',
        'mąka',
        'Kopiuj',
        'Ukryj zdjęcia',
        'Przygotowanie',
        'Zagnieć.',
        'Średnia 4.8 / 5 (8794 oceny)',
        'Drukuj Przepis',
        'Dodaj Notatkę',
      ].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Zagnieć.');
  });
});
