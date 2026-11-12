// End-to-end checks of the "From photo (OCR)" import on real recognition output
// (SPEC.md §5.15 T3): ocrBlocksToText → normalizeOcrText → parsePastedRecipe.
//
// Each fixture in __tests__/fixtures/ocr is what ML Kit Text Recognition v2
// returned on an Android emulator for one phone screenshot: the blocks, their
// lines with frames, and the image size. The app screenshots (Instagram,
// Facebook, Messenger, WhatsApp, notes, YouTube, TikTok, recipe cards) are
// faithful mock-ups of those screens rendered at phone resolution; the `web-*`
// ones are real recipe pages, whose method and prose were then reworded in
// place (same blocks, lines and frames; a misread such as "mastem" kept) so
// the repository carries no third-party recipe text. Otherwise the misreads
// below ("gmakaronu", "doprawi usmaż") are ML Kit's own — the expected values
// pin what the pipeline makes of them, so a change that degrades a real case
// fails here.
import * as fs from 'fs';
import * as path from 'path';
import { dropClippedEdgeLines, normalizeOcrText, ocrBlocksToText } from '@/utils/ocrText';
import { parsePastedRecipe } from '@/utils/recipeImport';

type Expected = {
  /** What the screenshot shows. */
  about: string;
  /** `null` — no title is found; omitted — the title is not pinned. */
  title?: string | null;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  ingredients: string[];
  /** How each instruction line begins, one entry per line. */
  steps: string[];
  notes?: string[];
};

