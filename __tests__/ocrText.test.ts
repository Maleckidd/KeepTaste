// TDD red phase for the "From photo (OCR)" import feature (SPEC.md §5.15, mode
// T3 "Text assembly"). The module @/utils/ocrText does not exist yet; these
// tests should fail because of the missing implementation, not setup errors.
import {
  dropClippedEdgeLines,
  ocrBlocksToText,
  normalizeOcrText,
  OcrBlock,
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
    expect(normalizeOcrText('Drožd že, lyžką, Žurek')).toBe('Drożd że, lyżką, Żurek');
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
      'pót łyżeczki\nserek 150 g\n-88 g białka'
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
        '250 g twarogu półttustego\n2 yżki cukru'
    );
    expect(r.instructions.startsWith('1. Mąkę wymieszaj')).toBe(true);
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
    expect(r.instructions.startsWith('Drożdże rozpuść w mleku z lyżką cukru. Dodaj mąkę')).toBe(true);
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
    expect(r.ingredients).toContain('do smażenia: 6 łyżek smalcu lub');
    expect(r.instructions.startsWith('Schab opłukać, osuszyć i oczyścić')).toBe(true);
    expect(r.instructions).not.toContain('600 g schabu');
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
      'butka tarta 200 gramów',
      'mąka 100 gramów',
    ]);
    expect(r.ingredients).toContain('olej roślinny 2 łyżki\nświeży koperek 2 łyżki');
    expect(r.ingredients).not.toContain('PRZEPISY');
    expect(r.ingredients).not.toContain('EMAIL');
    expect(r.instructions.split('\n')[0]).toBe('Krok 1');
    expect(r.instructions).toContain('Schab pokrój na plastry ok. 1,5 cm');
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
        'pót lyżeczki pronzku do pieczeria\nerytrytol do smaku\n15g kremu Lotus Biscoff\n(do posmarowaria)'
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
  });
});
