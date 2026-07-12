// Sample content seeded on first launch (SPEC.md §5.20). Pure data + a builder
// that maps the active UI language to a localized cookbook and a single, fully
// filled-in showcase recipe (beer-batter pancakes). No native or DB imports —
// the seed writer (db/seed.ts) turns this into real, editable/deletable user
// data and attaches the bundled photo.
//
// Invariants mirror the recipe form rules (SPEC.md §5.5): the only required
// field is the title; numeric fields are an integer >= 1 or null (never NaN);
// the photo is attached by the DB layer, so the pure builder always leaves
// imagePath null and never seeds to-try. EN and PL stay in lockstep (same
// nullness pattern) so translations don't drift.
import type { Language } from './i18n';

/** A ready-to-save sample recipe, shaped like the recipe form's output. */
export type SeedRecipe = {
  title: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  ingredients: string;
  instructions: string;
  notes: string | null;
  imagePath: null;
  toTry: 0;
};

/** A localized sample cookbook plus its recipes. */
export type SeedContent = {
  cookbook: { name: string };
  recipes: SeedRecipe[];
};

const CONTENT: Record<Language, SeedContent> = {
  en: {
    cookbook: { name: 'Breakfasts' },
    recipes: [
      {
        title: 'Pancakes',
        // The batter chills for an hour — that step lives in the instructions,
        // not the numeric fields (which are hands-on prep and frying time).
        prepTime: 20,
        cookTime: 30,
        servings: 4,
        ingredients: [
          '- 250 g sifted wheat flour',
          '- 4 large tbsp sugar',
          '- A big pinch of salt',
          '- 3 eggs',
          '- 250 ml milk',
          '- 250 ml beer',
          '- 40 g butter',
        ].join('\n'),
        instructions: [
          '1. Get all the ingredients ready.',
          '2. Combine the flour thoroughly with the rest of the dry ingredients and stir with a spoon.',
          '3. In a second bowl, beat the eggs with a fork until smooth.',
          '4. Make a well in the dry ingredients and pour the eggs into the middle.',
          '5. Then pour in the 250 ml of beer and the milk. The beer is what makes the pancakes fluffy.',
          '6. Mix everything again with the fork, then whisk it all well at the end until smooth.',
          '7. Cover the batter with cling film and put it in the fridge for 1 hour.',
          '8. Meanwhile, melt the butter and let it cool. Stir it into the batter just before frying, then you can start.',
          '9. Frying: the right pan temperature is everything — when it lightly smokes, you can pour the batter. Ladle in one scoop and spread it out.',
          '10. The first pancake is usually a throwaway, because it sticks. Slowly peel the edges away and flip it to the other side.',
          '11. At the ideal temperature the pancake browns evenly. Once off the pan, set it on a plate and cover with a second plate.',
        ].join('\n'),
        notes: 'This is a sample recipe — feel free to edit or delete it.',
        imagePath: null,
        toTry: 0,
      },
    ],
  },
  pl: {
    cookbook: { name: 'Śniadania' },
    recipes: [
      {
        title: 'Naleśniki',
        prepTime: 20,
        cookTime: 30,
        servings: 4,
        ingredients: [
          '- 250 g przesianej mąki pszennej',
          '- 4 duże łyżki cukru',
          '- Duża szczypta soli',
          '- 3 jajka',
          '- 250 ml mleka',
          '- 250 ml piwa',
          '- 40 g masła',
        ].join('\n'),
        instructions: [
          '1. Przygotuj wszystkie składniki.',
          '2. Mąkę dokładnie połącz z resztą sypkich składników i wymieszaj przy pomocy łyżki.',
          '3. W drugiej misce wymieszaj jajka za pomocą widelca do uzyskania jednolitej konsystencji.',
          '4. W suchych składnikach zrób wgłębienie i wlej do środka jajka.',
          '5. Następnie wlej 250 ml piwa i mleko. Naleśniki będą puszyste dzięki dodatkowi piwa.',
          '6. Tak przygotowane składniki ponownie wymieszaj widelcem, a na koniec wszystko dokładnie ubij trzepaczką.',
          '7. Masę przykryj folią spożywczą i włóż na 1 godzinę do lodówki.',
          '8. W tym czasie rozpuść i przestudź masło. Dodaj je przed usmażeniem naleśników i dokładnie wymieszaj — możesz przejść do smażenia.',
          '9. Smażenie: najważniejsza jest idealna temperatura patelni — jeśli delikatnie dymi, można nalewać ciasto. Jedną chochlę wlej i rozprowadź.',
          '10. Pierwszy naleśnik zazwyczaj jest do wyrzucenia, bo przywiera. Powoli odklej brzegi i przewróć na drugą stronę.',
          '11. Przy idealnej temperaturze naleśnik będzie miał równomierny kolor. Po zdjęciu z patelni połóż go na talerzu i przykryj drugim talerzem.',
        ].join('\n'),
        notes: 'To przykładowy przepis — możesz go edytować lub usunąć.',
        imagePath: null,
        toTry: 0,
      },
    ],
  },
};

/** Returns the localized sample cookbook and recipe for the given language. */
export function buildSeedContent(language: Language): SeedContent {
  return CONTENT[language];
}
