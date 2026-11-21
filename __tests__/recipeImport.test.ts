// Tests for single-recipe import (SPEC.md §5.15).
import {
  parseIsoDuration,
  parseRecipeJsonLd,
  parsePastedRecipe,
  // Package D (SPEC.md §5.15): inline headers + servings in the title.
  extractTitleServings,
  // Iteration 7 of persona-lab (SPEC.md §5.15): real-world paste and link fixes.
  parseRecipeHtml,
  parseRecipeMicrodata,
  isRecipeNoise,
} from '@/utils/recipeImport';
import { cleanAiResponse } from '@/utils/aiTranscribe';
import { readFileSync } from 'fs';
import { join } from 'path';

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
    // …and, being one comma-separated line, is split into one item per line.
    expect(r.ingredients).toBe(rest.split(', ').join('\n'));
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

// The exact texts the personas had on the clipboard in the import study.
function clipboard(file: string): string {
  return readFileSync(
    join(__dirname, '..', 'persona-lab', 'config-import', 'clipboard', file),
    'utf8'
  );
}

describe('parsePastedRecipe on the persona-lab import materials', () => {
  describe('blog-cala-strona.txt (a whole copied page)', () => {
    const r = parsePastedRecipe(clipboard('blog-cala-strona.txt'));

    it('finds the dish name behind the breadcrumb', () => {
      expect(r.title).toBe('Zupa krem z dyni z mleczkiem kokosowym');
    });

    it('keeps the labeled times and servings', () => {
      expect(r.prepTime).toBe(15);
      expect(r.cookTime).toBe(30);
      expect(r.servings).toBe(4);
    });

    it('reads the 10 ingredients, without the ad line', () => {
      const lines = r.ingredients.split('\n');
      expect(lines).toHaveLength(10);
      expect(lines[0]).toBe('1 dynia hokkaido (ok. 1 kg)');
      expect(lines[9]).toBe('pestki dyni do posypania');
    });

    it('ends the steps where the recipe ends', () => {
      const lines = r.instructions.split('\n');
      expect(lines).toHaveLength(6);
      expect(lines[5]).toBe('Podawaj z prażonymi pestkami dyni.');
    });

    it('sends the tip to notes and nothing after it', () => {
      expect(r.notes).toBe('zupa świetnie się mrozi, wytrzymuje w zamrażarce do 3 miesięcy.');
    });
  });

  describe('insta-caption.txt', () => {
    const r = parsePastedRecipe(clipboard('insta-caption.txt'));

    it('skips the account line and cuts the title at the first emoji', () => {
      expect(r.title).toBe('the 20 min miso butter noodles everyone keeps asking for');
    });

    it('treats "you need:" as the ingredients header', () => {
      const lines = r.ingredients.split('\n');
      expect(lines).toHaveLength(8);
      expect(lines[0]).toBe('200g egg noodles');
      expect(lines[7]).toBe('chilli crisp to finish 🌶️');
    });

    it('treats "how:" as the method header and drops the caption tail', () => {
      expect(r.instructions.split('\n')).toHaveLength(1);
      expect(r.instructions).toMatch(/^boil noodles, keep a mug of the water\./);
      expect(r.instructions).not.toMatch(/SAVE this|#noodles|View all/);
    });
  });

  describe('wiadomosc-od-mamy.txt (a chat message, no headers)', () => {
    const r = parsePastedRecipe(clipboard('wiadomosc-od-mamy.txt'));

    it('leaves the title empty rather than using the greeting', () => {
      expect(r.title).toBeUndefined();
    });

    it('loses no text: with no structure it all stays in instructions', () => {
      expect(r.instructions).toMatch(/^Basiu to ten piernik/);
      expect(r.instructions).toMatch(/buziaki$/);
    });
  });
});

describe('parsePastedRecipe title detection', () => {
  const titleOf = (...lines: string[]) => parsePastedRecipe(lines.join('\n')).title;

  it('a line repeated before the ingredients is the title', () => {
    expect(titleOf('Mój blog', 'Bigos', 'Bigos', 'Składniki', 'kapusta')).toBe('Bigos');
  });

  it('a repeat after the ingredients header does not count', () => {
    expect(titleOf('Bigos', 'Składniki', 'kapusta', 'kapusta')).toBe('Bigos');
  });

  it('skips breadcrumb and category lines', () => {
    expect(titleOf('Home', 'Recipes', 'Banana bread', 'Ingredients', 'bananas')).toBe('Banana bread');
    expect(titleOf('Strona główna', 'Desery', 'Sernik', 'Składniki', 'twaróg')).toBe('Sernik');
  });

  it('skips a capitals running head above an ordinary line', () => {
    expect(titleOf('DANIA MIĘSNE', 'Gołąbki w sosie pomidorowym', 'Składniki', 'kapusta')).toBe(
      'Gołąbki w sosie pomidorowym'
    );
  });

  it('keeps a capitals title above a header, a tagline or a sentence', () => {
    expect(titleOf('PIEROGI RUSKIE', 'Składniki', 'mąka')).toBe('PIEROGI RUSKIE');
    expect(titleOf('PIEROGI RUSKIE', 'z cebulką i twarogiem', 'Składniki', 'mąka')).toBe('PIEROGI RUSKIE');
    expect(titleOf('PIEROGI RUSKIE', 'Najlepsze na świecie.', 'Składniki', 'mąka')).toBe('PIEROGI RUSKIE');
  });

  it('a whole sentence is not a title', () => {
    expect(titleOf('Dziś robimy coś pysznego na obiad!', 'Składniki', 'mąka')).toBeUndefined();
    expect(titleOf('Hej, wysyłam ci ten przepis co obiecałam wczoraj wieczorem', 'Składniki', 'mąka')).toBeUndefined();
  });

  it('a title with a comma or a closing emoji stays a title', () => {
    expect(titleOf('Kurczak z ryżem, szybki', 'Składniki', 'kurczak')).toBe('Kurczak z ryżem, szybki');
    expect(titleOf('Zupa dyniowa 🎃', 'Składniki', 'dynia')).toBe('Zupa dyniowa');
    expect(titleOf('🎃 Zupa dyniowa', 'Składniki', 'dynia')).toBe('Zupa dyniowa');
  });
});

describe('parsePastedRecipe more section headers', () => {
  it.each(["You'll need", 'You need', 'What you need', 'Potrzebujesz', 'Będziesz potrzebować', 'Bedziesz potrzebowac'])(
    '%s starts the ingredients',
    (header) => {
      const r = parsePastedRecipe(['Bułki', `${header}:`, '2 jajka', 'Method', 'Mix.'].join('\n'));
      expect(r.ingredients).toBe('2 jajka');
    }
  );

  it.each(['How', 'How to make it', 'Jak zrobić', 'Jak to zrobić'])('%s starts the method', (header) => {
    const r = parsePastedRecipe(['Bułki', 'Ingredients', '2 jajka', `${header}:`, 'Mix.'].join('\n'));
    expect(r.ingredients).toBe('2 jajka');
    expect(r.instructions).toBe('Mix.');
  });

  it('works as an inline header', () => {
    const r = parsePastedRecipe(['Bułki', 'You need: 2 eggs', 'how: mix them'].join('\n'));
    expect(r.ingredients).toBe('2 eggs');
    expect(r.instructions).toBe('mix them');
  });

  it('a sentence starting with the same word stays an ordinary line', () => {
    const r = parsePastedRecipe(['Bułki', 'Ingredients', '2 jajka', 'How long it bakes: an hour'].join('\n'));
    expect(r.ingredients).toBe('2 jajka\nHow long it bakes: an hour');
  });
});

describe('parsePastedRecipe page and caption noise', () => {
  it('drops ad and share labels', () => {
    const r = parsePastedRecipe(
      ['Bułki', 'Składniki', 'mąka', 'Reklama', 'Advertisement', 'Przygotowanie', 'Mieszaj.', 'Udostępnij', 'Share'].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Mieszaj.');
  });

  it('drops hashtag lines and follow prompts but keeps a # group heading', () => {
    const r = parsePastedRecipe(
      ['Bułki', 'Składniki', '# Ciasto', 'mąka', 'Przygotowanie', 'Mieszaj.', '#obiad #szybko', 'Follow @kucharz for more'].join('\n')
    );
    expect(r.ingredients).toBe('# Ciasto\nmąka');
    expect(r.instructions).toBe('Mieszaj.');
  });

  it('a nutrition value is noise after the ingredients, an ingredient inside them', () => {
    const r = parsePastedRecipe(
      ['Bułki', 'Składniki', 'białko 30 g', 'Przygotowanie', 'Mieszaj.', 'Białko 4 g', 'Tłuszcze: 18 g'].join('\n')
    );
    expect(r.ingredients).toBe('białko 30 g');
    expect(r.instructions).toBe('Mieszaj.');
  });

  it.each(['Zobacz też', 'Podobne przepisy', 'Komentarze', 'Komentarze (47)', '47 komentarzy', 'You may also like', 'Comments', 'View all 212 comments'])(
    '%s ends the recipe once there are steps',
    (tail) => {
      const r = parsePastedRecipe(
        ['Bułki', 'Składniki', 'mąka', 'Przygotowanie', 'Mieszaj.', tail, 'Rosół jak u babci', 'Ania: pyszne!'].join('\n')
      );
      expect(r.instructions).toBe('Mieszaj.');
      expect(r.notes).toBe('');
    }
  );

  it('a yield range after the ingredients header sets servings', () => {
    const r = parsePastedRecipe(['Naleśniki', 'Składniki', '16 - 17 sztuk', 'mąka', 'Przygotowanie', 'Smaż.'].join('\n'));
    expect(r.servings).toBe(16);
    expect(r.ingredients).toBe('mąka');
  });

  it('a tab bar above the steps does not end the recipe', () => {
    const r = parsePastedRecipe(
      ['Bułki', 'Składniki', 'Przygotowanie', 'Komentarze', 'Składniki', 'mąka', 'Przygotowanie', 'Mieszaj.'].join('\n')
    );
    expect(r.ingredients).toBe('mąka');
    expect(r.instructions).toBe('Mieszaj.');
  });

  it('a lone page number after the last step is dropped', () => {
    const r = parsePastedRecipe(['Bułki', 'Składniki', 'mąka', 'Przygotowanie', 'Mieszaj.', '127'].join('\n'));
    expect(r.instructions).toBe('Mieszaj.');
  });
});

describe('recipeInstructions shapes', () => {
  const steps = (recipeInstructions: unknown) =>
    parseRecipeJsonLd(ldScript({ '@type': 'Recipe', name: 'X', recipeInstructions }))!.instructions;
  const section = {
    '@type': 'HowToSection',
    name: 'Jak przygotować?',
    itemListElement: [
      { '@type': 'HowToStep', text: 'Zagotuj mleko.' },
      { '@type': 'HowToStep', text: 'Wsyp makaron.' },
    ],
  };

  it('reads sections nested in an extra array (doradcasmaku.pl)', () => {
    expect(steps([[section]])).toBe('Zagotuj mleko.\nWsyp makaron.');
  });

  it('reads a single section or step that is not in an array', () => {
    expect(steps(section)).toBe('Zagotuj mleko.\nWsyp makaron.');
    expect(steps({ '@type': 'HowToStep', text: 'Zagotuj mleko.' })).toBe('Zagotuj mleko.');
  });

  it('reads plain strings inside a section', () => {
    expect(steps([{ '@type': 'HowToSection', itemListElement: ['Zagotuj mleko.'] }])).toBe('Zagotuj mleko.');
  });
});

describe('parseRecipeMicrodata', () => {
  // The shape of aniagotuje.pl: everything marked up, unrelated items nested inside.
  const full = `
    <article itemscope="itemscope" itemtype="https://schema.org/Recipe">
      <div itemprop="author" itemscope itemtype="https://schema.org/Person"><meta itemprop="name" content="Ania"></div>
      <h1 itemprop="name">Szarlotka &amp; lody</h1>
      <meta itemprop="prepTime" content="PT0H30M">
      <meta itemprop="cookTime" content="PT2H10M">
      <meta itemprop="recipeYield" content="12 porcji">
      <li><span itemprop="recipeIngredient"><span>jabłka</span><span> 1,5 kg</span></span></li>
      <li><span itemprop="recipeIngredient">mąka&nbsp;320 g</span></li>
      <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
        <span itemprop="name">Ciasto</span>
        <div itemprop="text"><p>Zagnieć ciasto.</p><p>Schłodź.</p></div>
      </div>
      <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
        <div itemprop="text">Piecz.</div>
      </div>
      <div itemscope itemtype="https://schema.org/FAQPage">
        <div itemprop="mainEntity" itemscope itemtype="https://schema.org/Question">
          <div itemprop="text">Czy można zamrozić?</div>
        </div>
      </div>
    </article>`;

  it('maps a fully marked-up Recipe', () => {
    const r = parseRecipeMicrodata(full)!;
    expect(r.title).toBe('Szarlotka & lody');
    expect(r.prepTime).toBe(30);
    expect(r.cookTime).toBe(130);
    expect(r.servings).toBe(12);
    expect(r.ingredients).toBe('jabłka 1,5 kg\nmąka 320 g');
    expect(r.instructions).toBe('Zagnieć ciasto.\nSchłodź.\nPiecz.');
  });

  it('reads the older "ingredients" property and a plain instructions list', () => {
    const r = parseRecipeMicrodata(`
      <div itemscope itemtype="http://schema.org/Recipe">
        <h1 itemprop=name>Placki</h1>
        <li itemprop="ingredients">2 jajka</li>
        <time itemprop="prepTime" datetime="PT15M">15 minut</time>
        <ol itemprop="recipeInstructions"><li>Wymieszaj.</li><li>Usmaż.</li></ol>
      </div>`)!;
    expect(r.title).toBe('Placki');
    expect(r.prepTime).toBe(15);
    expect(r.ingredients).toBe('2 jajka');
    expect(r.instructions).toBe('Wymieszaj.\nUsmaż.');
  });

  it('survives unclosed list items and tag-like text in scripts and comments', () => {
    const r = parseRecipeMicrodata(`
      <div itemscope itemtype="https://schema.org/Recipe">
        <span itemprop="name">Placki</span>
        <!-- </div> -->
        <script>document.write("</div>")</script>
        <ul><li><span itemprop="recipeIngredient">2 jajka</span><li><span itemprop="recipeIngredient">mąka</span></ul>
        <div itemprop="recipeInstructions">Usmaż.</div>
      </div>`)!;
    expect(r.ingredients).toBe('2 jajka\nmąka');
    expect(r.instructions).toBe('Usmaż.');
  });

  // The shape of kwestiasmaku.com and mojewypieki.com: only the name and the
  // description are marked up, the rest is ordinary text inside the element.
  const nameOnly = `
    <nav>Strona główna Przepisy</nav>
    <div itemscope itemtype="https://schema.org/Recipe">
      <span itemprop="description">Pyszny sernik na kruchym spodzie.</span>
      <div itemprop=name><h1>Sernik z rosą</h1></div>
      <h3><span>Składniki</span></h3>
      <div>24 porcje</div>
      <ul><li> 250 g mąki</li><li> 1 jajko</li></ul>
      <h3>Przygotowanie</h3>
      <ul><li> Zagnieść ciasto.</li><li> Piec 10 minut.</li></ul>
    </div>
    <footer>Polecane przepisy</footer>`;

  it('reads the text of the Recipe element when only the name is marked up', () => {
    const r = parseRecipeMicrodata(nameOnly)!;
    expect(r.title).toBe('Sernik z rosą');
    expect(r.servings).toBe(24);
    expect(r.ingredients).toBe('250 g mąki\n1 jajko');
    expect(r.instructions).toBe('Zagnieść ciasto.\nPiec 10 minut.');
  });

  it('a repeat of the name below the steps is not a step, a tip goes to notes', () => {
    const r = parseRecipeMicrodata(`
      <div itemscope itemtype="https://schema.org/Recipe">
        <div itemprop=name><h1>Sernik</h1></div>
        <h3>Składniki</h3><ul><li>twaróg</li></ul>
        <h3>Przygotowanie</h3><ul><li>Upiecz.</li></ul>
        <h3>Wskazówki</h3><p>Najlepszy na drugi dzień.</p>
        <div>Sernik</div>
      </div>`)!;
    expect(r.instructions).toBe('Upiecz.');
    expect(r.notes).toBe('Najlepszy na drugi dzień.');
  });

  it('stops at the site index printed inside the Recipe element', () => {
    const r = parseRecipeMicrodata(`
      <article itemscope itemtype="http://schema.org/Recipe">
        <meta itemprop="name" content="Sernik">
        <h3>Składniki</h3><ul><li>twaróg</li></ul>
        <h3>Przygotowanie</h3><p>Upiecz.</p>
        <h3>Przeglądaj wpisy po składnikach:</h3><ul><li>rodzynki</li><li>mak</li></ul>
      </article>`)!;
    expect(r.instructions).toBe('Upiecz.');
  });

  it('gives up when the element text has no ingredients or no steps', () => {
    expect(
      parseRecipeMicrodata(`<div itemscope itemtype="https://schema.org/Recipe">
        <span itemprop="name">Sernik</span><p>Opis bez przepisu.</p></div>`)
    ).toBeNull();
  });

  it('no Recipe item -> null', () => {
    expect(parseRecipeMicrodata('')).toBeNull();
    expect(parseRecipeMicrodata('<p>Tylko tekst</p>')).toBeNull();
    expect(
      parseRecipeMicrodata(`<div itemscope itemtype="https://schema.org/Article"><span itemprop="name">Nie</span></div>`)
    ).toBeNull();
  });
});

describe('parseRecipeHtml', () => {
  it('prefers JSON-LD', () => {
    const html = `${ldScript({ '@type': 'Recipe', name: 'Z JSON-LD' })}
      <div itemscope itemtype="https://schema.org/Recipe"><span itemprop="name">Z microdata</span>
      <span itemprop="recipeIngredient">mąka</span></div>`;
    expect(parseRecipeHtml(html)!.title).toBe('Z JSON-LD');
  });

  it('falls back to microdata', () => {
    const html = `${ldScript({ '@type': 'WebSite', name: 'Blog' })}
      <div itemscope itemtype="https://schema.org/Recipe"><span itemprop="name">Z microdata</span>
      <span itemprop="recipeIngredient">mąka</span></div>`;
    expect(parseRecipeHtml(html)!.title).toBe('Z microdata');
  });

  it('nothing structured -> null', () => {
    expect(parseRecipeHtml('<html><body><h1>Przepis</h1></body></html>')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rules found on real phone screenshots and copied posts (SPEC.md §5.15):
// app chrome, captions, chats and notes without headers.
// ---------------------------------------------------------------------------
describe('parsePastedRecipe — posts, captions, chats and notes', () => {
  const parse = (...lines: string[]) => parsePastedRecipe(lines.join('\n'));

  it('keeps an ingredient that opens with a fraction; a rating is still noise', () => {
    const r = parse('Pancakes', '4.8 / 5 (126 ocen)', '4,5/5', 'Ingredients', '1/2 cup sugar', '1 / 2 szklanki mleka', '1 egg');
    expect(r.ingredients).toBe('1/2 cup sugar\n1 / 2 szklanki mleka\n1 egg');
  });

  it('drops what a social app draws around a post', () => {
    const r = parse(
      'Zupa ogórkowa',
      'Składniki:',
      '1 l bulionu',
      'Wykonanie:',
      'Ugotuj wszystko razem.',
      'Liczba polubień: 1 234',
      '3 482 polubienia',
      'Zobacz wszystkie komentarze: 56',
      'Wyświetl wszystkie komentarze (128)',
      '2 dni temu Zobacz tłumaczenie',
      '5 godzin temu',
      '2 tyg. Lubię to! Odpowiedz 14',
      '37 komentarzy 12 udostępnień',
      'Lubię to! Komentarz',
      'Skomentuj',
      'Napisz komentarz...',
      '184 tys. wyświetleń 3 mies. temu #zupa',
      'Subskrybuj kanał, żeby nie przegapić nowych przepisów!',
      '#zupa #obiad mniej',
      'oryginalny dźwięk - smaczna.chwila',
      'Edytowano 12 wrz'
    );
    expect(r.instructions).toBe('Ugotuj wszystko razem.');
  });

  it('keeps recipe lines that only resemble chrome', () => {
    const r = parse('Tosty', 'Składniki', '2 kromki chleba', 'Notes', 'Like a French toast, but savoury.');
    expect(r.notes).toBe('Like a French toast, but savoury.');
  });

  it('takes a caption\'s title from the line that opens with the account name', () => {
    const r = parse(
      'kasia.gotuje',
      'Warszawa',
      'Liczba polubień: 1 234',
      'kasia.gotuje Najprostsze placki bananowe e bez cukru!',
      'Składniki:',
      '2 banany',
      'Przygotowanie:',
      'Usmaż.'
    );
    expect(r.title).toBe('Najprostsze placki bananowe bez cukru!');
    expect(r.ingredients).toBe('2 banany');
  });

  it('matches an account name OCR broke at its underscore', () => {
    const r = parse('domowa spizarnia', 'domowa _spizarnia Ciasto marchewkowe z kremem', 'Składniki:', '300 g marchewki');
    expect(r.title).toBe('Ciasto marchewkowe z kremem');
  });

  it('strips an account name from a caption cropped to its text', () => {
    expect(parse('kasia.gotuje Placki bananowe', 'Składniki:', '2 banany').title).toBe('Placki bananowe');
  });

  it('does not take a repeated one-word title for an account name', () => {
    const r = parse('sernik', 'sernik pieczemy 50 minut w 170 stopniach', 'Składniki', '1 kg twarogu');
    expect(r.title).toBe('sernik');
  });

  it('reads a caption\'s lead-in with the yield as the ingredients header', () => {
    const r = parse('MAKARON', 'Na 2 porcje potrzebujesz:', '200 g makaronu', '2 ząbki czosnku', 'Przygotowanie:', 'Ugotuj.');
    expect(r.servings).toBe(2);
    expect(r.ingredients).toBe('200 g makaronu\n2 ząbki czosnku');
  });

  it('reads every label of a "|" row', () => {
    const r = parse('Szarlotka', 'Czas przygotowania: 30 min | Czas pieczenia: 50 min | Porcje: 12', 'Składniki', '300 g mąki');
    expect([r.prepTime, r.cookTime, r.servings]).toEqual([30, 50, 12]);
  });

  it('reads the yield that closes a subtitle and skips a letter-spaced running head', () => {
    const r = parse('ZUP Y I DA NIA JEDNOGARNKOWE', 'Krupnik na żeberkach', 'Sycąca zupa na chłodne dni. Dla 6 osób.', 'SKŁADNIKI', '500 g żeberek');
    expect(r.title).toBe('Krupnik na żeberkach');
    expect(r.servings).toBe(6);
  });

  it('skips the page name over a post\'s date and the group over its author', () => {
    expect(
      parse('Kuchnia pani Krysi', 'Wczoraj o 18:22', 'BIGOS STAROPOLSKI', 'SKŁADNIKI:', '1 kg kapusty', 'SPOSÓB PRZYGOTOWANIA:', 'Duś.').title
    ).toBe('BIGOS STAROPOLSKI');
    expect(
      parse('facebook', 'Domowe przepisy naszych babć', 'Halina Kowalczyk 3 godz.', 'Zupa ogórkowa', 'Składniki:', '1 l bulionu').title
    ).toBe('Zupa ogórkowa');
  });

  describe('a text without any header', () => {
    it('finds the ingredient list by its amounts: a chat', () => {
      const r = parse(
        'Mama',
        'Aktywny(a) 5 min temu',
        'Mamo, podasz przepis na te kopytka?',
        'Kopytka',
        '1 kg ziemniaków',
        '300 g mąki pszennej',
        '1 jajko',
        'łyżeczka soli',
        'Ziemniaki ugotuj dzień wcześniej i przeciśnij przez praskę. Dodaj mąkę, jajko i sól.',
        'Nie dawaj za dużo mąki',
        'Aa'
      );
      expect(r.title).toBe('Kopytka');
      expect(r.ingredients).toBe('1 kg ziemniaków\n300 g mąki pszennej\n1 jajko\nłyżeczka soli');
      expect(r.instructions).toBe(
        'Ziemniaki ugotuj dzień wcześniej i przeciśnij przez praskę. Dodaj mąkę, jajko i sól.\nNie dawaj za dużo mąki'
      );
      expect(r.notes).toBe('Mamo, podasz przepis na te kopytka?');
    });

    it('finds it in a note, keeping the lines above it as notes', () => {
      const r = parse(
        'Chleb bananowy',
        'Piekarnik 175 stopni, 50-60 minut',
        '3 banany',
        '2 jajka',
        '100 g masła',
        'szczypta soli',
        'Banany rozgnieść, wymieszać z jajkami i masłem.',
        'Nie otwierać piekarnika!'
      );
      expect(r.title).toBe('Chleb bananowy');
      expect(r.notes).toBe('Piekarnik 175 stopni, 50-60 minut');
      expect(r.ingredients).toBe('3 banany\n2 jajka\n100 g masła\nszczypta soli');
      expect(r.instructions).toBe('Banany rozgnieść, wymieszać z jajkami i masłem.\nNie otwierać piekarnika!');
    });

    it('needs three amount lines: otherwise the body stays the instructions', () => {
      const r = parse('Sos', 'Wymieszaj jogurt z czosnkiem.', '2 łyżki majonezu', 'Dopraw solą.');
      expect(r.ingredients).toBe('');
      expect(r.instructions).toBe('Wymieszaj jogurt z czosnkiem.\n2 łyżki majonezu\nDopraw solą.');
    });

    it('does not take steps or video chapters for amounts', () => {
      const r = parse('Leczo', '0:45 Podsmaż kiełbasę.', '1:30 Dodaj paprykę.', '2:10 Duś 20 minut.');
      expect(r.ingredients).toBe('');
    });
  });

  it('in a chat takes the line above the ingredients for the title', () => {
    const r = parse(
      'Asia Kowalska',
      'Aktywna teraz',
      'masz ten przepis na brownie?',
      'Jasne',
      'Brownie z fasoli',
      'Składniki: puszka fasoli, 3 jajka, 3 łyżki kakao',
      'Zblenduj wszystko i piecz 30 minut.'
    );
    expect(r.title).toBe('Brownie z fasoli');
    expect(r.ingredients).toBe('puszka fasoli\n3 jajka\n3 łyżki kakao');
  });

  it('skips a group chat\'s header and the forwarded label', () => {
    const r = parse(
      'Rodzinka',
      'Babcia, Mama, Ola, Ty',
      'Babcia',
      'Przekazana',
      'Pierogi ruskie',
      'Ciasto:',
      '- 500 g mąki',
      '- 250 ml wody',
      'Farsz:',
      '- 600 g ziemniaków',
      'Wykonanie:',
      'Ugotuj ziemniaki.'
    );
    expect(r.title).toBe('Pierogi ruskie');
    expect(r.ingredients).toBe('# Ciasto\n- 500 g mąki\n- 250 ml wody\n# Farsz\n- 600 g ziemniaków');
  });

  it('turns a label over its own items into a group heading, not an inline one', () => {
    const r = parse('Ciasto', 'Składniki', '300 g mąki', 'Krem:', '250 g mascarpone', 'do namoczenia: mleko');
    expect(r.ingredients).toBe('300 g mąki\n# Krem\n250 g mascarpone\ndo namoczenia: mleko');
  });

  it('splits a one-line comma list into items, minding brackets and decimals', () => {
    expect(parse('Tortilla', 'Potrzebujesz: 2 tortille, 150 g wołowiny, 1/2 cebuli, 1,5 l wody').ingredients).toBe(
      '2 tortille\n150 g wołowiny\n1/2 cebuli\n1,5 l wody'
    );
    expect(parse('Leczo', 'Składniki: 3 papryki (czerwona, żółta, zielona), 2 cebule, sól').ingredients).toBe(
      '3 papryki (czerwona, żółta, zielona)\n2 cebule\nsól'
    );
    expect(parse('Sos', 'Składniki: jogurt, czosnek').ingredients).toBe('jogurt, czosnek');
  });

  it('drops an ad\'s copy along with its label', () => {
    const r = parse(
      'Zupa',
      'Składniki',
      '1 kg dyni',
      'sól',
      'REKLAMA',
      '186 kcal',
      'Nowy blender TurboMix 3000',
      'Kup teraz -30%',
      'Przygotowanie',
      'Ugotuj dynię.'
    );
    expect(r.ingredients).toBe('1 kg dyni\nsól');
    expect(r.instructions).toBe('Ugotuj dynię.');
  });

  it('reads the divider of "SKŁADNIKI / 4 PORCJE" on its own line and a misspelt "Prep time"', () => {
    expect(parse('Schabowe', 'SKŁADNIKI', '|4 PORCJE', '600 g schabu').servings).toBe(4);
    expect(parse('Bread', 'Prep timne: 15 min', 'Ingredients', '3 bananas').prepTime).toBe(15);
  });

  it('strips chat bold markup from a title and routes a footer link to notes', () => {
    const r = parse('*Sos czosnkowy*', 'Składniki', '200 g jogurtu', 'Przygotowanie', 'Wymieszaj.', 'www.przepisy.example zapisz');
    expect(r.title).toBe('Sos czosnkowy');
    expect(r.instructions).toBe('Wymieszaj.');
    expect(r.notes).toBe('www.przepisy.example zapisz');
  });
});

// Review findings: the screenshot rules must not cost ordinary pasted text anything.
describe('parsePastedRecipe — screenshot rules leave ordinary text alone', () => {
  const parse = (...lines: string[]) => parsePastedRecipe(lines.join('\n'));

  it('does not take a lowercase one-word title for an account name', () => {
    const r = parse('pizza', 'Składniki', '500 g mąki', 'Przygotowanie', 'Wyrób ciasto.', 'pizza Margherita to klasyk, piecz ją krótko.');
    expect(r.title).toBe('pizza');
    expect(r.ingredients).toBe('500 g mąki');
    expect(r.instructions).toBe('Wyrób ciasto.\npizza Margherita to klasyk, piecz ją krótko.');
  });

  it('takes a plain account name only with app chrome around it', () => {
    const r = parse('bakewithmia', 'Liczba polubień: 23 481', 'bakewithmia PEANUT BUTTER COOKIES', 'INGREDIENTS', '1 egg');
    expect(r.title).toBe('PEANUT BUTTER COOKIES');
  });

  it('keeps the method under an ad label: only copy that sells is dropped', () => {
    const r = parse(
      'Pierogi', 'Składniki', '500 g mąki', 'Przygotowanie', 'Zagnieć ciasto.', 'Reklama',
      'Rozwałkuj cienko i wykrawaj krążki.', 'Nałóż farsz i sklej brzegi.', 'Gotuj 3 minuty.'
    );
    expect(r.instructions).toBe('Zagnieć ciasto.\nRozwałkuj cienko i wykrawaj krążki.\nNałóż farsz i sklej brzegi.\nGotuj 3 minuty.');
  });

  it('keeps an amount-less ingredient that follows an ad label', () => {
    const r = parse('Zupa', 'Składniki', '1 kg dyni', 'Reklama', 'sól', 'pieprz', 'Przygotowanie', 'Ugotuj.');
    expect(r.ingredients).toBe('1 kg dyni\nsól\npieprz');
  });

  it('keeps a capitals title of five words over a subtitle', () => {
    const r = parse('PLACKI Z JABŁKAMI I CYNAMONEM', 'Najlepsze placki mojej babci', 'Składniki', '2 jabłka');
    expect(r.title).toBe('PLACKI Z JABŁKAMI I CYNAMONEM');
  });

  it('does not split one ingredient at the commas of its description', () => {
    expect(parse('Zupa', 'Składniki', '1 kg ziemniaków, obranych, pokrojonych w kostkę').ingredients).toBe(
      '1 kg ziemniaków, obranych, pokrojonych w kostkę'
    );
    expect(parse('Zupa', 'Składniki: 1 kg ziemniaków, obranych, pokrojonych w kostkę').ingredients).toBe(
      '1 kg ziemniaków, obranych, pokrojonych w kostkę'
    );
    // A plain line under a header is not an inline list either.
    expect(parse('Sos', 'Składniki', 'sól, pieprz, słodka papryka').ingredients).toBe('sól, pieprz, słodka papryka');
  });

  it('does not make a group heading of a remark', () => {
    const r = parse('Ciasto', 'Składniki', '300 g mąki', 'Uwaga:', '2 jajka muszą być zimne');
    expect(r.ingredients).toBe('300 g mąki\nUwaga:\n2 jajka muszą być zimne');
  });

  it('after an inline list keeps a long plain ingredient among the ingredients', () => {
    const r = parse('Sos', 'Składniki: jogurt, czosnek, sól', 'szczypta soli morskiej i skórka otarta z jednej cytryny');
    expect(r.ingredients).toBe('jogurt\nczosnek\nsól\nszczypta soli morskiej i skórka otarta z jednej cytryny');
  });
});

describe('parsePastedRecipe — an ad label never costs recipe lines', () => {
  const parse = (...lines: string[]) => parsePastedRecipe(lines.join('\n'));

  it('keeps steps and a blog footer link under an ad label', () => {
    const r = parse(
      'Pierogi', 'Składniki', '500 g mąki', 'Przygotowanie', 'Zagnieć ciasto.', 'Reklama',
      'Rozwałkuj cienko i wykrawaj krążki.', 'Ugotuj w osolonej wodzie.', 'Więcej przepisów na www.mojblog.pl'
    );
    // Nothing but the label goes — the footer is kept like any unclassified line.
    expect(r.instructions).toBe(
      'Zagnieć ciasto.\nRozwałkuj cienko i wykrawaj krążki.\nUgotuj w osolonej wodzie.\nWięcej przepisów na www.mojblog.pl'
    );
  });

  it('keeps a sentence that merely mentions ordering', () => {
    const r = parse('Ciasto', 'Składniki', '500 g mąki', 'Przygotowanie', 'Wymieszaj.', 'Reklama', 'Możesz też zamówić gotowe ciasto w piekarni.', 'Piecz 30 minut.');
    expect(r.instructions).toBe('Wymieszaj.\nMożesz też zamówić gotowe ciasto w piekarni.\nPiecz 30 minut.');
  });

  it('still drops a product line and its call to action', () => {
    const r = parse('Zupa', 'Składniki', '1 kg dyni', 'REKLAMA', 'Nowy blender TurboMix 3000', 'Kup teraz -30%', 'Przygotowanie', 'Ugotuj dynię.');
    expect(r.ingredients).toBe('1 kg dyni');
  });
});

// CodeQL js/redos (alert #1): the hashtag-line rule backtracked exponentially,
// so one crafted line of pasted, OCR'd or imported text froze the JS thread.
describe('isRecipeNoise — hashtag lines in linear time', () => {
  it.each(['#obiad #szybko', '#obiad#szybko', '#obiad #szybko more', '#Obiad  #x  Więcej', '##', '#a#'])(
    '%s is noise',
    (line) => {
      expect(isRecipeNoise(line)).toBe(true);
    }
  );

  it.each(['# Ciasto', '#', '#obiad more x', '#a b'])('%s is not noise', (line) => {
    expect(isRecipeNoise(line)).toBe(false);
  });

  it('answers a crafted hashtag line without catastrophic backtracking', () => {
    // 25 repetitions took about a second with the old rule, doubling every one more.
    const crafted = '#' + '!#'.repeat(25) + ' x';
    const start = performance.now();
    expect(isRecipeNoise(crafted)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('parses a pasted recipe holding the crafted line', () => {
    const crafted = '#' + '!#'.repeat(25) + ' x';
    const start = performance.now();
    const r = parsePastedRecipe(['Bułki', 'Składniki', 'mąka', 'Przygotowanie', 'Mieszaj.', crafted].join('\n'));
    expect(r.ingredients).toBe('mąka');
    expect(performance.now() - start).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Gaps found by mutation testing (docs/mutation-testing.md): the structured
// HTML paths (JSON-LD, microdata, entity decoding).
// ---------------------------------------------------------------------------
describe('parseIsoDuration — anchoring and multi-digit parts', () => {
  it('reads multi-digit hours and day counts', () => {
    expect(parseIsoDuration('PT12H')).toBe(720);
    expect(parseIsoDuration('P10DT30M')).toBe(30);
  });

  it.each(['xPT30M', 'PT30Mx'])('%p (text around the duration) -> null', (value) => {
    expect(parseIsoDuration(value)).toBeNull();
  });
});

describe('parseRecipeJsonLd — block shapes', () => {
  it('finds a Recipe in a top-level array, skipping null and non-object entries', () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      null,
      'x',
      { '@type': 'Recipe', name: 'Z tablicy' },
    ])}</script>`;
    expect(parseRecipeJsonLd(html)!.title).toBe('Z tablicy');
  });

  it('finds the block with other attributes before and after type', () => {
    const html = `<script id="ld" type="application/ld+json" data-x="1">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Z atrybutami',
    })}</script>`;
    expect(parseRecipeJsonLd(html)!.title).toBe('Z atrybutami');
  });

  it('keeps only string ingredients and skips null steps', () => {
    const r = parseRecipeJsonLd(
      ldScript({
        '@type': 'Recipe',
        recipeIngredient: ['mąka', 5, null, 'jajko'],
        recipeInstructions: [null, 'Wymieszaj.'],
      })
    )!;
    expect(r.ingredients).toBe('mąka\njajko');
    expect(r.instructions).toBe('Wymieszaj.');
  });

  it('leaves instructions unset when the Recipe has none', () => {
    const r = parseRecipeJsonLd(ldScript({ '@type': 'Recipe', name: 'Bez kroków' }))!;
    expect(r).not.toHaveProperty('instructions');
  });
});

describe('parseRecipeMicrodata — markup details', () => {
  const recipe = (inner: string, attrs = 'itemscope itemtype="https://schema.org/Recipe"') =>
    `<div ${attrs}>${inner}<span itemprop="recipeIngredient">mąka</span></div>`;

  it('reads attribute names case-insensitively and itemscope as the last attribute', () => {
    const r = parseRecipeMicrodata(
      `<div ITEMTYPE="https://schema.org/Recipe" itemscope><span ITEMPROP="name">Placki</span><span itemprop="recipeIngredient">mąka</span></div>`
    )!;
    expect(r.title).toBe('Placki');
  });

  it('accepts a Recipe listed with a second item type, but not a look-alike type', () => {
    expect(
      parseRecipeMicrodata(
        recipe('<span itemprop="name">Placki</span>', 'itemscope itemtype="https://schema.org/Recipe https://schema.org/HowTo"')
      )!.title
    ).toBe('Placki');
    expect(
      parseRecipeMicrodata(recipe('', 'itemscope itemtype="https://schema.org/RecipeX"'))
    ).toBeNull();
  });

  it('skips an unrelated item without an itemtype before the Recipe', () => {
    const html = `<div itemscope><span itemprop="name">Inne</span></div>${recipe('<span itemprop="name">Placki</span>')}`;
    expect(parseRecipeMicrodata(html)!.title).toBe('Placki');
  });

  it('keeps a single-quoted attribute value that contains ">"', () => {
    const r = parseRecipeMicrodata(recipe(`<meta itemprop='name' content='Zupa > krem'>`))!;
    expect(r.title).toBe('Zupa > krem');
  });

  it('ignores a stray closing tag that matches nothing open', () => {
    const r = parseRecipeMicrodata(recipe('<span itemprop="name">Pierogi</b> ruskie</span>'))!;
    expect(r.title).toBe('Pierogi ruskie');
  });

  it('a Recipe without a name has no title', () => {
    expect(parseRecipeMicrodata(recipe(''))!.title).toBeUndefined();
  });

  it('drops comments and scripts from property text', () => {
    const r = parseRecipeMicrodata(
      recipe('<span itemprop="name">Pie<!-- x -->rogi<script>\n var a = 1;\n</script></span>')
    )!;
    expect(r.title).toBe('Pierogi');
  });

  it('decodes named and numeric entities', () => {
    const named =
      '&amp; &lt; &gt; &quot; &apos; a&nbsp;b &deg; &frac12; &frac14; &frac34; &ndash; &mdash; &hellip; &oacute; &Oacute;';
    const r = parseRecipeMicrodata(
      recipe(
        `<span itemprop="name">${named}</span><span itemprop="recipeIngredient">&#176; &#x2013; &#1; &#x10ffff; &#0; &#x110000; &bogus;</span>`
      )
    )!;
    expect(r.title).toBe('& < > " \' a b ° ½ ¼ ¾ – — … ó Ó');
    expect(r.ingredients!.split('\n')[0]).toBe(
      '° – \u0001 \u{10ffff} &#0; &#x110000; &bogus;'
    );
  });

  it('breaks text into lines at block tags and <br />, collapsing whitespace', () => {
    const r = parseRecipeMicrodata(
      recipe(
        '<div itemprop="recipeInstructions"><h2>Ciasto</h2>Wymieszaj   \t mąkę.<br />Odstaw.<li>Piecz.<li>Studź.</div>'
      )
    )!;
    expect(r.instructions).toBe('Ciasto\nWymieszaj mąkę.\nOdstaw.\nPiecz.\nStudź.');
  });
});

describe('parseRecipeMicrodata — name-only fallback', () => {
  it('reads only the Recipe element, not the page text around it', () => {
    const r = parseRecipeMicrodata(`<div itemscope itemtype="https://schema.org/Recipe">
        <span itemprop="name">Sernik</span>
        <h3>Składniki</h3><ul><li>twaróg</li></ul>
        <h3>Przygotowanie</h3><p>Upiecz.</p>
      </div>
      <p>Podawaj z bitą śmietaną.</p>`)!;
    expect(r.instructions).toBe('Upiecz.');
    expect(r.notes).toBeFalsy();
  });

  it('prefers marked-up times over times found in the text', () => {
    const r = parseRecipeMicrodata(`<div itemscope itemtype="https://schema.org/Recipe">
        <span itemprop="name">Sernik</span>
        <meta itemprop="prepTime" content="PT15M"><meta itemprop="cookTime" content="PT50M">
        <p>Czas przygotowania: 30 minut</p><p>Czas pieczenia: 60 minut</p>
        <h3>Składniki</h3><ul><li>twaróg</li></ul>
        <h3>Przygotowanie</h3><p>Upiecz.</p>
      </div>`)!;
    expect(r.prepTime).toBe(15);
    expect(r.cookTime).toBe(50);
  });
});

describe('parsePastedRecipe — gaps found by mutation testing', () => {
  const paste = (...lines: string[]) => parsePastedRecipe(lines.join('\n'));

  it('merges a quantity line onto the ingredient name above it, across blank lines', () => {
    const r = paste('Sushi', 'Składniki', 'ryż do sushi  ', '', '250 g', 'Przygotowanie', 'Ugotuj ryż.');
    expect(r.ingredients).toBe('ryż do sushi – 250 g');
  });

  it('does not merge a quantity onto a bullet, a line with a number, or nothing', () => {
    expect(paste('Sushi', 'Składniki', '- nori', '2 g', 'Przygotowanie', 'Zwiń.').ingredients).toBe(
      '- nori\n2 g'
    );
    expect(paste('Sushi', 'Składniki', '2 jajka', '250 g', 'Przygotowanie', 'Zwiń.').ingredients).toBe(
      '2 jajka\n250 g'
    );
    expect(paste('Sushi', 'Składniki', '250 g', 'ryż', 'Przygotowanie', 'Zwiń.').ingredients).toBe(
      '250 g\nryż'
    );
  });

  it('reads a 1-minute time but not a 0-minute one', () => {
    const r = paste('Placki', 'Czas przygotowania: 0 minut', 'Czas gotowania: 1 minuta', 'Składniki', 'mąka', 'Przygotowanie', 'Usmaż.');
    expect(r.prepTime).toBeNull();
    expect(r.cookTime).toBe(1);
  });

  describe('a text without any header', () => {
    it('takes an ingredient list that runs to the end of the text', () => {
      const r = paste('Placki', '200 g mąki', '2 jajka', '1 szklanka mleka');
      expect(r.ingredients).toBe('200 g mąki\n2 jajka\n1 szklanka mleka');
      expect(r.instructions).toBe('');
    });

    it('keeps a long amount line in the list and ends it at a short step', () => {
      const r = paste('Placki', '200 g mąki', '2 łyżki cukru pudru do posypania', '1 szklanka mleka', 'Wymieszaj.', 'Usmaż na patelni.');
      expect(r.ingredients).toBe('200 g mąki\n2 łyżki cukru pudru do posypania\n1 szklanka mleka');
      expect(r.instructions).toBe('Wymieszaj.\nUsmaż na patelni.');
    });

    it('needs three amount lines: plain items alone do not make a list', () => {
      const r = paste('Placki', '200 g mąki', 'sól', 'pieprz', 'koperek', 'Wymieszaj wszystko dokładnie w misce.');
      expect(r.ingredients).toBe('');
    });
  });
});

describe('extractTitleServings — spacing', () => {
  it('drops the space in front of punctuation after the bracket', () => {
    expect(extractTitleServings('Shakshuka (serves 2) !')).toEqual({ title: 'Shakshuka!', servings: 2 });
  });

  it('reads a padded bracket and collapses the spaces around it', () => {
    expect(extractTitleServings('Zupa  ( 4 porcje )  krem')).toEqual({ title: 'Zupa krem', servings: 4 });
  });
});