const EXPECTED: Record<string, Expected> = {
  'cookbook-photo': {
    about: 'photographed cookbook page: tilted, two ingredient columns, hyphenated justified text',
    title: 'Krupnik na żeberkach',
    servings: 6,
    ingredients: [
      '500 g żeberek wieprzowych',
      '100 g kaszy jęczmiennej',
      '2 marchewki',
      '1 pietruszka',
      'kawałek selera',
      '3 ziemniaki',
      '2 liście laurowe',
      '3 ziarna ziela angielskiego',
      'natka pietruszki',
      'sól i pieprz',
    ],
    steps: [
      'Żeberka opłucz, zalej 2 litrami zimnej wody, dod',
      'Warzywa obierz i pokrój w kostkę. Dodaj do wywar',
    ],
  },
  'crop-fb-post': {
    about: 'the Facebook post cropped to the recipe',
    title: null,
    ingredients: [
      '- 1,5 l bulionu warzywnego',
      '- 4 ogórki kiszone + pół szklanki soku z ogórków',
      '- 4 ziemniaki',
      '- 1 marchewka',
      '- 100 ml śmietany 18%',
      '- 1 łyżka masła',
      '- koperek, sól, pieprz',
    ],
    steps: [
      'Ziemniaki i marchewkę pokroić w kostkę, wrzucić',
      'Smacznego kochane!',
    ],
  },
  'crop-ig-light': {
    about: 'the Instagram caption cropped to the text',
    title: 'Najprostsze placki bananowe bez cukru!',
    ingredients: [
      '2 dojrzałe banany',
      '2 jajka',
      '60 g płatków owsianych',
      'Szczypta cynamonu',
      '1 łyżeczka proszku do pieczenia',
    ],
    steps: [
      '1. Banany rozgnieć widelcem, dodaj jajka i wymie',
      '2. Dodaj płatki, cynamon i proszek do pieczenia.',
      '3. Smaż na suchej patelni po 2 minuty z każdej s',
      'Smacznego!',
    ],
  },
  'crop-messenger': {
    about: 'the Messenger chat cropped to the recipe bubbles',
    title: 'Kopytka',
    ingredients: [
      '1 kg ziemniaków',
      '300 g mąki pszennej',
      '1 jajko',
      'łyżeczka soli',
    ],
    steps: [
      'Ziemniaki ugotuj dzień wcześniej i przecisnj prz',
      'Nie dawaj za dużo mąki bo będą twarde',
      'Dzięki!!',
    ],
  },
  'fb-comment': {
    about: 'Facebook comment bubble with a recipe written as one sentence',
    ingredients: [],
    steps: [
      'a moja wersja jest taka: 250 g twarogu półtłuste',
      'Marek Nowak',
      'Zrobiłem wczoraj, wyszły super! Dałem tylko mnie',
    ],
  },
  'fb-post': {
    about: 'Facebook group post: "-" list, "Wykonanie:", reaction bar',
    title: null,
    ingredients: [
      '- 1,5 l bulionu warzywnego',
      '- 4 ogórki kiszone + pół szklanki soku z ogórków',
      '- 4 ziemniaki',
      '- 1 marchewka',
      '- 100 ml śmietany 18%',
      '- 1 łyżka masła',
      '- koperek, sól, pieprz',
    ],
    steps: [
      'Ziemniaki i marchewkę pokroić w kostkę, wrzucić',
      'Smacznego kochane!',
    ],
  },
  'fb-post-dark': {
    about: 'Facebook page post, dark mode: caps title, three labelled times, counters',
    title: 'BIGOS STAROPOLSKI przepis po mojej mamie',
    prepTime: 30,
    cookTime: 180,
    servings: 8,
    ingredients: [
      '1 kg kapusty kiszonej',
      '500 g białej kapusty',
      '400 g łopatki wieprzowej',
      '300 g kiełbasy wiejskiej',
      '100 g wędzonego boczku',
      'garść suszonych grzybów',
      '2 cebule, 3 liście laurowe, 5 ziaren ziela angielskiego',
      '2 łyżki koncentratu pomidorowego',
    ],
    steps: [
      'Grzyby namocz na noc. Mięso pokrój w kostkę i ob',
    ],
  },
  'ig-infographic': {
    about: 'Instagram carousel slide: decorative fonts, caps headers',
    title: 'OWSIANKA NOCNA',
    ingredients: [
      '50 g płatków owsianych',
      '150 ml mleka migdałowego',
      '1 łyżka nasion chia',
      '1 łyżka masła orzechowego',
      '½ banana',
      '1 łyżeczka miodu',
    ],
    steps: [
      'Wszystkie składniki wymieszaj w słoiku. Wstaw do',
      'zdrowo.i. smacznie Śniadanie, które robi się sam',
    ],
  },
  'ig-post-bigfont': {
    about: 'Instagram caption at a large font size: "•" bullets, wrapped items, two groups',
    title: 'Ciasto marchewkowe z kremem',
    ingredients: [
      '# Ciasto',
      '300 g startej marchewki',
      '250 g mąki pszennej tortowej typ 450',
      '3 jajka w temperaturze pokojowej',
      '180 ml oleju rzepakowego',
      '150 g cukru trzcinowego',
      '2 łyżeczki cynamonu i 1 łyżeczka proszku do pieczenia',
      '# Krem',
      '250 g serka mascarpone',
      '2 łyżki cukru pudru',
    ],
    steps: [
      'Jajka ubij z cukrem, dodaj olej i marchewkę. Wsy',
    ],
  },
  'ig-post-dark': {
    about: 'Instagram caption, dark mode: caps title, "Na 2 porcje potrzebujesz:", emoji bullets',
    title: 'KREMOWY MAKARON Z KURCZAKIEM',
    servings: 2,
    ingredients: [
      '300 g piersi z kurczaka',
      '200 gmakaronu penne',
      '2 ząbki czosnku',
      '200 ml śmietanki 18%',
      '50 g parmezanu',
      'garść świeżego szpinaku',
      'i sól, pieprz, słodka papryka',
    ],
    steps: [
      'Makaron ugotuj al dente. Kurczaka pokrój w kostk',
    ],
  },
  'ig-post-en': {
    about: 'Instagram caption in English: caps title wrapped over two lines, numbered method',
    title: '3-NGREDIENT PEANUT BUTTER COOKIES',
    servings: 12,
    ingredients: [
      '1 cup peanut butter',
      '1/2 cup sugar',
      '.1 large egg',
    ],
    steps: [
      '1. Preheat the oven to 350°F and line a baking s',
      '2. Mix everything in a bowl until smooth, then r',
      '3. Flatten each ball with a fork and bake for 10',
    ],
  },
  'ig-post-light': {
    about: 'Instagram caption: emoji bullets and keycap step numbers',
    title: 'Najprostsze placki bananowe bez cukru!',
    ingredients: [
      '2 dojrzałe banany',
      '2 jajka',
      '60 g płatków owsianych',
      'szczypta cynamonu',
      '1 łyżeczka proszku do pieczenia',
    ],
    steps: [
      'Banany rozgnieć widelcem, dodaj jajka i wymiesza',
      'Dodaj płatki, cynamon i proszek do pieczenia. Od',
      '3 Smaż na suchej patelni po 2 minuty z każdej st',
      'Smacznego!',
    ],
  },
  'keep-list': {
    about: 'Google Keep note: checklist of ingredients, then a paragraph',
    title: 'Pesto z rukoli',
    ingredients: [
      '100 g rukoli',
      '50 g orzechów nerkowca',
      '40 g parmezanu',
      '1 ząbek czosnku',
      '80 ml oliwy z oliwek',
      'sokz połowy cytryny',
      'sól',
    ],
    steps: [
      'Orzechy podprażyć na suchej patelni. Wszystko zb',
    ],
  },
  'messenger-chat': {
    about: 'Messenger chat: the recipe over three bubbles, no headers',
    title: 'Kopytka',
    ingredients: [
      '1 kg ziemniaków',
      '300 g mąki pszennej',
      '1 jajko',
      'łyżeczka soli',
    ],
    steps: [
      'Ziemniaki ugotuj dzień wcześniej i przeciśnij pr',
      'Nie dawaj za dużo maki bo będą twarde',
      'Dzięki!',
    ],
    notes: ['Mamo, podasz przepis na te kopytka?'],
  },
  'messenger-dark': {
    about: 'Messenger chat, dark mode: one message with an inline "Składniki:" list',
    title: 'Brownie z fasoli',
    ingredients: [
      'puszka czerwonej fasoli',
      '3 jajka',
      '3 łyżki kakao',
      '4 łyżki miodu',
      '2 łyżki oleju kokosowego',
      'łyżeczka proszku do pieczernia',
      '50 g gorzkiej czekolady',
    ],
    steps: [
      'Fasolę odcedź i dokładnie opłucz. Zblenduj wszys',
      'Nie przejmuj się że ciasto jest rzadkie, tak ma',
      'super dzięki!!',
    ],
  },
  'notes-app': {
    about: 'Notes app: title, two context lines, ingredients without a header, method',
    title: 'Chleb bananowy cioci Eli',
    ingredients: [
      '3 bardzo dojrzałe banany',
      '2 jajka',
      '100 g masła roztopionego',
      '120 g cukru trzcinowego',
      '250 g mąki pszennej',
      '1 łyżeczka sody',
      'Szczypta soli',
      'garść orzechów włoskich',
    ],
    steps: [
      'Banany rozgnieść, wymieszać z jajkami, masłem i',
      'Nie otwierać piekarnika przez pierwsze 40 minut!',
    ],
    notes: ['Piekarnik 175 stopni, 50-60 minut', 'Keksówka 25 cm'],
  },
  'notes-en': {
    about: 'Notes app in English, serif font: labelled times, numbered directions, notes',
    title: 'Grandma\'s banana bread',
    prepTime: 15,
    cookTime: 55,
    servings: 8,
    ingredients: [
      '3 ripe bananas, mashed',
      '1/3 cup melted butter',
      '3/4 cup sugar',
      '1 egg, beaten',
      '1 tsp vanilla extract',
      '1 tsp baking soda',
      'pinch of salt',
      '1 1/2 cups all-purpose flour',
    ],
    steps: [
      '1. Preheat the oven to 350°F and butter a loaf p',
      '2. Stir the melted butter into the mashed banana',
      '3. Sprinklde the baking soda and salt over the m',
      '4. Bake for 55 minutes. Cool completely before s',
    ],
    notes: ['Freezes well for up to 3 months.'],
  },
  'pin-card': {
    about: 'recipe pin: script title, "POTRZEBUJESZ" / "JAK ZROBIĆ"',
    title: 'Hummus klasyczny',
    ingredients: [
      '1 puszka ciecierzycy (400 g)',
      '3 łyżki pasty tahini',
      'sok z 1 cytryny',
      '1 ząbek Czosnku',
      '3 łyżki oliwy z oliwek extra vergine',
      '½ łyżeczki kminu rzymskiego',
      '3-4 łyżki zimnej wody',
      'sól do smaku',
    ],
    steps: [
      'Ciecierzycę odcedź. Wszystkie składniki umieść w',
    ],
  },
  'recipe-card-2col': {
    about: 'designed recipe card: centered two-line title, a row of labels, two columns',
    title: 'Szarlotka na kruchym cieście',
    prepTime: 30,
    cookTime: 50,
    servings: 12,
    ingredients: [
      '300g mąki pszennej',
      '200 g zimnego masła',
      '100 g cukru pudru',
      '3 żółtka',
      '1 łyżeczka proszku do pieczenia',
      '1,5 kg kwaśnych jabłek',
      '2 łyżki cukru',
      '1 łyżeczka cynamonu',
      'bułka tarta do posypania',
    ],
    steps: [
      'Mąkę z proszkiem posiekaj 2 masłem, dodaj cukier',
      'Jabłka obierz, zetrzyj na grubych oczkach i podd',
      'Połową ciasta wylep formę, posyp bułką tartą, wy',
    ],
    notes: ['www.domowewypieki.example zapisz i udostępnij'],
  },
  'site-mock': {
    about: 'recipe site on a phone: breadcrumb, rating, buttons, checkbox list, an ad',
    title: 'Zupa krem z dyni z imbirem',
    servings: 4,
    ingredients: [
      '1 kg dyni hokkaido',
      '1 duża cebula',
      '2 ząbki czosnku',
      '3 cm świeżego imbiru',
      '750 ml bulionu warzywnego',
      '100 ml mleczka kokosowego',
      '2 łyżki oliwy',
      'sól, pieprz, płatki chili',
    ],
    steps: [
      'Krok 1',
      'Dynię umyj, usuń pestki i pokrój w kostkę.',
      'Cebulę i czosnek posiekaj.',
      'Krok 2',
      'Na oliwie zeszklij cebulę z czosnkiem i startym',
    ],
  },
  'tiktok-desc': {
    about: 'TikTok description: the whole ingredient list on one wrapped line',
    title: 'Tortilla z patelni w 10 minut',
    ingredients: [
      '2 tortille',
      '150g mielonej wołowiny',
      '1/2 cebuli',
      '4 łyżki salsy',
      'garść startego sera',
      'sałata lodowa',
    ],
    steps: [
      'Mięso usmaż z cebulą i przyprawami. Rozsmaruj na',
    ],
  },
  'web-kwestiasmaku': {
    about: 'kwestiasmaku.com on a phone, scrolled to the ingredients (a real page, method reworded)',
    title: null,
    servings: 4,
    ingredients: [
      '600 g schabu bez kości',
      'sól i pieprz',
      'do namoczenia: mleko',
      'do obtoczenia: 2 łyżki mąki, 2 jajka, 5 łyżek bułki tartej',
      'do smażenia: 6 łyżek smalcu lub masła klarowanego',
    ],
    steps: [
      'Schab opłukać, osuszyć i oczyścić z błon oraz tł',
      'Kotlety włożyć do miski, zalać mlekiem, dodać só',
      'Mięso wyjąć z mleka i dokładnie osuszyć je papie',
      'Na patelni rozgrzać smalec (warstwa ok. 1/2 cm).',
    ],
  },
  'web-mojewypieki': {
    about: 'mojewypieki.com on a phone, scrolled to the ingredients (a real page, prose reworded)',
    title: null,
    ingredients: [
      '# Spód i boki sernika',
      '250 g ciastek pełnoziarnistych typu digestive',
      '80 g masła, roztopionego',
    ],
    steps: [
      'Herbatniki pokruszyć w malakserze, dodać masło i',
    ],
  },
  'whatsapp-chat': {
    about: 'WhatsApp chat: bold title, ingredients and method in one bubble',
    title: 'Sos czosnkowy',
    ingredients: [
      '200 g jogurtu greckiego',
      '2 łyżki majonezu',
      '3 ząbki czosnku',
      '1 łyżeczka soku z cytryny',
      'sól, pieprz, szczypta cukru',
    ],
    steps: [
      'Czosnek przeciśnij przez praskę, wymieszaj z res',
      'Możesz dodać koperek',
      'Super, dziękuję &',
    ],
    notes: ['Ciociu, jak robisz ten sos czosnkowy?'],
  },
  'whatsapp-forwarded': {
    about: 'WhatsApp group chat: a forwarded recipe with "Ciasto:" / "Farsz:" groups',
    title: 'Pierogi ruskie',
    ingredients: [
      '# Ciasto',
      '- 500 g mąki',
      '- 250 ml gorącej wody',
      '- 2 łyżki oleju',
      '- Szczypta soli',
      '# Farsz',
      '- 600 g ziemniaków',
      '- 300 g twarogu',
      '- 2 cebule',
    ],
    steps: [
      'Ziemniaki ugotuj i przeciśnij przez praskę razem',
      'Dziękuję babciu',
    ],
  },
  'yt-description': {
    about: 'YouTube description: "-" list and steps opening with video timestamps',
    title: 'Leczo z cukinią i kiełbasą - Szybki obiad z jednego garnka',
    servings: 4,
    ingredients: [
      '- 2 średnie cukinie',
      '- 3 papryki (czerwona, żółta, zielona)',
      '- 300 g kiełbasy śląskiej',
      '- 2 cebule',
      '- 1 puszka pomidorów krojonych',
      '- 2 łyżki koncentratu pomidorowego',
      '- 1 łyżeczka słodkiej i ½ łyżeczki ostrej papryki',
    ],
    steps: [
      '0:45 Kiełbasę i cebulę podsmaż na oleju.',
      '1:30 Dodaj pokrojoną paprykę, duś 5 minut.',
      '2:10 Dodaj cukinię, pomidory, koncentrat i przyp',
    ],
  },
};

