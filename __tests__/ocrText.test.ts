// TDD red phase for the "From photo (OCR)" import feature (SPEC.md §5.15, mode
// T3 "Text assembly"). The module @/utils/ocrText does not exist yet; these
// tests should fail because of the missing implementation, not setup errors.
import {
  dropClippedEdgeLines,
  ocrBlocksToText,
  normalizeOcrText,
  OcrBlock,
  reflowBlockLines,
} from '@/utils/ocrText';
import { parsePastedRecipe } from '@/utils/recipeImport';

describe('ocrBlocksToText', () => {
  it('sorts blocks ascending by frame.top (out-of-order array -> top-to-bottom text)', () => {
    const blocks: OcrBlock[] = [
      { text: 'bottom', frame: { top: 200 } },
      { text: 'top', frame: { top: 10 } },
      { text: 'middle', frame: { top: 100 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('top\nmiddle\nbottom');
  });

  it('joins a block\'s lines[].text with \\n in order', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'ignored fallback',
        lines: [{ text: 'first' }, { text: 'second' }, { text: 'third' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('first\nsecond\nthird');
  });

  it('falls back to block.text when lines is undefined', () => {
    const blocks: OcrBlock[] = [{ text: 'plain block text', frame: { top: 0 } }];
    expect(ocrBlocksToText(blocks)).toBe('plain block text');
  });

  it('falls back to block.text when lines is an empty array', () => {
    const blocks: OcrBlock[] = [
      { text: 'fallback here', lines: [], frame: { top: 0 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('fallback here');
  });

  it('drops whitespace-only / empty lines from the output', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'x',
        lines: [{ text: 'keep' }, { text: '   ' }, { text: '' }, { text: 'also keep' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('keep\nalso keep');
  });

  it('separates blocks by a single \\n (no blank line between blocks)', () => {
    const blocks: OcrBlock[] = [
      { text: 'block one', frame: { top: 0 } },
      { text: 'block two', frame: { top: 10 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('block one\nblock two');
  });

  it('returns "" for an empty array', () => {
    expect(ocrBlocksToText([])).toBe('');
  });

  it('does not throw when a block has no frame, and still contributes its text', () => {
    const blocks: OcrBlock[] = [{ text: 'no frame here' }];
    expect(() => ocrBlocksToText(blocks)).not.toThrow();
    expect(ocrBlocksToText(blocks)).toBe('no frame here');
  });

  it('blocks without frame.top sort AFTER framed blocks, keeping original relative order (stable)', () => {
    const blocks: OcrBlock[] = [
      { text: 'unframed A' },
      { text: 'framed low', frame: { top: 500 } },
      { text: 'unframed B' },
      { text: 'framed high', frame: { top: 5 } },
    ];
    // Framed blocks first (by top: 5 then 500), then unframed in original order.
    expect(ocrBlocksToText(blocks)).toBe(
      'framed high\nframed low\nunframed A\nunframed B'
    );
  });

  it('preserves Polish diacritics verbatim', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'x',
        lines: [{ text: 'Składniki' }, { text: 'łyżka' }, { text: 'żółty' }],
        frame: { top: 0 },
      },
    ];
    expect(ocrBlocksToText(blocks)).toBe('Składniki\nłyżka\nżółty');
  });

  it('integrates with parsePastedRecipe: multi-block OCR result -> title + non-empty split', () => {
    // Given out of vertical order to also exercise the sort.
    const blocks: OcrBlock[] = [
      {
        text: 'Przygotowanie',
        lines: [
          { text: 'Przygotowanie' },
          { text: '1. Wymieszać mąkę z jajkami.' },
          { text: '2. Usmażyć na patelni.' },
        ],
        frame: { top: 300 },
      },
      {
        text: 'Naleśniki',
        lines: [{ text: 'Naleśniki' }],
        frame: { top: 10 },
      },
      {
        text: 'Składniki',
        lines: [
          { text: 'Składniki' },
          { text: 'mąka' },
          { text: 'jajka' },
        ],
        frame: { top: 120 },
      },
    ];

    const assembled = ocrBlocksToText(blocks);
    const parsed = parsePastedRecipe(assembled);

    expect(parsed.title).toBe('Naleśniki');
    expect(parsed.ingredients).toBe('mąka\njajka');
    expect(parsed.instructions).toBe(
      '1. Wymieszać mąkę z jajkami.\n2. Usmażyć na patelni.'
    );
  });
});

// A block with the full axis-aligned bounding box ML Kit reports.
const box = (text: string, left: number, top: number, width: number, height = 30): OcrBlock => ({
  text,
  frame: { left, top, width, height },
});

describe('ocrBlocksToText — column-aware reading order', () => {
  it('reads a two-column page column by column, below a full-width title', () => {
    const blocks: OcrBlock[] = [
      box('Zupa', 40, 0, 900, 50),
      box('Składniki', 40, 100, 300),
      box('Przygotowanie', 420, 100, 500),
      box('500 g pomidorów', 40, 140, 300),
      box('1. Posiekaj cebulę.', 420, 140, 500, 60),
      box('1 cebula', 40, 180, 300),
      box('2. Dodaj pomidory.', 420, 220, 500, 60),
      box('sól', 40, 220, 300),
    ];
    expect(ocrBlocksToText(blocks)).toBe(
      'Zupa\nSkładniki\n500 g pomidorów\n1 cebula\nsól\n' +
        'Przygotowanie\n1. Posiekaj cebulę.\n2. Dodaj pomidory.'
    );
  });

  it('puts a full-width block below the columns after both columns', () => {
    const blocks: OcrBlock[] = [
      box('left 1', 40, 0, 300),
      box('right 1', 420, 0, 300),
      box('left 2', 40, 40, 300),
      box('right 2', 420, 40, 300),
      box('Smacznego!', 40, 120, 700),
    ];
    expect(ocrBlocksToText(blocks)).toBe('left 1\nleft 2\nright 1\nright 2\nSmacznego!');
  });

  it('keeps a column whose first line sits lower than the other column\'s', () => {
    const blocks: OcrBlock[] = [
      box('left 1', 40, 0, 300),
      box('left 2', 40, 40, 300),
      box('right 1', 420, 60, 300),
      box('left 3', 40, 80, 300),
      box('right 2', 420, 100, 300),
    ];
    expect(ocrBlocksToText(blocks)).toBe('left 1\nleft 2\nleft 3\nright 1\nright 2');
  });

  it('joins a "Label:" cell with the value beside it into one line', () => {
    const blocks: OcrBlock[] = [
      box('Placek', 40, 0, 600),
      box('40 min', 500, 50, 100),
      box('Czas:', 40, 50, 100),
      box('Wszystko wymieszać i upiec w piekarniku.', 40, 100, 600),
    ];
    expect(ocrBlocksToText(blocks)).toBe(
      'Placek\nCzas: 40 min\nWszystko wymieszać i upiec w piekarniku.'
    );
  });

  it('does not reorder stacked lines that merely do not overlap horizontally', () => {
    // A centered short line above a left-aligned one is still one column.
    const blocks: OcrBlock[] = [
      box('Ciasto', 400, 0, 120),
      box('mąka', 40, 40, 80),
      box('masło', 40, 80, 90),
    ];
    expect(ocrBlocksToText(blocks)).toBe('Ciasto\nmąka\nmasło');
  });

  it('reads a name ……… quantity table row by row, not as two columns', () => {
    const blocks: OcrBlock[] = [
      box('Składniki', 10, 177, 140, 26),
      box('Przygotowanie', 890, 177, 450, 32),
      box('schab bez kości', 72, 248, 164, 20),
      box('800 gramów', 692, 252, 110, 19),
      box('1. Pokrój mięso.', 890, 250, 700, 47),
      box('jajka', 74, 330, 60, 22),
      box('3 sztuki', 736, 333, 65, 16),
      box('mąka', 73, 411, 70, 22),
      box('100 gramów', 691, 411, 109, 22),
      box('2. Panieruj kotlety.', 890, 400, 700, 47),
    ];
    expect(ocrBlocksToText(blocks)).toBe(
      'Składniki\nschab bez kości 800 gramów\njajka 3 sztuki\nmąka 100 gramów\n' +
        'Przygotowanie\n1. Pokrój mięso.\n2. Panieruj kotlety.'
    );
  });

  it('keeps a header and a button on the same row as separate lines', () => {
    const blocks: OcrBlock[] = [
      box('PRZYGOTOWANIE', 40, 0, 250),
      box('DODAJ NOTATKĘ', 600, 0, 170),
      box('Wymieszaj wszystkie składniki w misce.', 40, 60, 700),
    ];
    expect(ocrBlocksToText(blocks)).toBe('PRZYGOTOWANIE\nDODAJ NOTATKĘ\nWymieszaj wszystkie składniki w misce.');
  });

  it('keeps aligned columns of prose apart (only quantity cells make a table)', () => {
    const blocks: OcrBlock[] = [
      box('Składniki', 40, 0, 300),
      box('Przygotowanie', 420, 0, 300),
      box('mąka', 40, 40, 300),
      box('Wymieszaj składniki.', 420, 40, 300),
      box('cukier', 40, 80, 300),
      box('Upiecz ciasto.', 420, 80, 300),
      box('masło', 40, 120, 300),
      box('Ostudź.', 420, 120, 300),
    ];
    expect(ocrBlocksToText(blocks)).toBe(
      'Składniki\nmąka\ncukier\nmasło\nPrzygotowanie\nWymieszaj składniki.\nUpiecz ciasto.\nOstudź.'
    );
  });

  it('falls back to top-only sorting when any framed block lacks left/width/height', () => {
    const blocks: OcrBlock[] = [
      box('right', 420, 0, 300),
      { text: 'top only', frame: { top: 10 } },
      box('left', 40, 0, 300),
    ];
    expect(ocrBlocksToText(blocks)).toBe('right\nleft\ntop only');
  });

  it('integrates with parsePastedRecipe: two-column page → ingredients and steps split', () => {
    const blocks: OcrBlock[] = [
      box('Zupa pomidorowa', 60, 50, 500, 60),
      box('Dla 4 osób · 45 minut', 60, 120, 300),
      box('Składniki', 60, 200, 200),
      box('Przygotowanie', 450, 200, 250),
      box('1 l bulionu', 60, 250, 200),
      box('1. Cebulę posiekaj i zeszklij.', 450, 250, 600, 70),
      box('500 g pomidorów', 60, 290, 200),
      box('1 cebula', 60, 330, 200),
      box('2. Dodaj pomidory, duś 10 minut.', 450, 340, 600, 70),
    ];
    const parsed = parsePastedRecipe(ocrBlocksToText(blocks));
    expect(parsed.title).toBe('Zupa pomidorowa');
    expect(parsed.servings).toBe(4);
    expect(parsed.ingredients).toBe('1 l bulionu\n500 g pomidorów\n1 cebula');
    expect(parsed.instructions).toBe(
      '1. Cebulę posiekaj i zeszklij.\n2. Dodaj pomidory, duś 10 minut.'
    );
  });
});

describe('normalizeOcrText', () => {
  it('maps diacritics Polish does not use to the Polish letter ML Kit misread', () => {
    expect(normalizeOcrText('Drožd že, lyžką, Žurek')).toBe('Drożd że, łyżką, Żurek');
    expect(normalizeOcrText('mạki, Ạ, kawẹ, podawaị')).toBe('mąki, Ą, kawę, podawaj');
    expect(normalizeOcrText('šliwki, čwierć, koň, kOŚcİ')).toBe('śliwki, ćwierć, koń, kości');
  });

  it('lets a misread "ž" label still reach parsePastedRecipe as a cook time', () => {
    const parsed = parsePastedRecipe(normalizeOcrText('Placek\nCzas smaženia: 25 min\nmąka'));
    expect(parsed.cookTime).toBe(25);
  });

  it('strips typographic bullets at line start, keeping Markdown markers', () => {
    expect(normalizeOcrText('• 3 jajka\n500 ml mleka\n● sól\n· pieprz\n▪ cukier')).toBe(
      '3 jajka\n500 ml mleka\nsól\npieprz\ncukier'
    );
    expect(normalizeOcrText('- 3 eggs\n* butter\n1. Mix')).toBe('- 3 eggs\n* butter\n1. Mix');
  });

  it('lowercases size-only capitals inside an otherwise lowercase word', () => {
    expect(normalizeOcrText('SZczypta soli\n2 ząbki cZOsnku')).toBe('Szczypta soli\n2 ząbki czosnku');
  });

  it('leaves real capitals alone: all-caps words, initial capitals, other letters', () => {
    const text = 'SOS CZOSNKOWY\nSkładniki\nŻurek\nMcDonald\niOS';
    expect(normalizeOcrText(text)).toBe(text);
  });

  it('reads a "|" after a quantity as the litre unit', () => {
    expect(normalizeOcrText('1| bulionu\n2 | wody')).toBe('1 l bulionu\n2 l wody');
    expect(normalizeOcrText('a | b')).toBe('a | b');
  });

  it('maps "ö" to "ó" and a "9" after a gram-sized quantity to "g"', () => {
    expect(normalizeOcrText('pöt łyżeczki\nserek 150 9\n-88 9 białka')).toBe(
      'pół łyżeczki\nserek 150 g\n- 88 g białka'
    );
    expect(normalizeOcrText('Krok 9\n1 9 jajek\n150 90')).toBe('Krok 9\n1 9 jajek\n150 90');
  });

  it('strips a checkbox read as "O"/"0"/"☐" before a short item', () => {
    expect(normalizeOcrText('O schab bez kości\n0 jajka\n☐ mąka\nO Przyprawa do mięs\nolej roślinny')).toBe(
      'schab bez kości\njajka\nmąka\nPrzyprawa do mięs\nolej roślinny'
    );
    const prose = 'O tej porze roku najlepiej smakują młode ziemniaki z koperkiem.\nO\nOK';
    expect(normalizeOcrText(prose)).toBe(prose);
  });

  it('drops dotted/dashed separator lines read as punctuation runs', () => {
    expect(normalizeOcrText('sól i pieprz\n*********\n.........\n- - - -\ndo namoczenia: mleko')).toBe(
      'sól i pieprz\ndo namoczenia: mleko'
    );
    expect(normalizeOcrText('- 3 eggs\n...')).toBe('- 3 eggs\n...');
  });

  it('leaves correct Polish text unchanged and is idempotent', () => {
    const text = 'Naleśniki z serem\n2 łyżki cukru\nŹródlana woda, ŚLIWKI, żółć';
    expect(normalizeOcrText(text)).toBe(text);
    const messy = '• SZczypta soli\n1| mleka\nlyžka';
    expect(normalizeOcrText(normalizeOcrText(messy))).toBe(normalizeOcrText(messy));
  });
});

// Blocks captured from ML Kit on an Android emulator (sdk_gphone16k_arm64) for
// two rendered Polish recipe pages — the misreads (ž, ạ, SZ, a stray "n",
// random bullets) and the skewed-photo frames are ML Kit's own.
describe('real ML Kit output → normalizeOcrText → parsePastedRecipe', () => {
  const parse = (blocks: OcrBlock[]) => parsePastedRecipe(normalizeOcrText(ocrBlocksToText(blocks)));

  it('printed page: times, servings and clean ingredient lines', () => {
    const r = parse([
      { text: 'Naleśniki z serem', frame: { top: 125, left: 139, width: 798, height: 85 } },
      { text: 'Czas prZygotowania: 20 min', frame: { top: 258, left: 141, width: 545, height: 49 } },
      { text: 'Czas smnaženia: 25 min\nLiczba porcji: 4', frame: { top: 323, left: 140, width: 438, height: 105 } },
      { text: 'Składniki:', frame: { top: 491, left: 142, width: 310, height: 47 } },
      { text: '2 szklanki mạki pszennej', frame: { top: 573, left: 243, width: 503, height: 61 } },
      { text: '• 3 jajka', frame: { top: 650, left: 199, width: 160, height: 56 } },
      { text: '500 ml mleka', frame: { top: 723, left: 220, width: 290, height: 51 } },
      { text: 'SZczypta soli', frame: { top: 797, left: 219, width: 260, height: 53 } },
      { text: '• 250 g twarogu półttustego', frame: { top: 875, left: 198, width: 570, height: 50 } },
      { text: '• 2 yžki cukru', frame: { top: 939, left: 184, width: 304, height: 54 } },
      { text: 'Przygotowanie:', frame: { top: 1058, left: 141, width: 472, height: 66 } },
      { text: '1. Mąkę wymieszaj z jajkami i mlekiem na gładkie ciasto.', frame: { top: 1157, left: 178, width: 1188, height: 47 } },
      { text: '2. Odstaw na 15 minut, a następnie smaż cienkie placki na rozgrzanej', frame: { top: 1229, left: 171, width: 1453, height: 47 } },
      { text: 'patelni.', frame: { top: 1298, left: 220, width: 154, height: 50 } },
      { text: '3. Twaróg rozgnieć widelcem z cukrem.', frame: { top: 1373, left: 170, width: 826, height: 47 } },
      { text: '4. Nakładaj farsz na naleśnikii zwijaj w rulony.', frame: { top: 1441, left: 169, width: 995, height: 52 } },
    ]);
    expect(r.title).toBe('Naleśniki z serem');
    expect(r.prepTime).toBe(20);
    expect(r.cookTime).toBe(25);
    expect(r.servings).toBe(4);
    expect(r.ingredients).toBe(
      '2 szklanki mąki pszennej\n3 jajka\n500 ml mleka\nSzczypta soli\n' +
        '250 g twarogu półtłustego\n2 łyżki cukru'
    );
    expect(r.instructions.startsWith('1. Mąkę wymieszaj')).toBe(true);
    // The wrapped tail ML Kit returned as its own block rejoins its step.
    expect(r.instructions).toContain(
      '2. Odstaw na 15 minut, a następnie smaż cienkie placki na rozgrzanej patelni.\n3. Twaróg'
    );
  });

  it('tilted photo: method header and paragraph overlap vertically yet stay in order', () => {
    const r = parse([
      { text: 'Placek drożdżowy ze Śliwkami', frame: { top: 268, left: 294, width: 1051, height: 133 } },
      { text: 'Czas pieczenia: 40 min', frame: { top: 414, left: 300, width: 383, height: 69 } },
      { text: 'Składniki', frame: { top: 502, left: 305, width: 235, height: 56 } },
      { text: '500 g mąki', frame: { top: 583, left: 310, width: 186, height: 54 } },
      { text: '25 g drożdży', frame: { top: 635, left: 315, width: 208, height: 62 } },
      { text: '250 ml ciepłego mleka', frame: { top: 681, left: 319, width: 374, height: 69 } },
      { text: '80 g masła', frame: { top: 752, left: 323, width: 181, height: 53 } },
      { text: '100 g cukru', frame: { top: 808, left: 329, width: 193, height: 55 } },
      { text: '1 kg śliwek węgierek', frame: { top: 855, left: 332, width: 335, height: 64 } },
      { text: 'Sposób przygotowania', frame: { top: 923, left: 336, width: 555, height: 90 } },
      { text: 'Drożdže rozpuść w mleku z lyžką cukru. Dodaj mạkę, roztopione masło i resztę cukru,\nwyrób ciasto. Odstaw do wyrośnięcia na godzinę. Rozłóż na blasze, ułóż połówki śliwek i\npiecz w 180°C.', frame: { top: 920, left: 340, width: 1470, height: 272 } },
    ]);
    expect(r.title).toBe('Placek drożdżowy ze Śliwkami');
    expect(r.cookTime).toBe(40);
    expect(r.ingredients).toBe(
      '500 g mąki\n25 g drożdży\n250 ml ciepłego mleka\n80 g masła\n100 g cukru\n1 kg śliwek węgierek'
    );
    expect(r.instructions.startsWith('Drożdże rozpuść w mleku z łyżką cukru. Dodaj mąkę')).toBe(true);
    expect(r.instructions).toBe(
      'Drożdże rozpuść w mleku z łyżką cukru. Dodaj mąkę, roztopione masło i resztę cukru, ' +
        'wyrób ciasto. Odstaw do wyrośnięcia na godzinę. Rozłóż na blasze, ułóż połówki śliwek i ' +
        'piecz w 180°C.'
    );
  });
});

// Real ML Kit blocks of three user-supplied recipe screenshots (a blog with
// ads, przepisy.pl with a name ……… quantity table, an Instagram infographic):
// [lines, top, left, width, height]. The method and tip sentences of the first
// two were reworded in place (same blocks and line breaks, misreads such as
// "ttuczkiem" and "buteczce" kept) so the repository carries no site's text.
type RawBlock = [string[], number, number, number, number];
const fromRaw = (raw: RawBlock[]): OcrBlock[] =>
  raw.map(([lines, top, left, width, height]) => ({
    text: lines.join('\n'),
    lines: lines.map((text) => ({ text })),
    frame: { top, left, width, height },
  }));

describe('real ML Kit output of recipe-site screenshots', () => {
  const parse = (raw: RawBlock[]) =>
    parsePastedRecipe(normalizeOcrText(ocrBlocksToText(fromRaw(raw))));

  it('blog page: "SKŁADNIKI / 4PORCJE" is a header with servings, ingredients and steps split', () => {
    const r = parse([
      [['nebuuS Nebulus'], 3, 98, 136, 13],
      [['SKŁADNIKI / 4PORCJE'], 194, 38, 261, 31],
      [['600 g schabu bez kości'], 281, 30, 248, 25],
      [['sól i pieprz'], 334, 37, 111, 28],
      [['do namoczenia: mleko'], 393, 30, 255, 18],
      [['do obtoczenia: 2 łyżki mąki, 2 jajka,', '5 łyżek butki tartej'], 443, 29, 394, 62],
      [['do smażenia: 6 łyżek smalcu lub', 'masła klarowanego'], 533, 29, 358, 61],
      [['PRZYGOTOWANIE'], 198, 489, 252, 23],
      [['Schab opłukać, osuszyć i oczyścić z błon oraz tłuszczu. Pokroić w poprzek', 'na 4 kawałki. Położyć każdy między dwoma arkuszami folii i rozbić na cienki', 'płat (mięso mocno się rozciągnie, prawie do wielkości dłoni). Najlepiej', 'uderzać od środka ku brzegom, płaską stroną tłuczka z wyttoczoną kratką.'], 284, 487, 865, 132],
      [['DODAJ NOTATKĘ'], 195, 1056, 169, 27],
      [['Kotlety włożyć do miski, zalać mlekiem, dodać sól i pieprz (dla aromatu', 'także kilka krążków cebuli) i odstawić do lodówki na 2 godziny albo dłużej', 'Jeśli jest czas (mogą też poleżeć w mleku całą noc).'], 446, 488, 864, 94],
      [['Mięso wyjąć z mleka i dokładnie osuszyć papierowym ręcznikiem. Posolić', '(niezbyt mocno, bo mleko było już słone) i oprószyć pieprzem, obtoczyć w', 'mące, potem w roztrzeparnym jajku, a na końcu w bułce tartej.'], 571, 488, 864, 98],
      [['Na patelni rozgrzać smalec (warstwa ok. 1/2 cm). Smażyć po 2 kotlety', 'naraz, najpierw na mocnym ogniu, po 2 minuty z każdej strony. Następnie', 'zmniejszyć płomień i smażyć jeszcze ok. 3 minuty z każdej strony.', 'Patelnię przetrzeć ręcznikiem papierowym i kolejną porcję smażyć już na', 'świeżym smalcu.'], 699, 488, 864, 168],
      [['Kotlety można też tylko zrumienić, a potem dopiec je w piekarniku', '(ok. 15 minut w 150 stopniach C).'], 897, 488, 863, 61],
      [['Gotowe kotlety odsączyć z tuszczu na ręczniku papierowym i', 'podawaćz ziemniakami oraz mizerią albo kapustą.'], 988, 498, 853, 61],
      [['HBO ORIGINAL', 'ROD SMOKA'], 1252, 618, 236, 69],
      [['Usuń'], 1392, 582, 43, 16],
      [['Usuwanie generatywne–', 'znikające zbędne obiekty'], 1395, 715, 397, 70],
      [['Dowiedz się więcej'], 1428, 1212, 143, 17],
      [['Adobe Lightroom'], 83, 1589, 297, 50],
      [['Szybkie operacje', 'skuteczna edycja', 'stuknięciem'], 205, 1517, 388, 142],
      [['Szybkie operacje'], 887, 1560, 152, 34],
      [['Niebo'], 963, 1544, 50, 16],
      [['Adobe', 'Lightroom'], 1403, 1410, 152, 63],
      [['Dowiedz się więcej'], 398, 1626, 196, 30],
      [['Retuszowanie'], 960, 1665, 118, 23],
      [['Wzmocnij'], 957, 1870, 73, 27],
    ]);
    expect(r.servings).toBe(4);
    expect(r.ingredients.split('\n')[0]).toBe('600 g schabu bez kości');
    expect(r.ingredients).toBe(
      '600 g schabu bez kości\nsól i pieprz\ndo namoczenia: mleko\ndo obtoczenia: 2 łyżki mąki, 2 jajka, ' +
        '5 łyżek bułki tartej\ndo smażenia: 6 łyżek smalcu lub masła klarowanego'
    );
    expect(r.instructions.startsWith('Schab opłukać, osuszyć i oczyścić')).toBe(true);
    expect(r.instructions).not.toContain('600 g schabu');
    // Each soft-wrapped paragraph block reflows into one line.
    const steps = r.instructions.split('\n');
    const starts = [
      'Schab opłukać', 'Kotlety włożyć', 'Mięso wyjąć',
      'Na patelni rozgrzać', 'Kotlety można', 'Gotowe kotlety',
    ];
    starts.forEach((start, i) => expect(steps[i].startsWith(start)).toBe(true));
    expect(steps[0].endsWith('z wyttoczoną kratką.')).toBe(true);
    expect(steps[3].endsWith('na świeżym smalcu.')).toBe(true);
  });

  it('przepisy.pl: quantities stay on their ingredient, site chrome is dropped', () => {
    const r = parse([
      [['9przepisy.pl'], 24, 32, 187, 32],
      [['Sktadniki'], 177, 10, 142, 26],
      [['Tagi:'], 1096, 9, 46, 22],
      [['O schab bez kOŚcİ'], 248, 72, 164, 20],
      [['O jajka'], 330, 74, 60, 22],
      [['O Przyprawa do mięs Knorr noy'], 287, 74, 300, 24],
      [['O butka tarta'], 371, 74, 114, 20],
      [['O mąka'], 411, 73, 70, 22],
      [['olej roślinny'], 454, 95, 106, 19],
      [['O świeży koperek'], 490, 72, 158, 26],
      [['EMAIL >'], 575, 68, 91, 17],
      [['PRZEPISY'], 33, 364, 106, 17],
      [['LISTONIC >'], 572, 233, 116, 20],
      [['proste przepisy na obiad'], 1096, 95, 184, 19],
      [['BLOG'], 33, 539, 59, 17],
      [['NEWSLETTER- Otrzymuj sezonowe przepisy i porady'], 111, 325, 559, 27],
      [['prosty obiad z mięsem'], 1099, 350, 172, 16],
      [['GRA'], 33, 668, 46, 17],
      [['MEAL PLANNER'], 33, 784, 173, 17],
      [['800 gramów'], 252, 692, 110, 19],
      [['2 łyżki'], 293, 747, 55, 20],
      [['kotlety na obiad'], 1094, 590, 118, 22],
      [['3 sztuki'], 333, 736, 65, 16],
      [['200 gramów'], 370, 691, 109, 24],
      [['100 gramów'], 411, 691, 109, 22],
      [['2 łyżki', '2 łyżki'], 453, 747, 53, 62],
      [['mięso'], 1100, 778, 46, 15],
      [['Krok 1'], 270, 891, 67, 20],
      [['Przygotowanie krok po kroku'], 177, 893, 452, 32],
      [['Krok 2'], 465, 891, 71, 19],
      [['Rno'], 29, 1029, 60, 18],
      [['Schab pokrój na plastry ok. 1,5 cm i rozbij ttuczkiem na grubość ok. 3 mm. Roztrzep', 'jajka.'], 305, 889, 736, 47],
      [['Krok 3'], 660, 892, 70, 19],
      [['HELLMANNs'], 26, 1169, 58, 16],
      [['Bułkę tartą połącz z przyprawą do mięs. Kotlety obtocz kolejno w mące, jajku i', 'buteczce.'], 495, 890, 723, 51],
      [['jajka'], 1099, 890, 35, 17],
      [['Smaż na gorącym oleju po 3-4 min. z każdej strony, aż panierka się zrumieni,', 'najlepiej z gotowanynmi ziemniakami i surówką z marchewki.'], 694, 891, 689, 48],
      [['STERUJ GESTEM >'], 884, 987, 187, 21],
      [['Dobra rada:'], 961, 986, 114, 25],
      [['ZAPISZ SIĘ'], 115, 1546, 111, 21],
      [['d STERUJ GŁOSEM >'], 884, 1248, 233, 21],
      [['prosty przepis z mięsem'], 1095, 994, 183, 22],
      [['Do jajek dodaj 100 ml mleka - panierka wyjdzie delikatniejsza. Do kotletów podaj ćwiartkę cytryny.'], 1000, 985, 906, 17],
      [['obiad'], 1099, 1248, 41, 13],
      [['kotlety schabowe'], 1099, 1358, 132, 16],
      [['T DODAJ NOTATKĘ >'], 882, 1698, 245, 25],
      [['proste przepisy na obiad'], 1095, 1558, 184, 21],
      [['instagram'], 1098, 1812, 76, 17],
    ]);
    expect(r.ingredients.split('\n').slice(0, 5)).toEqual([
      'schab bez kości 800 gramów',
      'Przyprawa do mięs Knorr noy 2 łyżki',
      'jajka 3 sztuki',
      'bułka tarta 200 gramów',
      'mąka 100 gramów',
    ]);
    expect(r.ingredients).toContain('olej roślinny 2 łyżki\nświeży koperek 2 łyżki');
    expect(r.ingredients).not.toContain('PRZEPISY');
    expect(r.ingredients).not.toContain('EMAIL');
    expect(r.instructions.split('\n')[0]).toBe('Krok 1');
    expect(r.instructions).toContain('Schab pokrój na plastry ok. 1,5 cm');
    expect(r.instructions).toContain(
      'Krok 1\nSchab pokrój na plastry ok. 1,5 cm i rozbij tłuczkiem na grubość ok. 3 mm. Roztrzep jajka.\n' +
        'Krok 2\nBułkę tartą połącz z przyprawą do mięs. Kotlety obtocz kolejno w mące, jajku i bułeczce.'
    );
    expect(r.instructions).not.toContain('STERUJ');
    expect(r.notes).toContain('Do jajek dodaj 100 ml mleka');
  });

  it('infographic: ingredients clean of bullets, grams and "ó" restored', () => {
    const r = parse([
      [['SERNIK,'], 5, 83, 649, 144],
      [['2 krenem'], 141, 172, 443, 94],
      [['Lotus Biseoff'], 216, 54, 646, 162],
      [['PROSTO, zOROWO I OBŁĘDNIE PYSZNIE!'], 414, 38, 620, 42],
      [['SKŁADNIKI'], 534, 58, 191, 33],
      [['• 2 jaja'], 598, 38, 106, 34],
      [['• twarog chudy 250 g'], 650, 39, 303, 32],
      [['• serek Grani proteinowy 150 9'], 698, 40, 421, 33],
      [['budyń waniliowy bez cukru'], 748, 76, 350, 32],
      [['•pöt lyżeczki pronzku do pieczeria', 'erytrytol do smaku'], 792, 39, 469, 86],
      [['• 15g kremu Lotus Biscoff', '(do posmarowaria)'], 890, 39, 356, 82],
      [['PRZYGOToWANIE'], 1064, 48, 321, 30],
      [['Wszyatie sfadrikh'], 1134, 165, 223, 33],
      [['wymieszaj na gladką mase'], 1174, 167, 306, 27],
      [['Przle do forerk'], 1230, 165, 195, 26],
      [['ytodonj pspierem do piecza).'], 1264, 167, 356, 26],
      [['Rect w t8oC pre 30-40 minut.'], 1318, 166, 367, 27],
      [['at sernk se zarumeni', 'bedie scety'], 1351, 165, 235, 53],
      [['Po ostudpeniu pouman', 'kree Lotus Bscofl'], 1426, 165, 250, 52],
      [['KALORIE', '-945 kcal'], 1338, 794, 109, 65],
      [['WARTOSCI ODZYWCZE (CAŁOSC)'], 1247, 841, 471, 33],
      [['BUALKO'], 1331, 1040, 89, 34],
      [['otus)'], 12, 1213, 134, 92],
      [['-88 9'], 1376, 1042, 67, 31],
      [['Bucoff'], 117, 1167, 137, 49],
      [['1 PORCIA', '(1/4 SERNIKA)'], 1325, 1269, 162, 68],
      [['-236 kcal | -22 g bialka'], 1403, 1248, 244, 26],
      [['ST6ACT 3KOsT 0SA1rwALKO'], 1510, 735, 632, 30],
      [['1'], 1522, 1540, 10, 24],
    ]);
    expect(r.ingredients).toBe(
      '2 jaja\ntwarog chudy 250 g\nserek Grani proteinowy 150 g\nbudyń waniliowy bez cukru\n' +
        'pół łyżeczki pronzku do pieczeria\nerytrytol do smaku\n15g kremu Lotus Biscoff (do posmarowaria)'
    );
    expect(r.instructions.startsWith('Wszyatie sfadrikh')).toBe(true);
  });
});

// One line per block, with the line's own frame (ML Kit reports both).
const lineBlock = (text: string, top: number, height = 34, left = 40, width = 600): OcrBlock => {
  const frame = { top, left, width, height };
  return { text, lines: [{ text, frame }], frame };
};

describe('dropClippedEdgeLines', () => {
  const size = { width: 700, height: 300 };

  it('drops a squat line cut by the bottom crop edge', () => {
    const blocks = [
      lineBlock('pierwsza linia', 10),
      lineBlock('druga linia', 54),
      lineBlock('trzecia linia', 98),
      lineBlock('Dah', 282, 17),
    ];
    expect(ocrBlocksToText(dropClippedEdgeLines(blocks, size))).toBe(
      'pierwsza linia\ndruga linia\ntrzecia linia'
    );
  });

  it('drops a squat line cut by the top crop edge', () => {
    const blocks = [
      lineBlock('ucięta', 0, 15),
      lineBlock('pierwsza linia', 40),
      lineBlock('druga linia', 84),
      lineBlock('trzecia linia', 128),
    ];
    expect(ocrBlocksToText(dropClippedEdgeLines(blocks, size))).toBe(
      'pierwsza linia\ndruga linia\ntrzecia linia'
    );
  });

  it('keeps a full-height line touching the edge and small print away from it', () => {
    const blocks = [
      lineBlock('pierwsza linia', 10),
      lineBlock('przypis drobnym drukiem', 60, 16),
      lineBlock('druga linia', 100),
      lineBlock('ostatnia, przycięta ciasno', 266, 33),
    ];
    expect(dropClippedEdgeLines(blocks, size)).toEqual(blocks);
  });

  it('drops only the clipped line of a multi-line block, keeping the rest', () => {
    const lines = [
      { text: 'Wyłącz palnik.', frame: { top: 200, left: 40, width: 500, height: 34 } },
      { text: 'Lat', frame: { top: 283, left: 40, width: 40, height: 16 } },
    ];
    const blocks: OcrBlock[] = [
      lineBlock('pierwsza linia', 10),
      lineBlock('druga linia', 54),
      { text: 'Wyłącz palnik.\nLat', lines, frame: { top: 200, left: 40, width: 500, height: 99 } },
    ];
    expect(ocrBlocksToText(dropClippedEdgeLines(blocks, size))).toBe(
      'pierwsza linia\ndruga linia\nWyłącz palnik.'
    );
  });

  it('changes nothing without the image size or with too few lines to judge', () => {
    const blocks = [lineBlock('linia', 10), lineBlock('Dah', 282, 17)];
    expect(dropClippedEdgeLines(blocks)).toEqual(blocks);
    expect(dropClippedEdgeLines(blocks, size)).toEqual(blocks);
  });

  it('real ML Kit read of a Facebook comment cropped mid-line: the cut line is gone', () => {
    // [text, top, left, width, height] per line; null separates blocks.
    const raw: ([string, number, number, number, number] | null)[] = [
      ['Do dużego garnka nalej 2 litry wody, wsyp 60 g', 38, 147, 713, 34],
      ['soli, 12 ziaren pieprzu, 4 ziarna ziela', 81, 146, 704, 33],
      ['angielskiego, 2 liście laurowe, 6 ząbków', 123, 154, 605, 37],
      ['czOsnku, 2 łyżki majeranku, 1 tyżkę ziół, 1', 169, 146, 700, 33],
      ['tyżkę kminku, 70 gmajonezu oraz 60g', 212, 146, 634, 37],
      ['musztardy. Wszystko razem wymieszaj i', 256, 147, 630, 34],
      ['zagotuj.', 297, 145, 120, 36],
      null,
      ['Do wrzącego wywaru włóż 1 kg surowego', 344, 147, 658, 33],
      ['schabu w jednym kawatku, przykryj i gotuj', 384, 146, 677, 37],
      ['dokładnie 5 minut.', 427, 153, 265, 38],
      null,
      ['Potem zgaś ogień i zostaw mięso w garnku, aż', 473, 160, 728, 36],
      ['wywar zupełnie wystygnie- najlepiej zostaw je', 517, 146, 726, 34],
      ['na kilka godzin albo do rana.', 561, 147, 433, 34],
      null,
      ['Wtedy zagotuj wywar jeszcze raz ze', 606, 147, 591, 32],
      ['schabem, nie wyjmując go, i gotuj pod', 645, 146, 619, 38],
      ['pokrywką przez następne 5 minut, licząc od', 692, 147, 736, 34],
      ['momentu wrzenia.', 735, 146, 274, 34],
      null,
      ['Znów zgaś ogień i zostaw mięso w wywarze', 779, 146, 684, 36],
      ['aż do zupełnego wystygnięcia wywaru.', 823, 145, 588, 33],
      ['Zimny schab przetóż do lodówki na noc.', 866, 148, 640, 34],
      null,
      ['Dah', 907, 157, 52, 18],
      null,
      ['Lat', 906, 561, 36, 18],
    ];
    const blocks: OcrBlock[] = [];
    let current: OcrBlock | null = null;
    for (const row of [...raw, null]) {
      if (row == null) {
        if (current) blocks.push(current);
        current = null;
        continue;
      }
      const [text, top, left, width, height] = row;
      const line = { text, frame: { top, left, width, height } };
      if (!current) current = { text: '', lines: [], frame: { ...line.frame } };
      current.lines!.push(line);
      current.text = current.lines!.map((l) => l.text).join('\n');
      const f = current.frame!;
      const bottom = Math.max(f.top + f.height!, top + height);
      f.height = bottom - f.top;
      f.width = Math.max(f.left! + f.width!, left + width) - Math.min(f.left!, left);
      f.left = Math.min(f.left!, left);
    }
    const text = ocrBlocksToText(dropClippedEdgeLines(blocks, { width: 922, height: 928 }));
    const lines = text.split('\n');
    expect(lines[lines.length - 1]).toBe('Zimny schab przetóż do lodówki na noc.');
    expect(text).not.toMatch(/Dah|Lat/);
    // Soft-wrapped lines reflow inside each block; the manual break before
    // "Zimny schab" (a full sentence ending well short of the margin) stays.
    expect(text).toBe(
      [
        'Do dużego garnka nalej 2 litry wody, wsyp 60 g soli, 12 ziaren pieprzu, 4 ziarna ziela angielskiego, 2 liście laurowe, 6 ząbków czOsnku, 2 łyżki majeranku, 1 tyżkę ziół, 1 tyżkę kminku, 70 gmajonezu oraz 60g musztardy. Wszystko razem wymieszaj i zagotuj.',
        'Do wrzącego wywaru włóż 1 kg surowego schabu w jednym kawatku, przykryj i gotuj dokładnie 5 minut.',
        'Potem zgaś ogień i zostaw mięso w garnku, aż wywar zupełnie wystygnie- najlepiej zostaw je na kilka godzin albo do rana.',
        'Wtedy zagotuj wywar jeszcze raz ze schabem, nie wyjmując go, i gotuj pod pokrywką przez następne 5 minut, licząc od momentu wrzenia.',
        'Znów zgaś ogień i zostaw mięso w wywarze aż do zupełnego wystygnięcia wywaru.',
        'Zimny schab przetóż do lodówki na noc.',
      ].join('\n')
    );
  });
});

// A multi-line block with a full box (no per-line frames): line geometry is
// estimated from the block box.
const blk = (
  lines: string[],
  left: number,
  width: number,
  top = 0,
  height = 30 * lines.length
): OcrBlock => ({
  text: lines.join('\n'),
  lines: lines.map((text) => ({ text })),
  frame: { top, left, width, height },
});

// A block whose lines carry their own frames: [text, top, left, width, height].
const framedBlk = (
  rows: [string, number, number, number, number][],
  frame: { top: number; left: number; width: number; height: number }
): OcrBlock => ({
  text: rows.map(([text]) => text).join('\n'),
  lines: rows.map(([text, top, left, width, height]) => ({ text, frame: { top, left, width, height } })),
  frame,
});

describe('reflowBlockLines', () => {
  const unchanged = (lines: string[], left: number, width: number, margin?: number) =>
    expect(reflowBlockLines(blk(lines, left, width), margin)).toEqual(lines);

  describe('joins soft-wrapped lines', () => {
    it('appends a parenthetical continuation, even far from the margin', () => {
      const b = blk(['• 15g kremu Lotus Biscoff', '(do posmarowaria)'], 39, 356);
      expect(reflowBlockLines(b)).toEqual(['• 15g kremu Lotus Biscoff (do posmarowaria)']);
      expect(reflowBlockLines(b, 2000)).toEqual(['• 15g kremu Lotus Biscoff (do posmarowaria)']);
    });

    it('rejoins a hyphenated word without the hyphen or a space', () => {
      expect(reflowBlockLines(blk(['1 kg młodych ziem-', 'niaków'], 0, 180))).toEqual([
        '1 kg młodych ziemniaków',
      ]);
    });

    it('keeps a hyphenated line that does not reach the margin', () => {
      unchanged(['1 kg młodych ziem-', 'niaków'], 0, 180, 1000);
    });

    it('keeps a hyphen before an uppercase continuation (a compound, not a wrap)', () => {
      unchanged(['Dodaj biało-', 'Czerwone'], 0, 180);
    });

    it('joins after an open-ended function word ("lub") only when the line is full', () => {
      const lines = ['do smażenia: 6 łyżek smalcu lub', 'masła klarowanego'];
      expect(reflowBlockLines(blk(lines, 29, 358), 423)).toEqual([
        'do smażenia: 6 łyżek smalcu lub masła klarowanego',
      ]);
      unchanged(lines, 29, 358, 2000);
    });

    it('joins after a trailing comma', () => {
      expect(
        reflowBlockLines(blk(['sól, pieprz, słodka papryka,', 'ostra papryka i oregano'], 0, 300))
      ).toEqual(['sól, pieprz, słodka papryka, ostra papryka i oregano']);
    });

    it('joins after an unbalanced opening parenthesis', () => {
      expect(reflowBlockLines(blk(['ser żółty (najlepiej gouda', 'albo edamski)'], 0, 300))).toEqual([
        'ser żółty (najlepiej gouda albo edamski)',
      ]);
    });

    it('joins after a spaced dash', () => {
      expect(reflowBlockLines(blk(['mąka pszenna –', 'tortowa typ 450'], 0, 160))).toEqual([
        'mąka pszenna – tortowa typ 450',
      ]);
    });

    it('joins after an English function word', () => {
      expect(reflowBlockLines(blk(['salt and', 'pepper'], 0, 90))).toEqual(['salt and pepper']);
    });

    it('keeps a labelled comma list together, even onto a line starting with a quantity', () => {
      // "do obtoczenia: 2 łyżki mąki, 2 jajka, 5 łyżek bułki tartej" is one item on the page.
      expect(
        reflowBlockLines(blk(['do obtoczenia: 2 łyżki mąki, 2 jajka,', '5 łyżek bułki tartej'], 29, 394))
      ).toEqual(['do obtoczenia: 2 łyżki mąki, 2 jajka, 5 łyżek bułki tartej']);
      // Without a label the amount starts a new item.
      unchanged(['sól, pieprz, słodka papryka,', '5 łyżek bułki tartej'], 29, 300);
    });

    it('joins a 4-line prose paragraph into one line', () => {
      const lines = [
        'Schab opłukać, osuszyć i oczyścić z błon oraz tłuszczu. Pokroić w poprzek',
        'na 4 kawałki. Położyć każdy między dwoma arkuszami folii i rozbić na cienki',
        'płat (mięso mocno się rozciągnie, prawie do wielkości dłoni). Najlepiej',
        'uderzać od środka ku brzegom, płaską stroną tłuczka z wyttoczoną kratką.',
      ];
      expect(reflowBlockLines(blk(lines, 487, 865))).toEqual([lines.join(' ')]);
    });

    it('joins 2-line prose whose first line is long (>= 45 chars)', () => {
      const lines = [
        'Schab pokrój na plastry ok. 1,5 cm i rozbij tłuczkiem na grubość ok. 3 mm. Roztrzep',
        'jajka.',
      ];
      expect(reflowBlockLines(blk(lines, 889, 736))).toEqual([lines.join(' ')]);
    });

    it('joins 2-line prose whose first line holds a sentence boundary', () => {
      expect(
        reflowBlockLines(blk(['Wymieszaj. Odstaw na godzinę', 'pod przykryciem w chłodzie.'], 0, 300))
      ).toEqual(['Wymieszaj. Odstaw na godzinę pod przykryciem w chłodzie.']);
    });

    it('reflows a text-only block (no lines[]) split on \\n', () => {
      const parts = [
        'Drożdże rozpuść w mleku z łyżką cukru. Dodaj mąkę, roztopione masło i resztę cukru,',
        'wyrób ciasto. Odstaw do wyrośnięcia na godzinę. Rozłóż na blasze, ułóż połówki śliwek i',
        'piecz w 180°C.',
      ];
      const b: OcrBlock = {
        text: parts.join('\n'),
        frame: { top: 920, left: 340, width: 1470, height: 272 },
      };
      expect(reflowBlockLines(b)).toEqual([parts.join(' ')]);
    });

    it('uses real line frames when every line has them', () => {
      const b = framedBlk(
        [
          ['Do wrzącego wywaru włóż 1 kg surowego', 344, 147, 658, 33],
          ['schabu w jednym kawatku, przykryj i gotuj', 384, 146, 677, 37],
          ['dokładnie 5 minut.', 427, 153, 265, 38],
        ],
        { top: 344, left: 146, width: 677, height: 121 }
      );
      expect(reflowBlockLines(b, 888)).toEqual([
        'Do wrzącego wywaru włóż 1 kg surowego schabu w jednym kawatku, przykryj i gotuj dokładnie 5 minut.',
      ]);
    });

    it('keeps a manual break after a short line, judged by real line frames', () => {
      const b = framedBlk(
        [
          ['Znów zgaś ogień i zostaw mięso w wywarze', 779, 146, 684, 36],
          ['aż do zupełnego wystygnięcia wywaru.', 823, 145, 588, 33],
          ['Zimny schab przetóż do lodówki na noc.', 866, 148, 640, 34],
        ],
        { top: 779, left: 145, width: 685, height: 121 }
      );
      expect(reflowBlockLines(b, 888)).toEqual([
        'Znów zgaś ogień i zostaw mięso w wywarze aż do zupełnego wystygnięcia wywaru.',
        'Zimny schab przetóż do lodówki na noc.',
      ]);
    });

    it('drops a whitespace-only line, then joins its neighbours', () => {
      const b: OcrBlock = {
        text: 'Dodaj sól i\n  \npieprz',
        lines: [{ text: 'Dodaj sól i' }, { text: '  ' }, { text: 'pieprz' }],
        frame: { top: 0, left: 0, width: 110, height: 90 },
      };
      expect(reflowBlockLines(b)).toEqual(['Dodaj sól i pieprz']);
    });
  });

  describe('not prose / no join', () => {
    it('joins a 2-line sentence broken in mid-sentence, keeps two short lines apart', () => {
      expect(
        reflowBlockLines(blk(['Wszystko dokładnie wymieszaj', 'i odstaw do lodówki na noc.'], 0, 300))
      ).toEqual(['Wszystko dokładnie wymieszaj i odstaw do lodówki na noc.']);
      unchanged(['Wszystko wymieszaj', 'i odstaw na noc.'], 0, 200);
    });

    it('keeps full lines without any sentence punctuation (not prose)', () => {
      unchanged(
        [
          'sól i pieprz do smaku według uznania',
          'olej roślinny do smażenia na patelni',
          'świeży koperek posiekany drobno',
        ],
        0,
        360
      );
    });

    it('keeps short one-sentence lines (mean length < 30)', () => {
      unchanged(['Wymieszaj mąkę.', 'Dodaj jajka.', 'Upiecz.'], 0, 150);
    });

    it('keeps a list-like block of quantity lines', () => {
      unchanged(
        [
          '2 łyżki oliwy z oliwek extra virgin najlepszej jakości.',
          '1 łyżeczka soli morskiej drobnej lub gruboziarnistej.',
        ],
        0,
        540
      );
    });

    // The first line ends on a plain word ("ewentualnie"), so no join rule
    // applies — this does not reach the 80-char cap (see the cap tests below).
    it('does not join after a plain word in a non-prose block', () => {
      unchanged(
        [
          '2 łyżki drobno posiekanej natki pietruszki albo koperku, ewentualnie',
          'szczypiorku lub kolendry do posypania gotowego dania',
        ],
        0,
        680
      );
    });

    it('joins an all-caps line onto an all-caps line', () => {
      expect(reflowBlockLines(blk(['PROSTO, ZDROWO I', 'OBŁĘDNIE PYSZNIE!'], 0, 170))).toEqual([
        'PROSTO, ZDROWO I OBŁĘDNIE PYSZNIE!',
      ]);
    });
  });

  describe('parenthetical join is gated', () => {
    // A header + parenthetical joined into "Składniki (na 4 porcje)" is no
    // longer a section header for parsePastedRecipe.
    it('keeps a header word above a parenthetical when nothing else ties them', () => {
      unchanged(['Składniki', '(na 4 porcje)'], 40, 300, 2000);
      unchanged(['Przygotowanie', '(ok. 30 min)'], 40, 300, 2000);
      unchanged(['SKŁADNIKI', '(na 4 porcje)'], 40, 300, 2000);
    });

    // ML Kit boxes hug the text, so a short header over a longer parenthetical
    // always looks "full" — reaching the margin must not be enough to join.
    it('keeps the header apart in a tight box, where the header line counts as full', () => {
      unchanged(['Składniki', '(na 4 porcje)'], 0, 130);
      unchanged(['Przygotowanie', '(ok. 30 min)'], 0, 130);
      unchanged(['Składniki na ciasto', '(tortownica o średnicy)'], 0, 230);
      const framed = framedBlk(
        [['Składniki', 0, 0, 90, 30], ['(na 4 porcje)', 34, 0, 130, 30]],
        { top: 0, left: 0, width: 130, height: 64 }
      );
      expect(reflowBlockLines(framed)).toEqual(['Składniki', '(na 4 porcje)']);
    });

    it('joins a parenthetical onto an open end that is not full', () => {
      const b = blk(['smalcu lub', '(ewentualnie masła)'], 0, 300);
      expect(reflowBlockLines(b, 2000)).toEqual(['smalcu lub (ewentualnie masła)']);
    });

    it('end to end: a two-column card whose header blocks are the rightmost in their column', () => {
      const r = parsePastedRecipe(
        normalizeOcrText(
          ocrBlocksToText([
            blk(['Składniki', '(na 4 porcje)'], 0, 130, 0),
            blk(['200 g mąki', '2 jajka'], 0, 100, 80),
            blk(['Przygotowanie', '(ok. 30 min)'], 300, 130, 0),
            blk(['Wymieszaj.'], 300, 100, 80, 30),
          ])
        )
      );
      expect(r.ingredients).toBe('(na 4 porcje)\n200 g mąki\n2 jajka');
      expect(r.instructions).toBe('(ok. 30 min)\nWymieszaj.');
    });

    it('end to end: header blocks with a parenthetical keep the section split', () => {
      const lb = (lines: string[], top: number, width: number) => blk(lines, 40, width, top);
      const r = parsePastedRecipe(
        normalizeOcrText(
          ocrBlocksToText([
            lb(['Naleśniki'], 0, 600),
            lb(['Składniki', '(na 4 porcje)'], 60, 200),
            lb(['200 g mąki', '2 jajka'], 140, 150),
            lb(['Przygotowanie', '(ok. 30 min)'], 220, 200),
            lb(['Wymieszaj wszystko.'], 300, 300),
          ])
        )
      );
      expect(r.title).toBe('Naleśniki');
      expect(r.ingredients).toContain('200 g mąki');
      expect(r.ingredients).toContain('2 jajka');
      expect(r.ingredients).not.toContain('Wymieszaj');
      expect(r.instructions).toContain('Wymieszaj wszystko.');
      expect(r.instructions).not.toContain('200 g mąki');
      // Exact pre-reflow output (verified against parsePastedRecipe).
      expect(r.ingredients).toBe('(na 4 porcje)\n200 g mąki\n2 jajka');
      expect(r.instructions).toBe('(ok. 30 min)\nWymieszaj wszystko.');
    });
  });

  describe('open end does not swallow a quantity start', () => {
    const first = 'sól, pieprz i trochę oregano,';
    it('a range', () => unchanged([first, '2-3 ząbki czosnku'], 0, 300));
    it('a mixed fraction', () => unchanged([first, '1 1/2 szklanki mleka'], 0, 300));
    it('an "ok." approximation', () => unchanged([first, 'ok. 200 g sera'], 0, 300));
    it('a fraction glyph', () => unchanged([first, '½ szklanki mleka'], 0, 300));
    it('a fraction-glyph range', () => unchanged([first, '½-1 szklanki mleka'], 0, 300));

    it('counts range / "ok." starts as list items, so the block is not prose', () => {
      unchanged(
        ['1 1/2 szklanki mleka pełnotłustego, najlepiej prosto od krowy. Sól', 'ok. 200 g sera żółtego.'],
        0,
        660
      );
    });
  });

  describe('80-char cap on item joins', () => {
    it('skips an otherwise-allowed open-end join that would exceed 80 chars', () => {
      unchanged(
        ['drobno posiekana natka pietruszki albo koperek, ewentualnie szczypiorek albo', 'kolendra do posypania gotowego dania'],
        0,
        760
      );
    });

    it('joins the same kind of open end when the result stays within 80 chars', () => {
      expect(
        reflowBlockLines(blk(['drobno posiekana natka pietruszki albo', 'koperek do posypania gotowego dania'], 0, 380))
      ).toEqual(['drobno posiekana natka pietruszki albo koperek do posypania gotowego dania']);
    });

    it('does not cap a prose join: a long hyphenated wrap still drops the hyphen', () => {
      expect(
        reflowBlockLines(
          blk(['Ugotuj w osolonej wodzie do miękkości wszystkie obrane i pokrojone w kostkę ziem-', 'niaki. Odcedź je i odstaw.'], 0, 830)
        )
      ).toEqual(['Ugotuj w osolonej wodzie do miękkości wszystkie obrane i pokrojone w kostkę ziemniaki. Odcedź je i odstaw.']);
    });
  });

  describe('prose detection', () => {
    it('ends a paragraph at a line that did not reach the margin', () => {
      const b = framedBlk(
        [
          ['Rozgrzej piekarnik do dwustu stopni i przygotuj blachę wyłożoną papierem', 0, 100, 700, 30],
          ['Odstaw ciasto na pół godziny.', 40, 100, 290, 30],
          ['Piecz przez czterdzieści minut aż wierzch ładnie się zarumieni.', 80, 100, 650, 30],
        ],
        { top: 0, left: 100, width: 700, height: 110 }
      );
      expect(reflowBlockLines(b)).toEqual([
        'Rozgrzej piekarnik do dwustu stopni i przygotuj blachę wyłożoną papierem Odstaw ciasto na pół godziny.',
        'Piecz przez czterdzieści minut aż wierzch ładnie się zarumieni.',
      ]);
    });
  });

  describe('never-join guards', () => {
    it('after a punctuation-only line, even in a full prose block', () =>
      // Line 1 is the longest (full) and >= 45 chars, line 2 ends a sentence:
      // without the guard this 2-line block is prose and would join.
      unchanged(['*'.repeat(50), 'Wymieszaj wszystko i odstaw.'], 0, 500));

    it('before a typographic bullet', () => unchanged(['Dodaj sól i', '• pieprz'], 0, 110));
    it('before a Markdown list marker', () => unchanged(['Dodaj sól i', '- pieprz'], 0, 110));
    it('before a numbered step', () =>
      unchanged(['Wymieszaj wszystkie składniki w dużej misce i', '2. Odstaw na godzinę.'], 0, 450));
    it('before "Krok N"', () =>
      unchanged(['Wymieszaj wszystkie składniki w dużej misce i', 'Krok 2'], 0, 450));
    it('after a line ending with ":"', () =>
      unchanged(
        ['Przygotuj wszystkie składniki wcześniej. Potrzebne będą:', 'mąka, jajka, mleko i szczypta soli do ciasta.'],
        0,
        560
      ));
    it('before a line ending with ":"', () =>
      unchanged(['Wymieszaj wszystko dokładnie. Odstaw na godzinę do lodówki.', 'Sposób podania na ciepło:'], 0, 590));
    it('before a short "Label:" line', () =>
      unchanged(['Gotuj na małym ogniu przez 20 minut,', 'Liczba porcji: 4'], 0, 360));
    it('before a line with no letter or digit', () =>
      unchanged(['Wymieszaj wszystko dokładnie. Odstaw na godzinę do lodówki,', '*********'], 0, 590));
    it('before an all-caps line under a mixed-case line', () =>
      unchanged(['Na koniec posyp natką pietruszki i', 'SMACZNEGO'], 0, 340));
    it('before a short heading under a finished sentence', () =>
      unchanged(['Wymieszaj wszystkie składniki dokładnie w misce. Odstaw do lodówki.', 'Sposób przygotowania'], 0, 680));
  });

  describe('must stay and degenerate input', () => {
    it('keeps a short ingredient list', () => unchanged(['sól i pieprz', 'olej roślinny', 'świeży koperek'], 72, 158));

    it('keeps two short ingredient lines in a wide column', () =>
      unchanged(['•pöt lyżeczki pronzku do pieczeria', 'erytrytol do smaku'], 39, 469, 732));

    it('keeps "Label: value" lines of a text-only block', () => {
      const b: OcrBlock = {
        text: 'Czas smnaženia: 25 min\nLiczba porcji: 4',
        frame: { top: 323, left: 140, width: 438, height: 105 },
      };
      expect(reflowBlockLines(b)).toEqual(['Czas smnaženia: 25 min', 'Liczba porcji: 4']);
    });

    it('returns lines unchanged without a full block box', () => {
      const b: OcrBlock = {
        text: 'Dodaj sól i\npieprz',
        lines: [{ text: 'Dodaj sól i' }, { text: 'pieprz' }],
        frame: { top: 0 },
      };
      expect(reflowBlockLines(b)).toEqual(['Dodaj sól i', 'pieprz']);
    });

    it('returns a single line as-is', () => {
      expect(reflowBlockLines(blk(['jedna linia'], 0, 100))).toEqual(['jedna linia']);
    });
  });
});

describe('ocrBlocksToText — in-block reflow', () => {
  const lb = (lines: string[], left: number, top: number, width: number) => blk(lines, left, width, top);

  it('reflows a soft-wrapped block on the column-aware path', () => {
    expect(ocrBlocksToText([lb(['Dodaj sól i', 'pieprz'], 40, 0, 120)])).toBe('Dodaj sól i pieprz');
  });

  it('uses the widest box in the same column as the margin', () => {
    expect(
      ocrBlocksToText([
        lb(['Dodaj sól i', 'pieprz'], 40, 0, 120),
        lb(['Wymieszaj wszystkie składniki w dużej misce.'], 40, 100, 600),
      ])
    ).toBe('Dodaj sól i\npieprz\nWymieszaj wszystkie składniki w dużej misce.');
  });

  it('takes the margin per column, not from a wider neighbouring column', () => {
    expect(
      ocrBlocksToText([
        lb(['do obtoczenia: 2 łyżki mąki, 2 jajka,', '5 łyżek butki tartej'], 29, 443, 394),
        lb(['do smażenia: 6 łyżek smalcu lub', 'masła klarowanego'], 29, 533, 358),
        lb(['Na patelni rozgrzać smalec i smażyć po 2 kotlety naraz, 2 minuty z każdej strony.'], 487, 443, 865),
      ])
    ).toBe(
      'do obtoczenia: 2 łyżki mąki, 2 jajka, 5 łyżek butki tartej\n' +
        'do smażenia: 6 łyżek smalcu lub masła klarowanego\n' +
        'Na patelni rozgrzać smalec i smażyć po 2 kotlety naraz, 2 minuty z każdej strony.'
    );
  });

  it('does not reflow on the top-only fallback path', () => {
    expect(
      ocrBlocksToText([lb(['Dodaj sól i', 'pieprz'], 40, 0, 120), { text: 'x', frame: { top: 100 } }])
    ).toBe('Dodaj sól i\npieprz\nx');
  });

  it('does not reflow an unframed block', () => {
    expect(
      ocrBlocksToText([{ text: 'a', lines: [{ text: 'Dodaj sól i' }, { text: 'pieprz' }] }])
    ).toBe('Dodaj sól i\npieprz');
  });
});

// ---------------------------------------------------------------------------
// Rules found on real phone screenshots (see ocrScreens.test.ts for the
// end-to-end fixtures these were reduced from).
// ---------------------------------------------------------------------------

// One block per line, each with its own line frame — how ML Kit returns most
// screenshot text. [text, top, left, right, height]
type Row = [string, number, number, number, number?];
const rowsToBlocks = (rows: Row[]): OcrBlock[] =>
  rows.map(([text, top, left, right, height = 40]) => {
    const frame = { top, left, width: right - left, height };
    return { text, lines: [{ text, frame }], frame };
  });
const flow = (rows: Row[]) => ocrBlocksToText(rowsToBlocks(rows));

describe('ocrBlocksToText — reflow across blocks', () => {
  it('rejoins a wrapped tail ML Kit returned as its own block', () => {
    expect(
      flow([
        ['200 g zimnego masła', 0, 100, 476],
        ['1 łyżeczka proszku do', 56, 102, 479],
        ['pieczenia', 112, 99, 262],
        ['1,5 kg kwaśnych', 168, 102, 384],
        ['jabłek', 224, 96, 207],
        ['2 łyżki cukru', 280, 100, 324],
      ])
    ).toBe('200 g zimnego masła\n1 łyżeczka proszku do pieczenia\n1,5 kg kwaśnych jabłek\n2 łyżki cukru');
  });

  it('does not take an item of its own for a wrapped tail', () => {
    // "sól" could not have fitted after "pudru" either — but it opens like an item.
    expect(
      flow([
        ['200 g zimnego masła i mleka', 0, 100, 479],
        ['100 g cukru pudru', 56, 100, 425],
        ['sól', 112, 100, 150],
        ['2 jajka', 168, 100, 220],
        ['wanilia', 224, 100, 230],
      ])
    ).toBe('200 g zimnego masła i mleka\n100 g cukru pudru\nsól\n2 jajka\nwanilia');
  });

  it('ends a stretch at a blank line: an open end does not reach across it', () => {
    expect(
      flow([
        ['Dodaj sól i', 0, 40, 160],
        ['pieprz', 120, 40, 110],
      ])
    ).toBe('Dodaj sól i\npieprz');
    expect(
      flow([
        ['Dodaj sól i', 0, 40, 160],
        ['pieprz', 56, 40, 110],
      ])
    ).toBe('Dodaj sól i pieprz');
  });

  it('reads an indented line as an item start: an emoji bullet or number was dropped there', () => {
    expect(
      flow([
        ['Przygotowanie:', 0, 40, 330],
        ['Banany rozgnieć widelcem, dodaj jajka i wymieszaj.', 56, 93, 1074],
        ['Dodaj płatki, cynamon i proszek do pieczenia. Odstaw', 112, 93, 1133],
        ['na 5 minut.', 168, 39, 249],
      ])
    ).toBe(
      'Przygotowanie:\nBanany rozgnieć widelcem, dodaj jajka i wymieszaj.\n' +
        'Dodaj płatki, cynamon i proszek do pieczenia. Odstaw na 5 minut.'
    );
  });

  it('gives keycap step numbers read as bare digits their dot back', () => {
    expect(
      flow([
        ['1 Banany rozgnieć widelcem, dodaj jajka i wymieszaj.', 0, 40, 1074],
        ['2 Dodaj płatki, cynamon i proszek do pieczenia. Odstaw', 56, 40, 1133],
        ['na 5 minut.', 112, 40, 249],
        ['3 Smaż na suchej patelni.', 168, 40, 560],
      ])
    ).toBe(
      '1. Banany rozgnieć widelcem, dodaj jajka i wymieszaj.\n' +
        '2. Dodaj płatki, cynamon i proszek do pieczenia. Odstaw na 5 minut.\n3. Smaż na suchej patelni.'
    );
    // Not a lone number, and not amounts.
    expect(flow([['3 Smaż na suchej patelni.', 0, 40, 560]])).toBe('3 Smaż na suchej patelni.');
    expect(
      flow([
        ['1 jajko', 0, 40, 180],
        ['2 marchewki', 56, 40, 260],
      ])
    ).toBe('1 jajko\n2 marchewki');
  });

  it('keeps a heading apart from the paragraph under it', () => {
    expect(
      flow([
        ['Sposób przygotowania', 0, 537, 1054, 54],
        ['Mąkę z proszkiem posiekaj z', 78, 535, 1040, 51],
        ['masłem, dodaj cukier puder i', 146, 560, 1055, 46],
        ['żółtka. Szybko zagnieć ciasto.', 209, 537, 1068, 40],
      ])
    ).toBe('Sposób przygotowania\nMąkę z proszkiem posiekaj z masłem, dodaj cukier puder i żółtka. Szybko zagnieć ciasto.');
  });

  it('joins a capitals title wrapped onto a second line, past the account name', () => {
    expect(
      flow([
        ['bakewithmia 3-INGREDIENT PEANUT BUTTER', 0, 39, 944, 33],
        ['COOKIES (makes 12)', 58, 39, 490, 38],
        ['Liczba polubień: 23 481 i jeszcze kilka słów', 300, 40, 1100, 40],
      ])
    ).toBe('bakewithmia 3-INGREDIENT PEANUT BUTTER COOKIES (makes 12)\nLiczba polubień: 23 481 i jeszcze kilka słów');
  });

  it('joins a centered heading set larger than the body text', () => {
    const title: OcrBlock = {
      text: 'Szarlotka na kruchym\ncieście',
      lines: [
        { text: 'Szarlotka na kruchym', frame: { top: 0, left: 115, width: 939, height: 78 } },
        { text: 'cieście', frame: { top: 107, left: 441, width: 282, height: 65 } },
      ],
      frame: { top: 0, left: 115, width: 939, height: 172 },
    };
    const body = rowsToBlocks([
      ['300 g mąki pszennej', 400, 100, 465],
      ['200 g zimnego masła', 456, 101, 476],
      ['100 g cukru pudru', 512, 106, 425],
      ['3 żółtka', 568, 99, 236],
    ]);
    expect(ocrBlocksToText([title, ...body])).toBe(
      'Szarlotka na kruchym cieście\n300 g mąki pszennej\n200 g zimnego masła\n100 g cukru pudru\n3 żółtka'
    );
  });

  it('lets a numbered step and a video chapter run on to the next one', () => {
    expect(
      flow([
        ['1. Preheat the oven to 350°F and line a baking sheet', 0, 39, 1042],
        ['with parchment paper.', 59, 37, 466],
        ['2. Mix everything in a bowl until smooth.', 113, 39, 900],
      ])
    ).toBe(
      '1. Preheat the oven to 350°F and line a baking sheet with parchment paper.\n' +
        '2. Mix everything in a bowl until smooth.'
    );
    expect(
      flow([
        ['1:30 Dodaj pokrojoną paprykę, duś 5 minut.', 0, 40, 900],
        ['2:10 Dodaj cukinię, pomidory, koncentrat i', 56, 40, 1000],
        ['przyprawy. Duś pod przykryciem 20 minut.', 112, 40, 960],
      ])
    ).toBe(
      '1:30 Dodaj pokrojoną paprykę, duś 5 minut.\n' +
        '2:10 Dodaj cukinię, pomidory, koncentrat i przyprawy. Duś pod przykryciem 20 minut.'
    );
  });

  it('keeps a labelled inline list on one line, however long', () => {
    expect(
      flow([
        ['Potrzebujesz: 2 tortille, 150g mielonej wołowiny, 1/2', 0, 46, 1094],
        ['cebuli, 4 łyżki salsy, garść startego sera, sałata', 59, 44, 1007],
        ['lodowa', 120, 45, 185],
      ])
    ).toBe('Potrzebujesz: 2 tortille, 150g mielonej wołowiny, 1/2 cebuli, 4 łyżki salsy, garść startego sera, sałata lodowa');
  });

  it('keeps app chrome under a caption on a line of its own', () => {
    expect(
      flow([
        ['Wsyp mąkę z proszkiem i cynamonem, wymieszaj krótko i piecz', 0, 40, 1040],
        ['45 minut w 175°C.', 56, 40, 380],
        ['Zobacz wszystkie komentarze: 56', 112, 40, 693],
      ])
    ).toBe(
      'Wsyp mąkę z proszkiem i cynamonem, wymieszaj krótko i piecz 45 minut w 175°C.\n' +
        'Zobacz wszystkie komentarze: 56'
    );
  });
});

describe('ocrBlocksToText — a phone screen is not a two-column page', () => {
  it('reads a right-aligned chat bubble in its place, not as a second column', () => {
    expect(
      flow([
        ['21:37', 34, 48, 117, 27],
        ['5G 82%', 34, 850, 1040, 27],
        ['Asia Kowalska', 135, 36, 329, 32],
        ['masz ten przepis na brownie?', 300, 463, 1019, 39],
        ['Jasne', 417, 61, 171, 32],
        ['Brownie z fasoli', 533, 63, 353, 32],
      ])
    ).toBe('Asia Kowalska\nmasz ten przepis na brownie?\nJasne\nBrownie z fasoli');
  });

  it('still reads real columns: text side by side', () => {
    expect(
      flow([
        ['500 g mąki', 0, 40, 300],
        ['Mąkę przesiej do miski.', 0, 500, 1000],
        ['2 jajka', 120, 40, 200],
        ['Dodaj jajka i wymieszaj.', 120, 500, 1010],
      ])
    ).toBe('500 g mąki\n2 jajka\nMąkę przesiej do miski.\nDodaj jajka i wymieszaj.');
  });
});

describe('normalizeOcrText — screen chrome and Polish misreads', () => {
  it('drops the status bar and chat timestamps', () => {
    expect(normalizeOcrText('21:37\n5G I 82%\nKopytka\n17:15\n17:20 vv\n1 kg ziemniaków')).toBe(
      'Kopytka\n1 kg ziemniaków'
    );
    // Without a sign of a chat a trailing time stays: it may be the recipe's own.
    expect(normalizeOcrText('Możesz dodać koperek 17:15')).toBe('Możesz dodać koperek 17:15');
    expect(normalizeOcrText('17:02 ✔\nMożesz dodać koperek 17:15')).toBe('Możesz dodać koperek');
    // A post's date keeps its time; amounts and percentages are not a battery.
    expect(normalizeOcrText('Wczoraj o 18:22')).toBe('Wczoraj o 18:22');
    expect(normalizeOcrText('śmietana 18%\n0:45 Podsmaż cebulę.')).toBe('śmietana 18%\n0:45 Podsmaż cebulę.');
  });

  it('puts a misread "ł" back in cooking words whose misread form is no word', () => {
    expect(normalizeOcrText('1 tyżka masta, pót szklanki mleka')).toBe('1 łyżka masła, pół szklanki mleka');
    expect(normalizeOcrText('2 lyżeczki, 300 g kietbasy, 2 jabtka, żóttko')).toBe(
      '2 łyżeczki, 300 g kiełbasy, 2 jabłka, żółtko'
    );
    expect(normalizeOcrText('Tyżkę oleju, dojrzate banany, orzechy wtoskie')).toBe(
      'Łyżkę oleju, dojrzałe banany, orzechy włoskie'
    );
    expect(normalizeOcrText('2 yżki cukru Iub miodu, 300 g kiebasy')).toBe('2 łyżki cukru lub miodu, 300 g kiełbasy');
    expect(normalizeOcrText('twaróg półttusty, na matym ogniu, catą noc')).toBe(
      'twaróg półtłusty, na małym ogniu, całą noc'
    );
  });

  it('puts "ś" and "ą" back where the word is unmistakable', () => {
    expect(normalizeOcrText('Smietanę zahartuj. Makę przesiej, 300 g maki pszennej')).toBe(
      'Śmietanę zahartuj. Mąkę przesiej, 300 g mąki pszennej'
    );
  });

  it('leaves real words alone', () => {
    const real = 'maki i makowiec, butki dla lalki, stoik, walki, maty, cala, wioska, lato, tata, polowa kuchnia';
    expect(normalizeOcrText(real)).toBe(real);
  });

  it('reads a zero between letters as the letter', () => {
    expect(normalizeOcrText('p0syp serem\nPRZYG0TOWANIE\n100 g, typ 450')).toBe('posyp serem\nPRZYGOTOWANIE\n100 g, typ 450');
  });

  it('restores a space swallowed before "i" where the word cannot end that way', () => {
    expect(normalizeOcrText('wlej śmietankęi wsyp ser, z boczkiemi cebulą, na oczkachi podsmaż')).toBe(
      'wlej śmietankę i wsyp ser, z boczkiem i cebulą, na oczkach i podsmaż'
    );
    expect(normalizeOcrText('do ziemi, palniki, dopraw i usmaż')).toBe('do ziemi, palniki, dopraw i usmaż');
  });

  it('spaces a list dash or an amount glued to what follows', () => {
    expect(normalizeOcrText('-1 marchewka\n- 2 cebule\n1tyżeczka sody\n1ząbek czosnku\n300g mąki')).toBe(
      '- 1 marchewka\n- 2 cebule\n1 łyżeczka sody\n1 ząbek czosnku\n300g mąki'
    );
    expect(normalizeOcrText('-\n100 ml śmietany')).toBe('- 100 ml śmietany');
    expect(normalizeOcrText('11/2 cups flour\nbake at 35o°F')).toBe('1 1/2 cups flour\nbake at 350°F');
  });

  it('strips icons and checkboxes read as letters in front of an item', () => {
    expect(normalizeOcrText('O1 kg dyni\nO 2 ząbki czosnku\nD pieprz 2 szczypty\nV½ łyżeczki kminu\n. 60 ml soku')).toBe(
      '1 kg dyni\n2 ząbki czosnku\npieprz 2 szczypty\n½ łyżeczki kminu\n60 ml soku'
    );
    const sentences = 'Dodaj jajka i wymieszaj.\nO smaku tej zupy decyduje przede wszystkim dobry bulion.';
    expect(normalizeOcrText(sentences)).toBe(sentences);
  });

  it('puts labels a bar separated, with the bar read as "I", one per line', () => {
    expect(normalizeOcrText('Czas przygotowania: 30 min I Czas pieczenia: 50 min I\nPorcje: 12')).toBe(
      'Czas przygotowania: 30 min\nCzas pieczenia: 50 min\nPorcje: 12'
    );
    expect(normalizeOcrText('4 Porcje: 4')).toBe('Porcje: 4');
  });

  it('is idempotent', () => {
    const once = normalizeOcrText('21:37\n-1 tyżka masta\nśmietankęi 1ząbek, p0syp\nO sól\nCzas: 3 min I Porcje: 2');
    expect(normalizeOcrText(once)).toBe(once);
  });
});

// Review findings: the cleanup must not cost recipe content anything.
describe('normalizeOcrText — leaves recipe content alone', () => {
  const same = (text: string) => expect(normalizeOcrText(text)).toBe(text);

  it('keeps gram and percentage lines: they are not a signal or battery indicator', () => {
    same('500 g mąki\n7g drożdży\n3g soli\n5g cukru');
    same('czekolada\n70%\nśmietanka 30 %');
    same('LTE\nWi-Fi hasło');
    expect(normalizeOcrText('5G I 82%\nLTE 67%\nKopytka')).toBe('Kopytka');
  });

  it('keeps a time that is the recipe\'s own', () => {
    same('Czas pieczenia\n1:30');
    same('Piecz do 18:30');
    same('Rozmrażaj do 12:00\nBake until 18:30\nGodzina 17:15');
    same('Kopytka\n20:00\nPodaj na ciepło');
  });

  it('drops message times only in a chat: a time with delivery ticks, or several bare ones', () => {
    expect(normalizeOcrText('Ciociu, jak robisz sos?\n17:02 ✔\nMożesz dodać koperek 17:15\n17:20')).toBe(
      'Ciociu, jak robisz sos?\nMożesz dodać koperek'
    );
    expect(normalizeOcrText('Kopytka\n17:15\n1 kg ziemniaków\n17:16\nDzięki!')).toBe('Kopytka\n1 kg ziemniaków\nDzięki!');
    // A clock on the very first line is the status bar.
    expect(normalizeOcrText('21:37\nKopytka')).toBe('Kopytka');
  });

  it('does not rewrite English or real Polish words into cooking ones', () => {
    same('Make the batter. MAKE sure to mix. Use Watkins vanilla.');
    same('kawalkada smaków, na matej, potowy');
    expect(normalizeOcrText('makę przesiej, kawatek masła, kawalki')).toBe('mąkę przesiej, kawałek masła, kawałki');
  });
});

describe('ocrBlocksToText — only the status bar is dropped before layout', () => {
  it('keeps a time or a small amount in the page body', () => {
    const lines = flow([
      ['Sernik', 200, 40, 300],
      ['Czas pieczenia', 400, 40, 330],
      ['1:30', 400, 500, 580],
      ['3g soli', 520, 40, 200],
    ]).split('\n');
    // (The value sits in a column of its own, so only presence is checked.)
    expect([...lines].sort()).toEqual(['1:30', '3g soli', 'Czas pieczenia', 'Sernik']);
  });

  it('drops the clock and the battery in the top row', () => {
    expect(
      flow([
        ['21:37', 34, 48, 117, 27],
        ['5G 82%', 34, 850, 1040, 27],
        ['Sernik', 200, 40, 300],
      ])
    ).toBe('Sernik');
  });

  it('leaves a short numbered list of names alone: keycap steps are sentences', () => {
    expect(
      flow([
        ['1 Cebula', 0, 40, 220],
        ['2 Marchewki', 56, 40, 290],
        ['3 Ziemniaki', 112, 40, 280],
      ])
    ).toBe('1 Cebula\n2 Marchewki\n3 Ziemniaki');
  });

  it('keeps app chrome apart even under a full line of prose', () => {
    expect(
      flow([
        ['Wsyp mąkę z proszkiem i cynamonem, wymieszaj krótko. Piecz 45 minut.', 0, 40, 1040],
        ['Zobacz wszystkie komentarze: 56', 56, 40, 693],
      ])
    ).toBe('Wsyp mąkę z proszkiem i cynamonem, wymieszaj krótko. Piecz 45 minut.\nZobacz wszystkie komentarze: 56');
  });
});

describe('normalizeOcrText — what makes a text a chat', () => {
  it('keeps the times of a baking schedule: hours apart, no delivery ticks', () => {
    const schedule = 'Chleb na zakwasie\n08:00\nDokarm zakwas.\n20:00\nWymieszaj mąkę i wodę.';
    expect(normalizeOcrText(schedule)).toBe(schedule);
  });

  it('counts delivery ticks at the end of a message too', () => {
    expect(normalizeOcrText('Ania\nMasz przepis? 17:02 ✓✓\nTak! 200 g mąki i 2 jajka 17:05\nPiecz 30 min w 180°C 17:06')).toBe(
      'Ania\nMasz przepis?\nTak! 200 g mąki i 2 jajka\nPiecz 30 min w 180°C'
    );
  });
});

// ---------------------------------------------------------------------------
// Gaps found by mutation testing (docs/mutation-testing.md).
// ---------------------------------------------------------------------------
describe('ocrBlocksToText — ordering details', () => {
  it('keeps input order for blocks with the same top (stable y-sort)', () => {
    const blocks: OcrBlock[] = [
      { text: 'a', frame: { top: 10 } },
      { text: 'b', frame: { top: 10 } },
      { text: 'c', frame: { top: 10 } },
    ];
    expect(ocrBlocksToText(blocks)).toBe('a\nb\nc');
  });

  it('sorts a block whose frame has no numeric top after the framed ones', () => {
    const blocks = [
      { text: 'bez top', frame: {} },
      { text: 'z top', frame: { top: 5 } },
    ] as unknown as OcrBlock[];
    expect(ocrBlocksToText(blocks)).toBe('z top\nbez top');
  });
});

describe('ocrBlocksToText — status bar detection', () => {
  it('finds the top row wherever the screenshot starts, battery a little lower', () => {
    expect(
      flow([
        ['21:37', 100, 48, 117, 27],
        ['5G 82%', 104, 850, 1040, 27],
        ['Sernik', 300, 40, 300],
      ])
    ).toBe('Sernik');
  });

  it('keeps a top block that holds a clock and other text', () => {
    const frame = { top: 0, left: 40, width: 300, height: 27 };
    const blocks: OcrBlock[] = [
      { text: '21:37\nSernik', lines: [{ text: '21:37', frame }, { text: 'Sernik', frame: { ...frame, top: 40 } }], frame },
    ];
    expect(ocrBlocksToText(blocks)).toContain('Sernik');
  });
});

describe('dropClippedEdgeLines — details', () => {
  const size = { width: 700, height: 300 };
  // Three ordinary lines away from the edges: median line height 20.
  const body = () => [lineBlock('a', 100, 20), lineBlock('b', 140, 20), lineBlock('c', 180, 20)];
  const texts = (blocks: OcrBlock[]) => blocks.map((b) => b.text);

  it('returns an untouched block as the same object', () => {
    const blocks = body();
    const out = dropClippedEdgeLines(blocks, size);
    out.forEach((b, i) => expect(b).toBe(blocks[i]));
  });

  it('drops a block whose only line is clipped', () => {
    expect(texts(dropClippedEdgeLines([lineBlock('Dah', 0, 10), ...body()], size))).toEqual(['a', 'b', 'c']);
  });

  it('rebuilds a partly clipped block from its kept lines, frame included', () => {
    const lines = [
      { text: 'ucięta', frame: { top: 0, left: 40, width: 300, height: 10 } },
      { text: 'B', frame: { top: 30, left: 50, width: 100, height: 20 } },
      { text: 'C', frame: { top: 55, left: 40, width: 200, height: 20 } },
    ];
    const block: OcrBlock = { text: 'x', lines, frame: { top: 0, left: 0, width: 500, height: 80 } };
    expect(dropClippedEdgeLines([block, ...body()], size)[0]).toEqual({
      text: 'B\nC',
      lines: lines.slice(1),
      frame: { top: 30, left: 40, width: 200, height: 45 },
    });
  });

  it('keeps the block frame when a kept line has no full frame', () => {
    const blockFrame = { top: 0, left: 0, width: 500, height: 80 };
    const block: OcrBlock = {
      text: 'x',
      lines: [
        { text: 'ucięta', frame: { top: 0, left: 40, width: 300, height: 10 } },
        { text: 'bez ramki' },
        { text: 'B', frame: { top: 30, left: 50, width: 100, height: 20 } },
      ],
      frame: blockFrame,
    };
    const [out] = dropClippedEdgeLines([block, ...body()], size);
    expect(out.text).toBe('bez ramki\nB');
    expect(out.frame).toBe(blockFrame);
  });

  it('reads the median of the sorted heights', () => {
    // Heights 21, 10, 32, 30, 28 → median 28, so the 21-high edge line (over
    // 70% of 28) is kept; an unsorted middle (32) would clip it.
    const blocks = [
      lineBlock('krawędź', 0, 21),
      lineBlock('d', 100, 10),
      lineBlock('e', 140, 32),
      lineBlock('f', 180, 30),
      lineBlock('g', 220, 28),
    ];
    expect(texts(dropClippedEdgeLines(blocks, size))).toContain('krawędź');
  });

  it('leaves zero heights out of the median', () => {
    const zero = (text: string, top: number) => lineBlock(text, top, 0);
    const blocks = [zero('z1', 60), zero('z2', 70), zero('z3', 80), zero('z4', 90), lineBlock('Dah', 0, 10), ...body()];
    expect(texts(dropClippedEdgeLines(blocks, size))).not.toContain('Dah');
  });

  it('judges with exactly three line heights, counting a block without lines', () => {
    const noLines: OcrBlock = { text: 'c', frame: { top: 180, left: 40, width: 600, height: 20 }, lines: [] };
    const blocks = [lineBlock('Dah', 0, 10), lineBlock('a', 100, 20), noLines];
    expect(texts(dropClippedEdgeLines(blocks, size))).toEqual(['a', 'c']);
  });

  it('never treats a line without a frame as clipped', () => {
    const blocks: OcrBlock[] = [{ text: 'bez ramki', lines: [{ text: 'bez ramki' }] }, ...body()];
    expect(texts(dropClippedEdgeLines(blocks, size))).toContain('bez ramki');
  });

  it.each([
    ['top edge at exactly half a median line', 10, 13, false],
    ['just inside the top margin', 11, 13, true],
    ['exactly 70% of the median high', 10, 14, true],
    ['bottom edge at exactly half a median line', 277, 13, false],
    ['bottom just inside the margin', 276, 13, true],
  ])('a squat line with its %s: kept = %p', (_label, top, height, kept) => {
    const out = texts(dropClippedEdgeLines([lineBlock('edge', top as number, height as number), ...body()], size));
    expect(out.includes('edge')).toBe(kept);
  });
});

describe('dropClippedEdgeLines — partial line frames', () => {
  it.each([
    ['left', { top: 60, width: 100, height: 20 }],
    ['width', { top: 60, left: 50, height: 20 }],
    ['height', { top: 60, left: 50, width: 100 }],
  ])('keeps the block frame when a kept line frame lacks %s', (_missing, frame) => {
    const blockFrame = { top: 0, left: 0, width: 500, height: 80 };
    const block: OcrBlock = {
      text: 'x',
      lines: [
        { text: 'ucięta', frame: { top: 0, left: 40, width: 300, height: 10 } },
        { text: 'B', frame: frame as OcrBlock['frame'] },
      ],
      frame: blockFrame,
    };
    const body = [lineBlock('a', 100, 20), lineBlock('b', 140, 20), lineBlock('c', 180, 20)];
    const [out] = dropClippedEdgeLines([block, ...body], { width: 700, height: 300 });
    expect(out.text).toBe('B');
    expect(out.frame).toBe(blockFrame);
  });
});
