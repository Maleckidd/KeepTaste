// TDD red phase for single-recipe import (SPEC.md §5.15).
// The module utils/recipeImport.ts does not exist yet; these tests should
// fail because of the missing implementation, not setup errors.
import {
  parseIsoDuration,
  parseRecipeJsonLd,
  parsePastedRecipe,
} from '../utils/recipeImport';
// Package D (SPEC.md §5.15): inline headers + servings in the title.
import { extractTitleServings } from '@/utils/recipeImport';
import { cleanAiResponse } from '@/utils/aiTranscribe';

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

  it('cook-time label survives OCR letter noise before the "-enia" stem', () => {
    // Real ML Kit read of "Czas smażenia: 25 min" (§5.15 T3), after normalizeOcrText.
    for (const label of ['Czas smnażenia: 25 min', 'Czas wypieczenia: 25 min']) {
      const r = parsePastedRecipe(['Tytuł', label, 'Składniki', 'x'].join('\n'));
      expect(r.cookTime).toBe(25);
    }
  });

  it('"Czas przygotowania" stays the prep time, never the cook time', () => {
    const r = parsePastedRecipe(['Tytuł', 'Czas przygotowania: 20 min', 'Składniki', 'x'].join('\n'));
    expect(r.prepTime).toBe(20);
    expect(r.cookTime).toBeNull();
  });

  it('ingredients header carrying the yield ("SKŁADNIKI / 4 PORCJE") sets servings', () => {
    for (const h of ['SKŁADNIKI / 4 PORCJE', 'Składniki (4 porcje)', 'Składniki – 6 osób', 'INGREDIENTS / 2 SERVINGS']) {
      const r = parsePastedRecipe(['Tytuł', h, 'mąka', 'Przygotowanie', 'Wymieszaj.'].join('\n'));
      expect(r.servings).toBeGreaterThan(1);
      expect(r.ingredients).toBe('mąka');
    }
  });

  it('OCR-mangled "Sktadniki" and "Przygotowanie krok po kroku" are still headers', () => {
    const r = parsePastedRecipe(
      ['Menu', 'Blog', 'Sktadniki', 'mąka', 'Przygotowanie krok po kroku', 'Krok 1', 'Wymieszaj.'].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Krok 1\nWymieszaj.');
  });

  it('drops button-like lines ("EMAIL >", "Dowiedz się więcej") and routes "Dobra rada" to notes', () => {
    const r = parsePastedRecipe(
      ['Tytuł', 'Składniki', 'mąka', 'EMAIL >', 'Przygotowanie', 'Wymieszaj.', 'STERUJ GŁOSEM ›',
        'Dowiedz się więcej', 'Dobra rada:', 'Dodaj szczyptę soli.'].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Wymieszaj.');
    expect(r.notes).toBe('Dodaj szczyptę soli.');
  });

  it('drops a chrome label with a stray icon letter OCR glued on ("DODAJ NOTATKĘ E")', () => {
    const r = parsePastedRecipe(['Tytuł', 'Składniki', 'mąka', 'Przygotowanie', 'DODAJ NOTATKĘ E', 'Wymieszaj.'].join('\n'));
    expect(r.instructions).toBe('Wymieszaj.');
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

  // ----- Package D: inline headers ("Method: Soften onion…") (SPEC §5.15) -----

  it('persona sample (chat-pasted shakshuka): inline Method header + servings in the title', () => {
    // Verbatim from persona-lab/runs/20261023-094525/skeptic-60-seconds/run-2/persona.json "materials".
    const text =
      'Quick shakshuka (serves 2)\nIngredients:\n- 2 tbsp olive oil\n- 1 onion, diced\n- 1 red pepper, sliced\n- 2 garlic cloves\n- 1 tsp cumin, 1 tsp paprika\n- 400 g tin chopped tomatoes\n- 4 eggs\n- handful of coriander\nMethod: Soften onion and pepper 5 min. Add garlic and spices 1 min. Tip in tomatoes, simmer 10 min. Make 4 wells, crack in eggs, cover 6-8 min. Top with coriander.';
    const r = parsePastedRecipe(text);
    expect(r.title).toBe('Quick shakshuka');
    expect(r.servings).toBe(2);
    expect(r.prepTime).toBeNull();
    expect(r.cookTime).toBeNull();
    expect(r.ingredients).toBe(
      [
        '- 2 tbsp olive oil',
        '- 1 onion, diced',
        '- 1 red pepper, sliced',
        '- 2 garlic cloves',
        '- 1 tsp cumin, 1 tsp paprika',
        '- 400 g tin chopped tomatoes',
        '- 4 eggs',
        '- handful of coriander',
      ].join('\n')
    );
    expect(r.instructions).toBe(
      'Soften onion and pepper 5 min. Add garlic and spices 1 min. Tip in tomatoes, simmer 10 min. Make 4 wells, crack in eggs, cover 6-8 min. Top with coriander.'
    );
    expect(r.notes).toBe('');
  });

  it('EN inline headers: "Ingredients: 2 eggs" / "Method: Whisk the eggs." keep the text after the colon', () => {
    const r = parsePastedRecipe(
      ['Omelette', 'Ingredients: 2 eggs', '1 tbsp butter', 'Method: Whisk the eggs.', 'Fry 2 min.'].join('\n')
    );
    expect(r.title).toBe('Omelette');
    expect(r.ingredients).toBe('2 eggs\n1 tbsp butter');
    expect(r.instructions).toBe('Whisk the eggs.\nFry 2 min.');
  });

  it('PL inline headers: "Składniki: …" / "Przygotowanie: …"', () => {
    const r = parsePastedRecipe(
      ['Zupa', 'Składniki: 1 l wody', '2 marchewki', 'Przygotowanie: Pokrój warzywa.', 'Gotuj 20 minut.'].join('\n')
    );
    expect(r.title).toBe('Zupa');
    expect(r.ingredients).toBe('1 l wody\n2 marchewki');
    expect(r.instructions).toBe('Pokrój warzywa.\nGotuj 20 minut.');
    expect(r.cookTime).toBeNull();
    expect(r.prepTime).toBeNull();
  });

  it('inline header is case-insensitive and tolerates spaces around the colon ("METHOD :  Bake.")', () => {
    const r = parsePastedRecipe(['Cake', 'Ingredients', 'flour', 'METHOD :  Bake.'].join('\n'));
    expect(r.ingredients).toBe('flour');
    expect(r.instructions).toBe('Bake.');
  });

  it('multi-word PL inline headers, with and without diacritics ("Sposób/Sposob przygotowania: …")', () => {
    for (const h of ['Sposób przygotowania: Wymieszaj.', 'Sposob przygotowania: Wymieszaj.']) {
      const r = parsePastedRecipe(['Ciasto', 'Składniki', 'mąka', h].join('\n'));
      expect(r.ingredients).toBe('mąka');
      expect(r.instructions).toBe('Wymieszaj.');
    }
  });

  it('inline notes headers ("Uwagi: …", "Tip: …") send their line to notes', () => {
    for (const [h, note] of [
      ['Uwagi: Najlepsze na drugi dzień.', 'Najlepsze na drugi dzień.'],
      ['Tip: Rest the batter.', 'Rest the batter.'],
    ]) {
      const r = parsePastedRecipe(['Cake', 'Ingredients', 'flour', 'Method', 'Bake.', h].join('\n'));
      expect(r.instructions).toBe('Bake.');
      expect(r.notes).toBe(note);
    }
  });

  it('inline "Składniki na X: …" opens an ingredient group heading', () => {
    const r = parsePastedRecipe(
      ['Tort', 'Składniki na ciasto: 200 g mąki', '2 jajka', 'Przygotowanie', 'Piec.'].join('\n')
    );
    expect(r.ingredients).toBe('# Ciasto\n200 g mąki\n2 jajka');
    expect(r.instructions).toBe('Piec.');
  });

  it('inline ingredients header carrying the yield ("Składniki (4 porcje): 2 jajka") sets servings', () => {
    const r = parsePastedRecipe(['X', 'Składniki (4 porcje): 2 jajka', 'Przygotowanie', 'Piec.'].join('\n'));
    expect(r.servings).toBe(4);
    expect(r.ingredients).toBe('2 jajka');
    expect(r.instructions).toBe('Piec.');
  });

  it('an inline header as the first line is not taken as the title', () => {
    const r = parsePastedRecipe(['Ingredients: 2 eggs', 'salt', 'Method: Fry.'].join('\n'));
    expect(r.title).toBeUndefined();
    expect(r.ingredients).toBe('2 eggs\nsalt');
    expect(r.instructions).toBe('Fry.');
  });

  it('inline "Instructions: 1. Mix." keeps the numbered step', () => {
    const r = parsePastedRecipe(['X', 'Ingredients', 'eggs', 'Instructions: 1. Mix.', '2. Bake.'].join('\n'));
    expect(r.ingredients).toBe('eggs');
    expect(r.instructions).toBe('1. Mix.\n2. Bake.');
  });

  it('a long one-line inline ingredient list stays in ingredients (bypasses the >80-char prose rule)', () => {
    const rest = 'flour, sugar, butter, eggs, milk, vanilla, baking powder, salt, lemon zest, cream';
    expect(rest.length).toBeGreaterThan(80);
    const r = parsePastedRecipe(`Ingredients: ${rest}`);
    expect(r.ingredients).toBe(rest);
    expect(r.instructions).toBe('');
  });

  it('a tagline before an inline "Ingredients:" header is dropped as preamble', () => {
    const r = parsePastedRecipe(['Title', 'A lovely tagline.', 'Ingredients: 2 eggs', 'Method: Fry.'].join('\n'));
    expect(r.title).toBe('Title');
    expect(r.ingredients).toBe('2 eggs');
    expect(r.instructions).toBe('Fry.');
    expect(r.ingredients).not.toContain('tagline');
    expect(r.instructions).not.toContain('tagline');
  });

  it('lines before an inline "Method:" header (no ingredients header) become the ingredients', () => {
    const r = parsePastedRecipe(['Title', '2 eggs', 'salt', 'Method: Fry.'].join('\n'));
    expect(r.ingredients).toBe('2 eggs\nsalt');
    expect(r.instructions).toBe('Fry.');
  });

  // Inline-header guards: only the parser's own header words, exact match before the colon.

  it('guard: "Sól: do smaku" stays an ingredient line', () => {
    const r = parsePastedRecipe(['Zupa', 'Składniki', 'woda', 'Sól: do smaku', 'Przygotowanie', 'Gotuj.'].join('\n'));
    expect(r.ingredients).toBe('woda\nSól: do smaku');
    expect(r.instructions).toBe('Gotuj.');
  });

  it('guard: "Uwaga: gorące!" (singular, not "Uwagi") stays in instructions', () => {
    const r = parsePastedRecipe(['Zupa', 'Składniki', 'woda', 'Przygotowanie', 'Gotuj.', 'Uwaga: gorące!'].join('\n'));
    expect(r.instructions).toBe('Gotuj.\nUwaga: gorące!');
    expect(r.notes).toBe('');
  });

  it('guard: "Follow the method: …" does not switch to instructions', () => {
    const r = parsePastedRecipe(['Cake', 'Ingredients', 'flour', 'Follow the method: bake 20 min.'].join('\n'));
    expect(r.ingredients).toBe('flour\nFollow the method: bake 20 min.');
    expect(r.instructions).toBe('');
  });

  it('guard: "Ingredients list: see below" does not switch to ingredients', () => {
    const r = parsePastedRecipe(['Cake', 'Method', 'Mix.', 'Ingredients list: see below'].join('\n'));
    expect(r.instructions).toBe('Mix.\nIngredients list: see below');
    expect(r.ingredients).toBe('');
  });

  it('guard: "Preparation: 15 min" stays a prep-time label, not an inline header', () => {
    const r = parsePastedRecipe(['Cake', 'Preparation: 15 min', 'Ingredients', 'flour'].join('\n'));
    expect(r.prepTime).toBe(15);
    expect(r.instructions).toBe('');
    expect(r.ingredients).toBe('flour');
  });

  it('"Preparation: 1. Mix the flour." is an inline header, not prepTime = 1', () => {
    const r = parsePastedRecipe(
      ['Cake', 'Ingredients', 'flour', 'Preparation: 1. Mix the flour.', '2. Bake.'].join('\n')
    );
    expect(r.prepTime).toBeNull();
    expect(r.ingredients).toBe('flour');
    expect(r.instructions).toBe('1. Mix the flour.\n2. Bake.');
  });

  it('an inline "Note: …" mid-ingredients goes to notes; the following ingredients stay in ingredients', () => {
    const r = parsePastedRecipe(
      [
        'Pancakes', 'Ingredients', '200 g flour', 'Note: use room-temperature milk.',
        '2 eggs', '300 ml milk', 'Method', 'Mix.',
      ].join('\n')
    );
    expect(r.ingredients).toBe('200 g flour\n2 eggs\n300 ml milk');
    expect(r.instructions).toBe('Mix.');
    expect(r.notes).toBe('use room-temperature milk.');
  });

  it('an inline "Tip: …" mid-method goes to notes; the following steps stay in instructions', () => {
    const r = parsePastedRecipe(
      ['Pancakes', 'Ingredients', 'flour', 'Method', 'Mix.', 'Tip: do not overmix.', 'Fry 2 min.', 'Serve.'].join('\n')
    );
    expect(r.instructions).toBe('Mix.\nFry 2 min.\nServe.');
    expect(r.notes).toBe('do not overmix.');
  });

  it('PL inline "Wskazówka: …" mid-method goes to notes; the following steps stay in instructions', () => {
    const r = parsePastedRecipe(
      ['Naleśniki', 'Składniki', 'mąka', 'Przygotowanie', 'Wymieszaj.', 'Wskazówka: nie przesadzaj z mieszaniem.', 'Smaż 2 minuty.'].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Wymieszaj.\nSmaż 2 minuty.');
    expect(r.notes).toBe('nie przesadzaj z mieszaniem.');
  });

  it('a bare notes header line still switches to notes', () => {
    const r = parsePastedRecipe(['Cake', 'Method', 'Bake.', 'Tips', 'Rest the batter.', 'Serve warm.'].join('\n'));
    expect(r.instructions).toBe('Bake.');
    expect(r.notes).toBe('Rest the batter.\nServe warm.');
  });

  it('"Prep: 5." (number + full stop, no step text) -> prepTime 5', () => {
    const r = parsePastedRecipe(['Bread', 'Prep: 5.', 'Ingredients', 'flour'].join('\n'));
    expect(r.prepTime).toBe(5);
    expect(r.ingredients).toBe('flour');
    expect(r.instructions).toBe('');
  });

  it('"Cook time: 20." (number + full stop, no step text) -> cookTime 20', () => {
    const r = parsePastedRecipe(['Bread', 'Cook time: 20.', 'Ingredients', 'flour'].join('\n'));
    expect(r.cookTime).toBe(20);
    expect(r.ingredients).toBe('flour');
    expect(r.instructions).toBe('');
  });

  it('"Prep: 1.5 h" still reads as a prep-time label', () => {
    const r = parsePastedRecipe(['Bread', 'Prep: 1.5 h', 'Ingredients', 'flour'].join('\n'));
    expect(r.prepTime).not.toBeNull();
    expect(r.ingredients).toBe('flour');
    expect(r.instructions).toBe('');
  });

  it('PL "Przygotowanie: 15 min" (whole line is a duration) -> prepTime 15', () => {
    const r = parsePastedRecipe(['Zupa', 'Przygotowanie: 15 min', 'Składniki', 'woda'].join('\n'));
    expect(r.prepTime).toBe(15);
    expect(r.instructions).toBe('');
    expect(r.ingredients).toBe('woda');
  });

  it('PL "Przygotowanie: Gotuj 15 min." is an inline header, not a prep time', () => {
    const r = parsePastedRecipe(['Zupa', 'Składniki', 'woda', 'Przygotowanie: Gotuj 15 min.'].join('\n'));
    expect(r.prepTime).toBeNull();
    expect(r.ingredients).toBe('woda');
    expect(r.instructions).toBe('Gotuj 15 min.');
  });

  // ----- Package D: servings in the title (SPEC §5.15) -----

  it('servings in the title bracket -> servings set, bracket removed from the title', () => {
    const r = parsePastedRecipe(['Shakshuka (serves 2)', 'Ingredients', 'eggs'].join('\n'));
    expect(r.title).toBe('Shakshuka');
    expect(r.servings).toBe(2);
  });

  it('a title that is only the yield bracket -> title undefined, servings kept', () => {
    const r = parsePastedRecipe(['(serves 2)', 'Ingredients', 'eggs'].join('\n'));
    expect(r.title).toBeUndefined();
    expect(r.servings).toBe(2);
    expect(r.ingredients).toBe('eggs');
  });

  it('a labeled servings line wins over the title bracket (bracket still removed)', () => {
    const en = parsePastedRecipe(['Pancakes (serves 2)', 'Serves 4', 'Ingredients', 'flour'].join('\n'));
    expect(en.servings).toBe(4);
    expect(en.title).toBe('Pancakes');

    const pl = parsePastedRecipe(['Pierogi (dla 2 osób)', 'Składniki (6 porcji)', 'mąka'].join('\n'));
    expect(pl.servings).toBe(6);
    expect(pl.title).toBe('Pierogi');
  });

  it('a duplicated page heading carrying the bracket is still dropped', () => {
    const r = parsePastedRecipe(['Shakshuka (serves 2)', 'Shakshuka (serves 2)', 'Ingredients', 'eggs'].join('\n'));
    expect(r.title).toBe('Shakshuka');
    expect(r.servings).toBe(2);
    expect(r.ingredients).toBe('eggs');
  });

  it('late title after "Przepis … na:" also gets its yield bracket extracted', () => {
    const r = parsePastedRecipe(
      ['Składniki', 'mąka', 'Przepis i sposób przygotowania na:', 'Pierogi (dla 4 osób)', 'Zagnieć.'].join('\n')
    );
    expect(r.title).toBe('Pierogi');
    expect(r.servings).toBe(4);
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Zagnieć.');
  });

  it('a yield bracket inside a body line is ignored', () => {
    const r = parsePastedRecipe(['Salad', 'Ingredients', 'dressing (makes 4)'].join('\n'));
    expect(r.servings).toBeNull();
    expect(r.ingredients).toBe('dressing (makes 4)');
  });

  it('AI path: cleaned AI response with bold title + inline headers', () => {
    const r = parsePastedRecipe(cleanAiResponse('**Shakshuka (serves 2)**\nIngredients: 2 eggs\nMethod: Fry.'));
    expect(r.title).toBe('Shakshuka');
    expect(r.servings).toBe(2);
    expect(r.ingredients).toBe('2 eggs');
    expect(r.instructions).toBe('Fry.');
  });

  it('JSON-LD is untouched: the name keeps its bracket, recipeYield wins', () => {
    const html = ldScript({ '@type': 'Recipe', name: 'Shakshuka (serves 2)', recipeYield: '4' });
    const r = parseRecipeJsonLd(html)!;
    expect(r.title).toBe('Shakshuka (serves 2)');
    expect(r.servings).toBe(4);
  });
});

describe('extractTitleServings', () => {
  it.each([
    // EN
    ['Shakshuka (serves 2)', 'Shakshuka', 2],
    ['Shakshuka (Serves 4)', 'Shakshuka', 4],
    ['Cookies (makes 12)', 'Cookies', 12],
    ['Cookies (makes 12 cookies)', 'Cookies', 12],
    ['Stew (for 4)', 'Stew', 4],
    ['Stew (4 servings)', 'Stew', 4],
    ['Stew (serves 4 people)', 'Stew', 4],
    ['Bread (yield: 6)', 'Bread', 6],
    // PL
    ['Pierogi (dla 4 osób)', 'Pierogi', 4],
    ['Pierogi (dla 2 osob)', 'Pierogi', 2],
    ['Pierogi (dla 4)', 'Pierogi', 4],
    ['Zupa (4 porcje)', 'Zupa', 4],
    ['Zupa (1 porcja)', 'Zupa', 1],
    ['Zupa (na 6 porcji)', 'Zupa', 6],
    ['Zupa (porcje: 4)', 'Zupa', 4],
    ['Zupa (4 osoby)', 'Zupa', 4],
    ['Pączki (12 sztuk)', 'Pączki', 12],
  ])('%s -> title %p, servings %p', (input, title, servings) => {
    expect(extractTitleServings(input)).toEqual({ title, servings });
  });

  it.each([
    ['Stew (serves 4-6)'],
    ['Stew (4–6 porcji)'],
    ['Stew (dla 4-6 osób)'],
    ['Stew (serves 4 to 6)'],
  ])('range %s -> first number (4)', (input) => {
    expect(extractTitleServings(input)).toEqual({ title: 'Stew', servings: 4 });
  });

  it('removes a mid-title bracket and collapses spaces', () => {
    expect(extractTitleServings('Pierogi (dla 4 osób) ruskie')).toEqual({ title: 'Pierogi ruskie', servings: 4 });
  });

  it('strips a trailing dash left behind by the removed bracket', () => {
    expect(extractTitleServings('Shakshuka – (serves 2)')).toEqual({ title: 'Shakshuka', servings: 2 });
  });

  it('leaves no space before punctuation that followed the removed bracket', () => {
    expect(extractTitleServings('Shakshuka (serves 2)!')).toEqual({ title: 'Shakshuka!', servings: 2 });
  });

  it('keeps other brackets, removes only the yield one', () => {
    expect(extractTitleServings('Pierogi (ruskie) (dla 4 osób)')).toEqual({ title: 'Pierogi (ruskie)', servings: 4 });
  });

  it('title that is only the bracket -> empty title, servings kept', () => {
    expect(extractTitleServings('(serves 2)')).toEqual({ title: '', servings: 2 });
  });

  it.each([
    ['Pierogi (ruskie)'],
    ['Pancakes (2 eggs)'],
    ['Bread (ok. 20 min)'],
    ['Cookies (serves many)'],
    ['Soup (serves 0)'],
    ['Soup (4)'],
    ['Stew (for 2 hours)'],
    ['Zakwas (na 2 dni)'],
    ['Pancakes (makes a great gift)'],
    ['Plain title'],
  ])('no yield bracket: %s -> unchanged, servings null', (input) => {
    expect(extractTitleServings(input)).toEqual({ title: input, servings: null });
  });
});