const read = (name: string) => {
  const file = path.join(__dirname, 'fixtures', 'ocr', `${name}.json`);
  const { size, blocks } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsePastedRecipe(
    normalizeOcrText(ocrBlocksToText(dropClippedEdgeLines(blocks, size ?? undefined)))
  );
};

describe('OCR import of real screenshots', () => {
  it('has an expectation for every fixture', () => {
    const fixtures = fs
      .readdirSync(path.join(__dirname, 'fixtures', 'ocr'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(fixtures).toEqual(Object.keys(EXPECTED).sort());
  });

  describe.each(Object.entries(EXPECTED))('%s', (name, want) => {
    const got = read(name);

    it(`reads the title and metadata — ${want.about}`, () => {
      if (want.title !== undefined) expect(got.title ?? null).toBe(want.title);
      expect(got.prepTime).toBe(want.prepTime ?? null);
      expect(got.cookTime).toBe(want.cookTime ?? null);
      expect(got.servings).toBe(want.servings ?? null);
    });

    it('lists the ingredients one per line', () => {
      expect(got.ingredients.split('\n').filter(Boolean)).toEqual(want.ingredients);
    });

    it('keeps each step or paragraph on one line', () => {
      const lines = got.instructions.split('\n').filter(Boolean);
      expect(lines.map((l, i) => l.slice(0, (want.steps[i] ?? '').length))).toEqual(want.steps);
      expect(lines).toHaveLength(want.steps.length);
    });

    it('routes the rest to notes', () => {
      expect(got.notes.split('\n').filter(Boolean)).toEqual(want.notes ?? []);
    });
  });
});
